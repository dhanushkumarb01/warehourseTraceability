"""
Rule abstraction — the generic decision unit of the surveillance platform.

A rule inspects a :class:`RuleContext` (detector outputs + camera + config + time)
and either returns a :class:`RuleResult` (raise this alert) or ``None`` (nothing
to do). Business policy lives in rules, never in detectors or the pipeline, so
new use cases are added by writing a new rule — existing code is untouched.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from detectors.base_detector import DetectionResult


@dataclass
class RuleContext:
    """Everything a rule needs to make a decision.

    ``config`` carries the primary feature config (kept for backward
    compatibility with the motion rule). ``configs`` holds every per-feature
    config keyed by feature name (e.g. "motion", "wallIntrusion"), and ``zones``
    holds the camera's configured surveillance zones. New rules read their own
    section from ``configs`` / ``zones`` so detectors and rules stay decoupled.
    """

    camera: dict[str, Any]
    detections: dict[str, DetectionResult]
    config: dict[str, Any]
    now: datetime
    configs: dict[str, Any] = field(default_factory=dict)
    zones: list[Any] = field(default_factory=list)
    # Tracked objects (e.g. vehicles) with motion/speed, produced by the
    # pipeline's tracking stage. Empty unless a tracking-based rule is active.
    tracks: list[Any] = field(default_factory=list)


@dataclass
class RuleResult:
    """A fired rule — the instruction to raise an alert."""

    rule: str
    alert_type: str
    detector: str
    severity: str = "MEDIUM"
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)


class BaseRule(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def evaluate(self, ctx: RuleContext) -> RuleResult | None:
        """Return a RuleResult to raise an alert, or None."""
