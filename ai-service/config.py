"""
Central configuration for the WareTrace AI Surveillance service.

All tunables come from environment variables (optionally loaded from a local
.env) so the same code runs unchanged across dev / staging / production. Nothing
here is hard-coded to a single camera — the worker discovers cameras from the
WareTrace backend at runtime.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

try:  # optional convenience; the service works without python-dotenv installed
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class Config:
    """Runtime configuration for the AI worker."""

    # WareTrace backend the worker pulls jobs from and reports alerts to.
    api_url: str = field(default_factory=lambda: os.environ.get("WARETRACE_API_URL", "http://localhost:5000").rstrip("/"))
    service_token: str = field(default_factory=lambda: os.environ.get("AI_SERVICE_TOKEN", ""))

    # How often (seconds) to re-pull the camera job list so config / new cameras
    # are picked up without a restart.
    job_refresh_sec: int = field(default_factory=lambda: _int("AI_JOB_REFRESH_SEC", 20))
    # How often (seconds) to push a liveness + motion-state heartbeat.
    heartbeat_sec: int = field(default_factory=lambda: _int("AI_HEARTBEAT_SEC", 10))

    # Frames are resized to this width (keeping aspect) before processing — a key
    # performance lever for many simultaneous cameras. 0 disables resizing.
    frame_width: int = field(default_factory=lambda: _int("AI_FRAME_WIDTH", 640))
    # Target processing rate per camera; extra frames are skipped to save CPU.
    target_fps: float = field(default_factory=lambda: _float("AI_TARGET_FPS", 8.0))

    # Reconnection policy for dropped sources.
    reconnect_delay_sec: float = field(default_factory=lambda: _float("AI_RECONNECT_DELAY_SEC", 3.0))
    max_reconnect_delay_sec: float = field(default_factory=lambda: _float("AI_MAX_RECONNECT_DELAY_SEC", 30.0))

    http_timeout_sec: float = field(default_factory=lambda: _float("AI_HTTP_TIMEOUT_SEC", 8.0))
    log_level: str = field(default_factory=lambda: os.environ.get("AI_LOG_LEVEL", "INFO"))

    # ── Face recognition (Phase 14) ─────────────────────────────────────────
    # Enrollment HTTP API (the backend calls it to embed registration images).
    enroll_host: str = field(default_factory=lambda: os.environ.get("AI_ENROLL_HOST", "0.0.0.0"))
    enroll_port: int = field(default_factory=lambda: _int("AI_ENROLL_PORT", 8600))
    # Minimum face detection score accepted at enrollment (image-quality gate).
    face_min_det_score: float = field(default_factory=lambda: _float("AI_FACE_MIN_DET_SCORE", 0.5))
    # How often (seconds) to refresh the registered-face gallery from the backend.
    face_refresh_sec: int = field(default_factory=lambda: _int("AI_FACE_REFRESH_SEC", 30))

    @property
    def jobs_url(self) -> str:
        return f"{self.api_url}/api/surveillance/ai/cameras"

    @property
    def alerts_url(self) -> str:
        return f"{self.api_url}/api/surveillance/ai/alerts"

    @property
    def heartbeat_url(self) -> str:
        return f"{self.api_url}/api/surveillance/ai/heartbeat"

    @property
    def faces_url(self) -> str:
        return f"{self.api_url}/api/surveillance/ai/faces"


CONFIG = Config()
