"""
Motion detector — lightweight OpenCV background-subtraction.

Deliberately simple and fast (no model training, no inference): a MOG2 background
model adapts to the static scene, and significant foreground change above a
configurable area threshold is reported as motion. It is designed to coexist
with future object-detection models — it implements the same
:class:`BaseDetector` contract, so a pipeline can run it alongside others.

Sensitivity maps to the background-model variance threshold; ``min_area_percent``
gates out small noise (leaves, light flicker) so only meaningful movement —
e.g. a person entering a closed warehouse — triggers.
"""

from __future__ import annotations

import cv2
import numpy as np

from detectors.base_detector import BaseDetector, DetectionResult

# sensitivity → MOG2 variance threshold (lower = more sensitive)
_VAR_THRESHOLD = {"low": 40, "medium": 25, "high": 16}


class MotionDetector(BaseDetector):
    name = "motion"

    def __init__(self, sensitivity: str = "medium", min_area_percent: float = 1.5, warmup_frames: int = 15):
        self._sensitivity = sensitivity if sensitivity in _VAR_THRESHOLD else "medium"
        self._min_area_percent = float(min_area_percent)
        self._warmup_frames = int(warmup_frames)
        self._frames_seen = 0
        self._bg = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=_VAR_THRESHOLD[self._sensitivity], detectShadows=True
        )
        self._kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def reset(self) -> None:
        self._frames_seen = 0
        self._bg = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=_VAR_THRESHOLD[self._sensitivity], detectShadows=True
        )

    def process(self, frame) -> DetectionResult:
        self._frames_seen += 1

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        mask = self._bg.apply(gray)

        # Drop MOG2 "shadow" pixels (value 127) — keep only hard foreground.
        _, mask = cv2.threshold(mask, 200, 255, cv2.THRESH_BINARY)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self._kernel)
        mask = cv2.dilate(mask, self._kernel, iterations=2)

        height, width = mask.shape[:2]
        frame_area = float(height * width) or 1.0

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        changed_area = 0.0
        regions: list[tuple[int, int, int, int]] = []
        # ignore specks below 0.05% of the frame
        min_contour = frame_area * 0.0005
        for c in contours:
            area = cv2.contourArea(c)
            if area < min_contour:
                continue
            changed_area += area
            x, y, w, h = cv2.boundingRect(c)
            regions.append((int(x), int(y), int(w), int(h)))

        area_percent = round((changed_area / frame_area) * 100.0, 3)

        # Suppress detections while the background model is still stabilising.
        warming = self._frames_seen <= self._warmup_frames
        detected = (not warming) and area_percent >= self._min_area_percent

        return DetectionResult(
            detector=self.name,
            detected=bool(detected),
            alert_type="MOTION",
            details={
                "areaPercent": area_percent,
                "minAreaPercent": self._min_area_percent,
                "sensitivity": self._sensitivity,
                "regionCount": len(regions),
                "frameSize": f"{width}x{height}",
                "warming": warming,
            },
            regions=sorted(regions, key=lambda r: r[2] * r[3], reverse=True)[:10],
        )
