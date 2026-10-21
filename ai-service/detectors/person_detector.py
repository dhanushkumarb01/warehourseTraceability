"""
Person detector — pre-trained YOLO person detection.

A reusable, single-responsibility detector: it finds people in a frame and
returns their boxes/confidence. It does NOT know about boundaries, intrusion or
any business rule — that lives in the rules layer. Future person-based use cases
(Driver PPE, Face Detection, Man-Inside-Wagon, Loading-Area Movement) reuse this
exact detector and add only a new rule.

Uses a pre-trained Ultralytics YOLO model (COCO class 0 = person). No training,
no fine-tuning. The model is loaded lazily and the detector degrades gracefully
(logs once, returns no detections) if the model/library is unavailable, so the
pipeline never crashes — motion and other detectors keep running.
"""

from __future__ import annotations

from typing import Any

from detectors.base_detector import BaseDetector, DetectionResult
from zones.zone import foot_point
from utils.logger import get_logger

log = get_logger("person")

# COCO class index for "person".
_PERSON_CLASS = 0


class PersonDetector(BaseDetector):
    name = "person"

    def __init__(self, model_path: str = "yolov8n.pt", min_confidence: float = 0.4, imgsz: int = 640):
        self._model_path = model_path
        self._min_confidence = float(min_confidence)
        self._imgsz = int(imgsz)
        self._model = None
        self._load_attempted = False
        self._warned = False

    def _ensure_model(self) -> bool:
        """Lazy-load the YOLO model on first use. Returns availability."""
        if self._model is not None:
            return True
        if self._load_attempted:
            return False
        self._load_attempted = True
        try:
            from ultralytics import YOLO  # imported lazily so the worker runs without it

            self._model = YOLO(self._model_path)
            log.info("Loaded YOLO person model '%s'", self._model_path)
            return True
        except Exception as exc:  # missing lib / weights / runtime error
            log.warning("Person detection unavailable (%s). Install 'ultralytics' and provide '%s'.",
                        exc, self._model_path)
            return False

    def reset(self) -> None:
        # The model is stateless across frames; nothing to reset.
        pass

    def process(self, frame) -> DetectionResult:
        height, width = frame.shape[:2]
        frame_size = f"{width}x{height}"

        if not self._ensure_model():
            if not self._warned:
                log.warning("Skipping person detection — model not loaded.")
                self._warned = True
            return DetectionResult(detector=self.name, detected=False, alert_type="OTHER",
                                   details={"persons": [], "count": 0, "frameSize": frame_size, "available": False})

        persons: list[dict[str, Any]] = []
        regions: list[tuple[int, int, int, int]] = []
        try:
            results = self._model.predict(frame, classes=[_PERSON_CLASS], conf=self._min_confidence,
                                          imgsz=self._imgsz, verbose=False)
            for result in results:
                boxes = getattr(result, "boxes", None)
                if boxes is None:
                    continue
                for box in boxes:
                    conf = float(box.conf[0]) if box.conf is not None else 0.0
                    if conf < self._min_confidence:
                        continue
                    x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                    bx, by, bw, bh = int(x1), int(y1), int(x2 - x1), int(y2 - y1)
                    fx, fy = foot_point((bx, by, bw, bh))
                    persons.append({
                        "id": len(persons) + 1,            # lightweight per-frame id
                        "bbox": [bx, by, bw, bh],
                        "confidence": round(conf, 3),
                        "foot": [round(fx, 1), round(fy, 1)],
                    })
                    regions.append((bx, by, bw, bh))
        except Exception as exc:
            log.error("Person detection error: %s", exc)
            return DetectionResult(detector=self.name, detected=False, alert_type="OTHER",
                                   details={"persons": [], "count": 0, "frameSize": frame_size, "available": True})

        top_conf = max((p["confidence"] for p in persons), default=0.0)
        return DetectionResult(
            detector=self.name,
            detected=len(persons) > 0,
            alert_type="OTHER",  # neutral — the rule decides what to raise
            details={
                "persons": persons,
                "count": len(persons),
                "topConfidence": top_conf,
                "frameSize": frame_size,
                "frameWidth": width,
                "frameHeight": height,
                "available": True,
            },
            regions=regions[:20],
        )
