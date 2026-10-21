"""
SpeedEstimator — camera-calibrated speed from a tracker's motion history.

Pipeline: pixel displacement (from the tracker) → metres (pixels ÷
pixels-per-meter calibration) → speed (metres ÷ seconds) → km/h. A per-vehicle
exponential moving average smooths frame-to-frame noise. Purely a conversion
module — it holds no business policy (the speed limit lives in the rule/config).

Calibration note: ``pixels_per_meter`` is measured on the PROCESSED frame (the
same width the pipeline feeds detectors), so it stays valid regardless of the
camera's native resolution.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


class SpeedEstimator:
    def __init__(self, pixels_per_meter: float = 10.0, smoothing: float = 0.5, max_plausible_kmh: float = 200.0):
        self._ppm = max(float(pixels_per_meter), 0.0001)
        self._alpha = min(max(float(smoothing), 0.0), 1.0)
        self._max_plausible = float(max_plausible_kmh)
        self._ema: dict[int, float] = {}

    def annotate(self, tracks: list[dict[str, Any]], now: datetime) -> None:
        """Attach ``speedKmh`` (and ``speedMps``) to each track dict in place."""
        live_ids = set()
        for t in tracks:
            live_ids.add(t["id"])
            kmh = self._instantaneous_kmh(t)
            if kmh is None:
                t["speedKmh"] = self._ema.get(t["id"])
                continue
            prev = self._ema.get(t["id"])
            smoothed = kmh if prev is None else (self._alpha * kmh + (1 - self._alpha) * prev)
            self._ema[t["id"]] = smoothed
            t["speedKmh"] = round(smoothed, 1)
            t["speedMps"] = round(smoothed / 3.6, 2)
        # Forget vehicles that are no longer tracked.
        for vid in [v for v in self._ema if v not in live_ids]:
            self._ema.pop(vid, None)

    def _instantaneous_kmh(self, track: dict[str, Any]):
        prev_ts = track.get("prevTimestamp")
        ts = track.get("timestamp")
        if prev_ts is None or ts is None:
            return None
        dt = (ts - prev_ts).total_seconds()
        if dt <= 0:
            return None
        meters = float(track.get("distancePx", 0.0)) / self._ppm
        kmh = (meters / dt) * 3.6
        if kmh > self._max_plausible:      # reject calibration/matching glitches
            return None
        return kmh

    def reset(self) -> None:
        self._ema.clear()
