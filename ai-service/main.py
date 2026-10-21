"""
WareTrace AI Surveillance service — entry point.

Discovers cameras from the WareTrace backend, runs the motion-detection pipeline
per camera, and reports alerts + live status back. This is the reusable AI worker
for the whole surveillance module; future detectors/rules plug into the same
pipeline and need no change here.

Run:
    cd ai-service
    pip install -r requirements.txt
    cp .env.example .env   # set WARETRACE_API_URL + AI_SERVICE_TOKEN
    python main.py
"""

from __future__ import annotations

import signal
import threading

from config import CONFIG
from utils.logger import configure, get_logger
from utils.api_client import ApiClient
from alerts.alert_reporter import AlertReporter
from camera.camera_manager import CameraManager
from enrollment import run_enrollment_server


def main() -> None:
    configure(CONFIG.log_level)
    log = get_logger("main")

    if not CONFIG.service_token:
        log.error("AI_SERVICE_TOKEN is not set. The backend will reject this worker. Aborting.")
        return

    log.info("Starting WareTrace AI Surveillance worker → %s", CONFIG.api_url)

    api = ApiClient(CONFIG)
    reporter = AlertReporter(api)
    manager = CameraManager(CONFIG, api, reporter)

    # Face enrollment HTTP API (background daemon). The backend calls it to embed
    # registration images; only embeddings are stored. Degrades gracefully if
    # Flask/InsightFace are unavailable (logs and skips — live detection unaffected).
    def _enroll():
        try:
            run_enrollment_server(CONFIG)
        except Exception as exc:  # pragma: no cover - never take down the worker
            log.warning("Enrollment server not started: %s", exc)

    threading.Thread(target=_enroll, name="enrollment-api", daemon=True).start()

    # Warm the shared face model at startup so the FIRST enrollment / recognition
    # request does not pay InsightFace's lazy-load + first-inference cost (which
    # can exceed the request timeout and surface as a failed first attempt). The
    # same singleton powers both enrollment and live detection. Runs in the
    # background so worker startup is not blocked; degrades silently if the model
    # is unavailable (enrollment then reports "model unavailable" as before).
    def _warmup():
        try:
            from face.face_engine import FaceEngine
            FaceEngine.shared().warmup()
        except Exception as exc:  # pragma: no cover - never take down the worker
            log.debug("Face model warmup skipped: %s", exc)

    threading.Thread(target=_warmup, name="face-warmup", daemon=True).start()

    stop_event = threading.Event()

    def _shutdown(signum, _frame):
        log.info("Signal %s received — shutting down…", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    manager.start()
    try:
        stop_event.wait()
    finally:
        manager.stop()
        log.info("Worker stopped.")


if __name__ == "__main__":
    main()
