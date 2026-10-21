"""
Alert reporter.

Translates a fired :class:`RuleResult` + snapshot into the backend ingest
payload and posts it. Applies a local cooldown per camera+alert-type as a first
line of de-duplication (the backend enforces the authoritative cooldown too), so
a continuously-moving subject produces one alert, not hundreds.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

from rules.base_rule import RuleResult
from utils.api_client import ApiClient
from utils.logger import get_logger

log = get_logger("reporter")


class AlertReporter:
    def __init__(self, api: ApiClient):
        self._api = api
        self._last_sent: dict[str, float] = {}

    def _key(self, camera_id: str, alert_type: str) -> str:
        return f"{camera_id}:{alert_type}"

    def report(self, camera_id: str, result: RuleResult, snapshot_b64: Optional[str], cooldown_sec: float) -> bool:
        """Report an alert unless within the local cooldown window. Returns sent?"""
        key = self._key(camera_id, result.alert_type)
        now = time.monotonic()
        last = self._last_sent.get(key)
        if last is not None and (now - last) < cooldown_sec:
            return False
        self._last_sent[key] = now

        payload = {
            "cameraId": camera_id,
            "alertType": result.alert_type,
            "detectorType": result.detector,
            "severity": result.severity,
            "message": result.message,
            "detectionDetails": result.details,
            "detectedAt": datetime.now(timezone.utc).isoformat(),
            "cooldownSec": int(cooldown_sec),
        }
        if snapshot_b64:
            payload["snapshotBase64"] = snapshot_b64

        outcome = self._api.report_alert(payload)
        if outcome is not None:
            log.info("Alert reported: %s on camera %s", result.alert_type, camera_id)
            return True
        return False
