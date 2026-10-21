"""
Thin HTTP client for the WareTrace backend.

The AI worker is a trusted backend component and authenticates with a shared
service token (header ``X-Service-Token``). All network failures are caught and
logged; the worker degrades gracefully (it keeps detecting and retries reporting)
rather than crashing.
"""

from __future__ import annotations

from typing import Any, Optional

import requests

from config import Config
from utils.logger import get_logger

log = get_logger("api")


class ApiClient:
    def __init__(self, config: Config):
        self._cfg = config
        self._session = requests.Session()
        self._session.headers.update({"X-Service-Token": config.service_token})

    def fetch_jobs(self) -> list[dict[str, Any]]:
        """Pull the list of cameras (with capture source + motion config)."""
        try:
            resp = self._session.get(self._cfg.jobs_url, timeout=self._cfg.http_timeout_sec)
            resp.raise_for_status()
            return resp.json().get("data", []) or []
        except requests.RequestException as exc:
            log.warning("Failed to fetch camera jobs: %s", exc)
            return []

    def fetch_faces(self) -> list[dict[str, Any]]:
        """Pull the registered-employee face gallery (embeddings + names)."""
        try:
            resp = self._session.get(self._cfg.faces_url, timeout=self._cfg.http_timeout_sec)
            resp.raise_for_status()
            return resp.json().get("data", []) or []
        except requests.RequestException as exc:
            log.warning("Failed to fetch face gallery: %s", exc)
            return []

    def report_alert(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Report a detected alert (with optional base64 snapshot)."""
        try:
            resp = self._session.post(self._cfg.alerts_url, json=payload, timeout=self._cfg.http_timeout_sec)
            resp.raise_for_status()
            return resp.json().get("data")
        except requests.RequestException as exc:
            log.error("Failed to report alert for camera %s: %s", payload.get("cameraId"), exc)
            return None

    def heartbeat(self, payload: dict[str, Any]) -> None:
        try:
            self._session.post(self._cfg.heartbeat_url, json=payload, timeout=self._cfg.http_timeout_sec)
        except requests.RequestException as exc:
            log.debug("Heartbeat failed: %s", exc)
