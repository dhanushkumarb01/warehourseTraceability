"""
Zone geometry — a normalised polygon region with point-containment.

Polygons are stored as normalised coordinates (each x, y in 0–1) so the same
zone definition works at any capture resolution. ``contains`` accepts a pixel
point plus the frame size and normalises internally. This module is pure
geometry — no detection, no business policy — so it is reusable by any zone-based
use case (boundary, restricted area, parking, loading, weighbridge, wagon).
"""

from __future__ import annotations

from typing import Any, Sequence


def _point_in_polygon(x: float, y: float, polygon: Sequence[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test (works in any consistent coordinate space)."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def foot_point(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    """Ground-contact point of a person box (bottom-centre): (x, y) in pixels."""
    x, y, w, h = bbox
    return (x + w / 2.0, y + h)


class Zone:
    """A named, normalised polygon region on a camera view."""

    def __init__(self, zone_id: str, name: str, zone_type: str, polygon_norm: Sequence[Sequence[float]]):
        self.id = zone_id
        self.name = name
        self.zone_type = zone_type
        # normalise/clamp defensively
        self.polygon: list[tuple[float, float]] = [
            (float(p[0]), float(p[1])) for p in polygon_norm if p is not None and len(p) >= 2
        ]

    @property
    def is_valid(self) -> bool:
        return len(self.polygon) >= 3

    def contains(self, point_px: tuple[float, float], frame_size: tuple[int, int]) -> bool:
        """True if a pixel point lies inside this zone for the given frame size."""
        w, h = frame_size
        if not self.is_valid or not w or not h:
            return False
        nx, ny = point_px[0] / float(w), point_px[1] / float(h)
        return _point_in_polygon(nx, ny, self.polygon)

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "type": self.zone_type, "polygon": [list(p) for p in self.polygon]}


def zones_from_config(zone_configs: Any) -> list[Zone]:
    """Build Zone objects from the per-camera zone config list."""
    zones: list[Zone] = []
    for z in zone_configs or []:
        try:
            zones.append(Zone(
                zone_id=str(z.get("id", z.get("name", "zone"))),
                name=str(z.get("name", "Zone")),
                zone_type=str(z.get("type", "RESTRICTED")),
                polygon_norm=z.get("polygon", []),
            ))
        except Exception:
            continue
    return [z for z in zones if z.is_valid]
