"""
CameraManager — discovers cameras and runs one pipeline per camera.

Pulls the job list from the WareTrace backend (cameras with motion enabled),
starts a :class:`CameraPipeline` for each, and periodically re-syncs so config
changes, newly-enabled cameras and removals are picked up without a restart.
A single heartbeat thread publishes liveness + per-camera motion state back to
the backend so the dashboard shows real-time status without websockets.

Built for scale: pipelines are independent threads keyed by camera id; adding
cameras is O(1) and one failing camera never affects the others.
"""

from __future__ import annotations

import json
import threading
from typing import Any

from camera.video_source import VideoSource  # noqa: F401  (re-exported convenience)
from pipeline.camera_pipeline import CameraPipeline
from alerts.alert_reporter import AlertReporter
from face.face_gallery import FaceGallery
from utils.api_client import ApiClient
from utils.logger import get_logger

log = get_logger("manager")


def _signature(job: dict[str, Any]) -> str:
    """Stable fingerprint of the bits that require restarting a pipeline."""
    return json.dumps({"capture": job.get("capture"), "detectors": job.get("detectors")}, sort_keys=True, default=str)


def _needs_faces(job: dict[str, Any]) -> bool:
    return bool(((job.get("detectors") or {}).get("faceDetection") or {}).get("enabled"))


class CameraManager:
    def __init__(self, config, api: ApiClient, reporter: AlertReporter):
        self._config = config
        self._api = api
        self._reporter = reporter
        self._pipelines: dict[str, CameraPipeline] = {}
        self._signatures: dict[str, str] = {}
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []
        # One shared, atomically-refreshed gallery for every face-enabled camera.
        self._face_gallery = FaceGallery()

    # ── lifecycle ─────────────────────────────────────────────────────────────
    def start(self) -> None:
        self.sync_jobs()
        self._threads = [
            threading.Thread(target=self._refresh_loop, name="job-refresh", daemon=True),
            threading.Thread(target=self._heartbeat_loop, name="heartbeat", daemon=True),
        ]
        for t in self._threads:
            t.start()

    def stop(self) -> None:
        self._stop.set()
        for pipe in list(self._pipelines.values()):
            pipe.stop()
        for pipe in list(self._pipelines.values()):
            pipe.join(timeout=3)
        self._pipelines.clear()
        log.info("All pipelines stopped.")

    # ── job synchronisation ───────────────────────────────────────────────────
    def sync_jobs(self) -> None:
        jobs = self._api.fetch_jobs()
        if not jobs:
            log.info("No cameras have any detector enabled — enable a detector "
                     "(motion / wall / wagon / over-speed / cancelled-vehicle) on an "
                     "ACTIVE camera to start generating alerts.")
        else:
            log.info("Fetched %d camera job(s) with detectors enabled from the backend.", len(jobs))

        # Refresh the shared face gallery whenever any camera uses face detection.
        if any(_needs_faces(j) for j in jobs):
            faces = self._api.fetch_faces()
            self._face_gallery.load(faces)
            log.info("Face gallery refreshed — %d enrolled face(s).", self._face_gallery.size)

        seen: set[str] = set()

        for job in jobs:
            cam_id = job.get("id")
            if not cam_id:
                continue
            capture = job.get("capture", {})
            if capture.get("kind") in (None, "none"):
                log.info("Skipping camera %s — no usable capture source (%s).", cam_id, capture.get("reason"))
                continue
            seen.add(cam_id)
            sig = _signature(job)
            existing = self._pipelines.get(cam_id)
            if existing and existing.is_alive() and self._signatures.get(cam_id) == sig:
                continue  # unchanged — leave it running
            if existing:
                existing.stop()  # config changed — recycle
            self._start_pipeline(job, sig)

        # Stop pipelines for cameras no longer in the job list.
        for cam_id in list(self._pipelines.keys()):
            if cam_id not in seen:
                self._pipelines[cam_id].stop()
                self._pipelines.pop(cam_id, None)
                self._signatures.pop(cam_id, None)
                log.info("Stopped pipeline for removed camera %s", cam_id)

    def _start_pipeline(self, job: dict[str, Any], sig: str) -> None:
        pipe = CameraPipeline(job, self._reporter, self._config, face_gallery=self._face_gallery)
        pipe.start()
        self._pipelines[job["id"]] = pipe
        self._signatures[job["id"]] = sig

    # ── background loops ──────────────────────────────────────────────────────
    def _refresh_loop(self) -> None:
        while not self._stop.wait(self._config.job_refresh_sec):
            try:
                self.sync_jobs()
            except Exception as exc:  # never let the loop die
                log.exception("Job sync failed: %s", exc)

    def _heartbeat_loop(self) -> None:
        while not self._stop.wait(self._config.heartbeat_sec):
            try:
                cameras = [dict(p.state) for p in self._pipelines.values()]
                self._api.heartbeat({
                    "worker": {"pipelines": len(self._pipelines)},
                    "cameras": cameras,
                })
            except Exception as exc:
                log.debug("Heartbeat loop error: %s", exc)
