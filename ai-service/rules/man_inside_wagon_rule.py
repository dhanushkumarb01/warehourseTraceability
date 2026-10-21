"""
Man-inside-wagon rule.

    IF   a person is detected
    AND  the person's ground point is inside a configured wagon zone
    AND  the person remains inside for at least the configured minimum duration
         (detected consistently throughout)
    THEN raise a MAN_INSIDE_WAGON alert

Pure business policy. It reuses the existing PersonDetector output and the
camera's configured WAGON_ZONE polygons — no new detector, no new geometry.

False-positive control: a person who merely passes near or briefly crosses the
wagon does not trigger. A lightweight per-camera dwell tracker (this rule
instance is per pipeline) requires the person to stay inside for
``minDurationSec`` with consistent detection; a detection gap resets the dwell
timer. The architecture stays compatible with a future tracker (swap the
nearest-point matching for persistent IDs).
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from rules.base_rule import BaseRule, RuleContext, RuleResult

_WAGON_TYPES = {"WAGON_ZONE", "WAGON"}


class ManInsideWagonRule(BaseRule):
    name = "man_inside_wagon"

    def __init__(self) -> None:
        # Active dwell tracks: {point, firstInsideAt, lastSeenAt, fired, person}
        self._tracks: list[dict[str, Any]] = []

    def _wagon_zones(self, ctx: RuleContext):
        cfg = ctx.configs.get("manInsideWagon", {}) or {}
        wanted = set(cfg.get("zoneIds", []) or [])
        zones = ctx.zones or []
        if wanted:
            selected = [z for z in zones if z.id in wanted]
            if selected:
                return selected
        return [z for z in zones if str(getattr(z, "zone_type", "")).upper() in _WAGON_TYPES]

    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        cfg = ctx.configs.get("manInsideWagon", {}) or {}
        person = ctx.detections.get("person")
        if person is None:
            return None

        zones = self._wagon_zones(ctx)
        if not zones:
            return None  # no wagon zone configured for this camera

        details = person.details or {}
        frame_w = int(details.get("frameWidth", 0))
        frame_h = int(details.get("frameHeight", 0))
        frame_size = (frame_w, frame_h)
        persons = details.get("persons", []) or []
        min_conf = float(cfg.get("minConfidence", 0.4))
        min_duration = float(cfg.get("minDurationSec", 2.5))
        max_gap = float(cfg.get("maxGapSec", 1.5))
        now: datetime = ctx.now
        threshold = max(frame_w * 0.08, 24.0) if frame_w else 40.0

        # Persons currently inside a wagon zone.
        inside = []
        for p in persons:
            if float(p.get("confidence", 0)) < min_conf:
                continue
            foot = p.get("foot") or [None, None]
            if foot[0] is None:
                continue
            point = (float(foot[0]), float(foot[1]))
            if any(z.contains(point, frame_size) for z in zones):
                inside.append({"point": point, "person": p})

        # Drop stale tracks (person no longer detected inside — gap exceeded).
        self._tracks = [t for t in self._tracks if (now - t["lastSeenAt"]).total_seconds() <= max_gap]

        # Match each inside person to an existing track, or start a new one.
        for det in inside:
            track = self._match(det["point"], threshold)
            if track is None:
                self._tracks.append({"point": det["point"], "firstInsideAt": now, "lastSeenAt": now, "fired": False, "person": det["person"]})
            else:
                track["point"] = det["point"]
                track["lastSeenAt"] = now
                track["person"] = det["person"]

        # Fire for the longest-dwelling track that has met the duration and not yet fired.
        ready = [t for t in self._tracks
                 if not t["fired"] and (now - t["firstInsideAt"]).total_seconds() >= min_duration]
        if not ready:
            return None
        track = max(ready, key=lambda t: (now - t["firstInsideAt"]).total_seconds())
        track["fired"] = True

        p = track["person"]
        dwell = round((now - track["firstInsideAt"]).total_seconds(), 1)
        zone = zones[0]
        camera_name = ctx.camera.get("cameraName", "camera")
        location = ctx.camera.get("location", "wagon area")
        severity = str(cfg.get("severity", "HIGH")).upper()

        return RuleResult(
            rule=self.name,
            alert_type="MAN_INSIDE_WAGON",
            detector="person",
            severity=severity,
            message=f"Man inside wagon: a person has been inside the wagon at {location} for {dwell}s ({camera_name}).",
            details={
                "zone": getattr(zone, "name", "Wagon Zone"),
                "zoneType": getattr(zone, "zone_type", "WAGON_ZONE"),
                "confidence": p.get("confidence"),
                "bbox": p.get("bbox"),
                "foot": p.get("foot"),
                "dwellSeconds": dwell,
                "minDurationSec": min_duration,
                "frameSize": details.get("frameSize"),
                "regions": [tuple(p.get("bbox"))] if p.get("bbox") else [],
            },
        )

    def _match(self, point: tuple[float, float], threshold: float):
        best = None
        best_dist = threshold
        for t in self._tracks:
            d = math.dist(point, t["point"])
            if d <= best_dist:
                best, best_dist = t, d
        return best
