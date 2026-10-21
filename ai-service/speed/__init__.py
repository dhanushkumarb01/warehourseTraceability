"""
Speed estimation: reusable camera-calibrated speed from tracked motion.

Converts pixel displacement between frames into real-world speed using a simple
pixels-per-meter calibration, then distance ÷ time. Reused by any speed-based
use case; over-speed is the first.
"""

from speed.speed_estimator import SpeedEstimator

__all__ = ["SpeedEstimator"]
