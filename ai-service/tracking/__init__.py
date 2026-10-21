"""
Object tracking: reusable multi-frame identity tracking.

The tracker maintains stable IDs for detected objects across frames and tolerates
brief occlusion. It is detector-agnostic (fed a list of boxes) so any future
use case — geo-fence, cancelled vehicle, vehicle analytics — reuses it unchanged.
"""

from tracking.vehicle_tracker import VehicleTracker, Track

__all__ = ["VehicleTracker", "Track"]
