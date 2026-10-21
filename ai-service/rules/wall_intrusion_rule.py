"""
Wall-intrusion rule.

    IF   a person is detected
    AND  the person crosses from outside into a restricted boundary zone
    THEN raise a WALL_INTRUSION alert

Pure business policy: it consumes the PersonDetector's output and the camera's
configured boundary zones and decides whether an intrusion occurred. All
geometry lives in the zones module; all detection lives in the detector.

Lightweight tracking (per-frame, stateful within this rule instance — one per
camera pipeline): a person counts as a fresh intrusion when their ground point
is inside a boundary zone now and was NOT inside in the previous frame. This
satisfies "did a person cross the boundary?" without full multi-object tracking,
and the architecture stays compatible with a future tracker (swap the matching
heuristic for persistent IDs).
"""

from __future__ import annotations

import math
from typing import Any

from rules.base_rule import BaseRule, RuleContext, RuleResult

_BOUNDARY_TYPES = {"BOUNDARY", "RESTRICTED", "WALL", "WALL_INTRUSION"}


class WallIntrusionRule(BaseRule):
    name = "wall_intrusion"

    def __init__(self) -> None:
        # Foot points that were inside a boundary zone in the previous frame.
        self._prev_inside: list[tuple[float, float]] = []

    def _boundary_zones(self, ctx: RuleContext):
        cfg = ctx.configs.get("wallIntrusion", {}) or {}
        wanted_ids = set(cfg.get("zoneIds", []) or [])
        zones = ctx.zones or []
        if wanted_ids:
            selected = [z for z in zones if z.id in wanted_ids]
            if selected:
                return selected
        # Fallback: any zone whose type marks it as a restricted boundary.
        return [z for z in zones if str(getattr(z, "zone_type", "")).upper() in _BOUNDARY_TYPES]

    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        cfg = ctx.configs.get("wallIntrusion", {}) or {}
        person = ctx.detections.get("person")
        if person is None:
            return None

        zones = self._boundary_zones(ctx)
        if not zones:
            return None  # no boundary configured — nothing to enforce

        details = person.details or {}
        frame_size = (int(details.get("frameWidth", 0)), int(details.get("frameHeight", 0)))
        persons = details.get("persons", []) or []
        min_conf = float(cfg.get("minConfidence", 0.4))

        # Which persons are inside a boundary zone right now?
        inside = []
        for p in persons:
            if float(p.get("confidence", 0)) < min_conf:
                continue
            fx, fy = p.get("foot", [None, None])
            if fx is None:
                continue
            if any(z.contains((fx, fy), frame_size) for z in zones):
                inside.append({"point": (float(fx), float(fy)), "person": p})

        # A fresh intrusion = inside now but not near any previously-inside point.
        threshold = max(frame_size[0] * 0.08, 24.0) if frame_size[0] else 40.0
        fresh = [it for it in inside if not self._near_previous(it["point"], threshold)]

        # Update tracking state for the next frame.
        self._prev_inside = [it["point"] for it in inside]

        if not fresh:
            return None

        # Report the highest-confidence fresh intruder.
        intruder = max(fresh, key=lambda it: float(it["person"].get("confidence", 0)))
        p = intruder["person"]
        zone = zones[0]
        camera_name = ctx.camera.get("cameraName", "camera")
        location = ctx.camera.get("location", "monitored boundary")
        severity = str(cfg.get("severity", "HIGH")).upper()

        return RuleResult(
            rule=self.name,
            alert_type="WALL_INTRUSION",
            detector="person",
            severity=severity,
            message=f"Wall intrusion: a person crossed into the restricted area at {location} ({camera_name}).",
            details={
                "zone": getattr(zone, "name", "Restricted Zone"),
                "zoneType": getattr(zone, "zone_type", "RESTRICTED"),
                "confidence": p.get("confidence"),
                "bbox": p.get("bbox"),
                "foot": p.get("foot"),
                "personsInside": len(inside),
                "frameSize": details.get("frameSize"),
                # boxes the evidence module annotates on the snapshot
                "regions": [tuple(p.get("bbox"))] if p.get("bbox") else [],
            },
        )

    def _near_previous(self, point: tuple[float, float], threshold: float) -> bool:
        for prev in self._prev_inside:
            if math.dist(point, prev) <= threshold:
                return True
        return False
