"""
Face-detection rule.

    IF   an UNKNOWN face is detected (a face that matches no registered employee)
    THEN raise a FACE_DETECTION alert

Pure business policy. Recognition (embedding + gallery match + threshold) lives
in the FaceDetector; this rule only reads the recognised/unknown flags. Known
employees never generate an alert.

De-duplication: the rule fires once per continuous appearance of unknown faces
(a debounce that resets when no unknown face is present) and relies on the
existing camera+type cooldown to rate-limit — so a lingering unknown person does
not alert every frame.
"""

from __future__ import annotations

from rules.base_rule import BaseRule, RuleContext, RuleResult


class FaceDetectionRule(BaseRule):
    name = "face_detection"

    def __init__(self) -> None:
        self._armed = True  # becomes False after firing, re-arms when no unknown present

    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        cfg = ctx.configs.get("faceDetection", {}) or {}
        face = ctx.detections.get("face")
        if face is None:
            return None

        faces = (face.details or {}).get("faces", []) or []
        unknowns = [f for f in faces if not f.get("recognized")]

        if not unknowns:
            # No unknown faces in view — re-arm so the next new appearance alerts.
            self._armed = True
            return None
        if not self._armed:
            return None
        self._armed = False

        # Most confident unknown face is the evidence subject.
        subject = max(unknowns, key=lambda f: float(f.get("detScore") or 0))
        recognized_names = [f.get("employeeName") for f in faces if f.get("recognized")]
        location = ctx.camera.get("location", "the monitored area")
        camera_name = ctx.camera.get("cameraName", "camera")
        severity = str(cfg.get("severity", "HIGH")).upper()

        return RuleResult(
            rule=self.name,
            alert_type="FACE_DETECTION",
            detector="face",
            severity=severity,
            message=f"Unknown person detected at {location} ({camera_name}).",
            details={
                "recognized": False,
                "label": "Unknown Person",
                "confidence": subject.get("detScore"),
                "similarity": subject.get("similarity"),
                "bbox": subject.get("bbox"),
                "unknownCount": len(unknowns),
                "recognizedCount": len(faces) - len(unknowns),
                "recognizedEmployees": [n for n in recognized_names if n],
                "regions": [tuple(subject.get("bbox"))] if subject.get("bbox") else [],
            },
        )
