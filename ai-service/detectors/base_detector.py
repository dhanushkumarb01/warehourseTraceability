"""
Detector abstraction — the common contract every AI detector implements.

A detector receives a video frame and returns a :class:`DetectionResult`. This is
the seam that makes the surveillance platform extensible: future use cases
(intrusion, face, vehicle, over-speed, …) implement this same interface and are
dropped into the pipeline alongside motion with no core changes.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DetectionResult:
    """Outcome of running one detector on one frame."""

    detector: str
    detected: bool
    # The alert type this detector would raise (a hint for rules).
    alert_type: str = "OTHER"
    # Detector-specific structured evidence (areas, boxes, confidence, speed…).
    details: dict[str, Any] = field(default_factory=dict)
    # Optional regions of interest as (x, y, w, h) for snapshot annotation.
    regions: list[tuple[int, int, int, int]] = field(default_factory=list)


class BaseDetector(abc.ABC):
    """Base class for all detectors."""

    #: short, stable identifier used as the key in the rule-engine context
    name: str = "base"

    @abc.abstractmethod
    def process(self, frame) -> DetectionResult:
        """Analyse a single frame and return a :class:`DetectionResult`."""

    def reset(self) -> None:
        """Reset any internal state (e.g. on reconnect). Optional."""
