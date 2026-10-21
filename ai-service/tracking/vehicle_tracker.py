"""
VehicleTracker — a lightweight, dependency-free multi-object tracker.

Maintains a unique, stable ID for each vehicle across frames using greedy
IoU + centroid matching (a simplified SORT, no Kalman/deep features — fast and
sufficient for warehouse yard speeds). Identity survives brief occlusion because
an unmatched track is kept alive for ``max_age`` frames and re-attached when the
vehicle reappears nearby.

Detector-agnostic: it is fed a list of boxes and knows nothing about vehicles
specifically, so future tracking use cases reuse it unchanged. It exposes, per
object: ID, current position, previous position, timestamp (and previous
timestamp) and distance travelled — everything the speed estimator needs.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


def _centroid(bbox) -> tuple[float, float]:
    x, y, w, h = bbox
    return (x + w / 2.0, y + h / 2.0)


def _iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ax2, ay2, bx2, by2 = ax + aw, ay + ah, bx + bw, by + bh
    ix1, iy1 = max(ax, bx), max(ay, by)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


class Track:
    """A single tracked object with identity and motion history."""

    __slots__ = ("id", "vclass", "bbox", "confidence", "position", "prev_position",
                 "timestamp", "prev_timestamp", "distance_px", "age", "hits")

    def __init__(self, track_id: int, det: dict[str, Any], now: datetime):
        self.id = track_id
        self.vclass = det.get("class", "vehicle")
        self.bbox = list(det["bbox"])
        self.confidence = det.get("confidence", 0.0)
        self.position = _centroid(self.bbox)
        self.prev_position: Optional[tuple[float, float]] = None
        self.timestamp = now
        self.prev_timestamp: Optional[datetime] = None
        self.distance_px = 0.0
        self.age = 0     # frames since last match (occlusion tolerance)
        self.hits = 1    # total matched frames

    def update(self, det: dict[str, Any], now: datetime) -> None:
        self.prev_position = self.position
        self.prev_timestamp = self.timestamp
        self.bbox = list(det["bbox"])
        self.vclass = det.get("class", self.vclass)
        self.confidence = det.get("confidence", self.confidence)
        self.position = _centroid(self.bbox)
        self.distance_px = _dist(self.position, self.prev_position)
        self.timestamp = now
        self.age = 0
        self.hits += 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "class": self.vclass,
            "bbox": self.bbox,
            "confidence": self.confidence,
            "position": [round(self.position[0], 1), round(self.position[1], 1)],
            "prevPosition": [round(self.prev_position[0], 1), round(self.prev_position[1], 1)] if self.prev_position else None,
            "timestamp": self.timestamp,
            "prevTimestamp": self.prev_timestamp,
            "distancePx": round(self.distance_px, 2),
            "hits": self.hits,
        }


class VehicleTracker:
    def __init__(self, max_age: int = 15, iou_threshold: float = 0.2, max_center_dist: float = 120.0):
        self._tracks: list[Track] = []
        self._next_id = 1
        self._max_age = int(max_age)
        self._iou_threshold = float(iou_threshold)
        self._max_center_dist = float(max_center_dist)

    def update(self, detections: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
        """Match detections to tracks, spawn/age tracks, and return visible tracks."""
        unmatched_dets = list(range(len(detections)))
        # Age all tracks by one frame; matching resets it to 0.
        for t in self._tracks:
            t.age += 1

        # Greedy match: for each track, pick the best-scoring unmatched detection.
        for t in sorted(self._tracks, key=lambda x: x.hits, reverse=True):
            best_i, best_score = -1, 0.0
            for i in unmatched_dets:
                det = detections[i]
                score = _iou(t.bbox, det["bbox"])
                if score < self._iou_threshold:
                    # fall back to centroid proximity (helps after occlusion)
                    if _dist(_centroid(t.bbox), _centroid(det["bbox"])) <= self._max_center_dist:
                        score = max(score, 0.01)
                if score > best_score:
                    best_score, best_i = score, i
            if best_i >= 0:
                t.update(detections[best_i], now)
                unmatched_dets.remove(best_i)

        # New tracks for unmatched detections.
        for i in unmatched_dets:
            self._tracks.append(Track(self._next_id, detections[i], now))
            self._next_id += 1

        # Drop tracks unseen for too long (occlusion window exceeded).
        self._tracks = [t for t in self._tracks if t.age <= self._max_age]

        # Return only currently-visible tracks (matched this frame).
        return [t.to_dict() for t in self._tracks if t.age == 0]

    @property
    def active_count(self) -> int:
        return sum(1 for t in self._tracks if t.age == 0)

    def reset(self) -> None:
        self._tracks = []
