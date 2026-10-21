"""
Operational-hours helper.

Determines whether the warehouse is within its configured operational window.
Motion alarming arms OUTSIDE this window (the "warehouse closed" condition).
Handles overnight windows (e.g. 20:00 → 06:00) and a configurable set of days.
"""

from __future__ import annotations

from datetime import datetime, time
from typing import Any


def _parse_hhmm(value: str, fallback: time) -> time:
    try:
        h, m = str(value).split(":")
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        return fallback


def is_operational(now: datetime, operational_hours: dict[str, Any]) -> bool:
    """True if ``now`` falls inside the operational window (warehouse open)."""
    oh = operational_hours or {}
    days = oh.get("days", [0, 1, 2, 3, 4, 5, 6])
    # Python weekday(): Mon=0 … Sun=6. The platform uses Sun=0 … Sat=6, so map.
    weekday_sun0 = (now.weekday() + 1) % 7
    if days and weekday_sun0 not in days:
        return False

    start = _parse_hhmm(oh.get("start", "08:00"), time(8, 0))
    end = _parse_hhmm(oh.get("end", "20:00"), time(20, 0))
    current = now.time()

    if start <= end:
        return start <= current < end
    # Overnight window (e.g. 20:00–06:00): operational if before end or after start.
    return current >= start or current < end


def is_armed(now: datetime, config: dict[str, Any]) -> bool:
    """Whether motion alarming is armed for the given config at ``now``."""
    armed = (config or {}).get("armed", "non_operational")
    if armed == "always":
        return True
    # 'non_operational' → armed only when the warehouse is closed.
    return not is_operational(now, (config or {}).get("operationalHours", {}))
