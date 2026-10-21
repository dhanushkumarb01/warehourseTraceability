"""
Cancelled-vehicle rule.

    IF   the WMS reports a CANCELLED vehicle that is still carrying material
    AND  a vehicle is currently detected in this camera's view
    THEN raise a CANCELLED_VEHICLE alert (referencing the vehicle number)

Pure business policy. It reuses the existing VehicleDetector + VehicleTracker for
PRESENCE, and takes vehicle IDENTITY + status from the backend: the worker injects
the cancelled-vehicle watchlist (vehicle number, status, material-loaded, dispatch
status) into this rule's config, so the rule "queries the backend" without doing
any I/O itself and without any new AI model. (Plate-level ANPR is a future add;
identity here comes from the warehouse system, as the spec intends.)

Per-vehicle-number de-duplication: each cancelled vehicle alerts once while it
remains on the watchlist; the existing camera+type cooldown rate-limits further.
"""

from __future__ import annotations

from rules.base_rule import BaseRule, RuleContext, RuleResult


class CancelledVehicleRule(BaseRule):
    name = "cancelled_vehicle"

    def __init__(self) -> None:
        self._fired_numbers: set[str] = set()

    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        cfg = ctx.configs.get("cancelledVehicle", {}) or {}
        watchlist = cfg.get("cancelledVehicles", []) or []
        # Only cancelled vehicles that are actually carrying material are a risk.
        offenders = [
            v for v in watchlist
            if str(v.get("status", "")).upper() == "CANCELLED" and v.get("materialLoaded")
        ]
        if not offenders:
            self._fired_numbers.clear()
            return None

        # Presence: a vehicle must be visible on this camera right now.
        vehicle = ctx.detections.get("vehicle")
        tracks = ctx.tracks or []
        min_conf = float(cfg.get("minConfidence", 0.4))
        visible = [t for t in tracks if float(t.get("confidence", 0)) >= min_conf]
        if not visible and (vehicle is None or not vehicle.detected):
            return None

        # Forget watchlist entries that are no longer cancelled so they can alert
        # again if re-flagged later.
        active_numbers = {str(v.get("vehicleNumber")) for v in offenders}
        self._fired_numbers &= active_numbers

        pending = [v for v in offenders if str(v.get("vehicleNumber")) not in self._fired_numbers]
        if not pending:
            return None

        target = pending[0]
        number = str(target.get("vehicleNumber"))
        self._fired_numbers.add(number)

        # Best available detection evidence (bbox + confidence) for the snapshot.
        best = max(visible, key=lambda t: float(t.get("confidence", 0))) if visible else None
        confidence = best.get("confidence") if best else (vehicle.details.get("topConfidence") if vehicle else None)
        bbox = best.get("bbox") if best else (vehicle.regions[0] if (vehicle and vehicle.regions) else None)

        location = ctx.camera.get("location", "the yard")
        camera_name = ctx.camera.get("cameraName", "camera")
        severity = str(cfg.get("severity", "HIGH")).upper()

        return RuleResult(
            rule=self.name,
            alert_type="CANCELLED_VEHICLE",
            detector="vehicle",
            severity=severity,
            message=f"Cancelled vehicle {number} detected carrying material in {location} ({camera_name}).",
            details={
                "vehicleNumber": number,
                "dispatchNumber": target.get("dispatchNumber"),
                "dispatchStatus": target.get("dispatchStatus"),
                "materialLoaded": bool(target.get("materialLoaded")),
                "confidence": confidence,
                "bbox": list(bbox) if bbox else None,
                "regions": [tuple(bbox)] if bbox else [],
            },
        )
