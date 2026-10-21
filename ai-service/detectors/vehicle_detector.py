"""
Vehicle detector — pre-trained YOLO vehicle detection.

A reusable, single-responsibility detector: it finds vehicles (car / bus /
truck) in a frame and returns their boxes, confidence and class. It does NOT
track, estimate speed, or apply any business rule — those live in the tracking,
speed and rules layers. Future vehicle use cases (geo-fence, cancelled vehicle,
vehicle analytics) reuse this exact detector and add only new rules.

Uses a pre-trained Ultralytics YOLO model (COCO vehicle classes). No training,
no fine-tuning. Loaded lazily and degrades gracefully if the model/library is
unavailable, so the rest of the pipeline keeps running.
"""

from __future__ import annotations

from typing import Any

from detectors.base_detector import BaseDetector, DetectionResult
from utils.logger import get_logger

log = get_logger("vehicle")

# COCO class indices for vehicles → friendly class names.
_VEHICLE_CLASSES = {2: "car", 5: "bus", 7: "truck"}


class VehicleDetector(BaseDetector):
    name = "vehicle"

    def __init__(self, model_path: str = "yolov8n.pt", min_confidence: float = 0.4, imgsz: int = 640):
        self._model_path = model_path
        self._min_confidence = float(min_confidence)
        self._imgsz = int(imgsz)
        self._model = None
        self._load_attempted = False
        self._warned = False

    def _ensure_model(self) -> bool:
        if self._model is not None:
            return True
        if self._load_attempted:
            return False
        self._load_attempted = True
        try:
            from ultralytics import YOLO  # lazy import so the worker runs without it

            self._model = YOLO(self._model_path)
            log.info("Loaded YOLO vehicle model '%s'", self._model_path)
            return True
        except Exception as exc:
            log.warning("Vehicle detection unavailable (%s). Install 'ultralytics' and provide '%s'.",
                        exc, self._model_path)
            return False

    def reset(self) -> None:
        # Stateless across frames; nothing to reset.
        pass

    def process(self, frame) -> DetectionResult:
        height, width = frame.shape[:2]
        frame_size = f"{width}x{height}"

        if not self._ensure_model():
            if not self._warned:
                log.warning("Skipping vehicle detection — model not loaded.")
                self._warned = True
            return DetectionResult(detector=self.name, detected=False, alert_type="OTHER",
                                   details={"vehicles": [], "count": 0, "frameSize": frame_size, "available": False})

        vehicles: list[dict[str, Any]] = []
        regions: list[tuple[int, int, int, int]] = []
        classes = list(_VEHICLE_CLASSES.keys())
        try:
            results = self._model.predict(frame, classes=classes, conf=self._min_confidence,
                                          imgsz=self._imgsz, verbose=False)
            for result in results:
                boxes = getattr(result, "boxes", None)
                if boxes is None:
                    continue
                for box in boxes:
                    conf = float(box.conf[0]) if box.conf is not None else 0.0
                    if conf < self._min_confidence:
                        continue
                    cls_idx = int(box.cls[0]) if box.cls is not None else -1
                    vclass = _VEHICLE_CLASSES.get(cls_idx, "vehicle")
                    x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                    bx, by, bw, bh = int(x1), int(y1), int(x2 - x1), int(y2 - y1)
                    vehicles.append({
                        "bbox": [bx, by, bw, bh],
                        "confidence": round(conf, 3),
                        "class": vclass,
                    })
                    regions.append((bx, by, bw, bh))
        except Exception as exc:
            log.error("Vehicle detection error: %s", exc)
            return DetectionResult(detector=self.name, detected=False, alert_type="OTHER",
                                   details={"vehicles": [], "count": 0, "frameSize": frame_size, "available": True})

        return DetectionResult(
            detector=self.name,
            detected=len(vehicles) > 0,
            alert_type="OTHER",  # neutral — the rule decides what to raise
            details={
                "vehicles": vehicles,
                "count": len(vehicles),
                "frameSize": frame_size,
                "frameWidth": width,
                "frameHeight": height,
                "available": True,
            },
            regions=regions[:20],
        )
