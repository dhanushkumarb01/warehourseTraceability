"""
Motion-during-closed-hours rule.

    IF   warehouse is closed (armed)
    AND  motion is detected
    THEN raise a MOTION alert

This encodes the first surveillance use case. Adding another use case (e.g. wall
intrusion, face) means writing a sibling rule like this — the engine, detectors
and pipeline stay the same.
"""

from __future__ import annotations

from rules.base_rule import BaseRule, RuleContext, RuleResult
from rules.schedule import is_armed, is_operational


class MotionClosedRule(BaseRule):
    name = "motion_when_closed"

    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        motion = ctx.detections.get("motion")
        if motion is None or not motion.detected:
            return None
        if not is_armed(ctx.now, ctx.config):
            return None  # warehouse open / disarmed — movement is expected

        camera_name = ctx.camera.get("cameraName", "camera")
        location = ctx.camera.get("location", "monitored area")
        severity = str(ctx.config.get("severity", "MEDIUM")).upper()

        return RuleResult(
            rule=self.name,
            alert_type="MOTION",
            detector="motion",
            severity=severity,
            message=f"Motion detected at {location} during non-operational hours ({camera_name}).",
            details={
                **motion.details,
                "operational": is_operational(ctx.now, ctx.config.get("operationalHours", {})),
                "armedMode": ctx.config.get("armed", "non_operational"),
                "regions": motion.regions,
            },
        )
