"""
Configurable surveillance zones.

A zone is a named polygon region on a camera's view (boundary, restricted,
parking, loading, weighbridge, wagon, …). Zones are configured per camera and
stored normalised (0–1) so they are resolution-independent. Rules consume zones
from the rule context — the geometry never lives inside a detector.
"""

from zones.zone import Zone, zones_from_config, foot_point

__all__ = ["Zone", "zones_from_config", "foot_point"]
