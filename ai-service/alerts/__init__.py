"""Evidence capture + alert reporting to the WareTrace backend."""

from alerts.evidence import capture_snapshot
from alerts.alert_reporter import AlertReporter

__all__ = ["capture_snapshot", "AlertReporter"]
