"""
Over-speed rule.

    IF   a tracked vehicle's estimated speed exceeds the configured speed limit
    THEN raise an OVER_SPEED alert

Pure business policy. Detection lives in the VehicleDetector, identity in the
VehicleTracker, and speed in the SpeedEstimator; this rule only compares each
tracked vehicle's speed to the limit and decides whether to alert.

Per-vehicle de-duplication: each vehicle alerts once while it remains over the
limit (tracked by ID). A vehicle that leaves and returns can alert again. The
existing camera+type cooldown provides an additional rate-limit.
"""

from __future__ import annotations

from rules.base_rule import BaseRule, RuleContext, RuleResult


class OverSpeedRule(BaseRule):
    name = "over_speed"

    def __init__(self) -> None:
        self._fired_ids: set[int] = set()

    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        cfg = ctx.configs.get("overSpeed", {}) or {}
        limit = float(cfg.get("speedLimit", 20))
        tracks = ctx.tracks or []
        if not tracks:
            return None

        live_ids = {t.get("id") for t in tracks}
        # A vehicle that has left the frame may alert again if it returns.
        self._fired_ids &= live_ids

        offenders = [
            t for t in tracks
            if t.get("speedKmh") is not None and t["speedKmh"] > limit and t.get("id") not in self._fired_ids
        ]
        if not offenders:
            return None

        v = max(offenders, key=lambda t: t["speedKmh"])
        self._fired_ids.add(v["id"])

        vclass = v.get("class", "vehicle")
        speed = v["speedKmh"]
        location = ctx.camera.get("location", "monitored road")
        camera_name = ctx.camera.get("cameraName", "camera")
        severity = str(cfg.get("severity", "HIGH")).upper()

        return RuleResult(
            rule=self.name,
            alert_type="OVER_SPEED",
            detector="vehicle",
            severity=severity,
            message=f"Over-speed: {vclass} #{v['id']} at {speed} km/h (limit {int(limit)} km/h) at {location} ({camera_name}).",
            details={
                "vehicleId": v["id"],
                "vehicleClass": vclass,
                "speedKmh": speed,
                "speedLimit": limit,
                "confidence": v.get("confidence"),
                "bbox": v.get("bbox"),
                "position": v.get("position"),
                "regions": [tuple(v.get("bbox"))] if v.get("bbox") else [],
            },
        )
