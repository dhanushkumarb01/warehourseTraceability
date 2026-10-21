"""
Face enrollment API (Flask).

A small HTTP service the Node backend calls during employee registration. It
accepts a face image and returns a normalised embedding using the SAME
FaceEngine that runs at detection time — so an enrolled face is represented
exactly as it will be seen live. It also validates the image and rejects
unusable ones (no face, multiple faces, low quality).

It stores nothing: the backend persists the returned embedding + metadata. The
image is never written to disk here.

Runs in a background thread inside the AI worker (main.py) so a single process
serves both enrollment and live detection. Authenticated with the shared service
token, exactly like the worker's calls to the backend.
"""

from __future__ import annotations

import base64
from typing import Any

import numpy as np

from config import Config
from face.face_engine import FaceEngine
from utils.logger import get_logger

log = get_logger("enroll")


def _decode_image(data_b64: str):
    import cv2
    raw = base64.b64decode(str(data_b64).split(",")[-1])
    arr = np.frombuffer(raw, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def create_app(config: Config):
    """Build the Flask enrollment app. Returns None if Flask isn't installed."""
    try:
        from flask import Flask, request, jsonify
    except Exception as exc:  # pragma: no cover
        log.warning("Flask not installed — enrollment API disabled (%s). Registration will not work until installed.", exc)
        return None

    app = Flask("waretrace-enrollment")
    engine = FaceEngine.shared()
    min_det = config.face_min_det_score

    def _authorized() -> bool:
        return bool(config.service_token) and request.headers.get("X-Service-Token") == config.service_token

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "faceModelAvailable": engine.available})

    @app.post("/faces/embed")
    def embed():
        if not _authorized():
            return jsonify({"success": False, "message": "Invalid or missing service token."}), 401
        if not engine.available:
            return jsonify({"success": False, "message": "Face model unavailable. Install 'insightface' + 'onnxruntime'."}), 503

        body = request.get_json(silent=True) or {}
        # The backend sends "imageBase64"; accept "image" too (defensive).
        image_b64 = body.get("imageBase64") or body.get("image")
        if not image_b64:
            return jsonify({"success": False, "message": "An image (base64) is required."}), 400

        try:
            frame = _decode_image(image_b64)
        except Exception:
            frame = None
        if frame is None:
            return jsonify({"success": False, "message": "Could not decode the image."}), 400

        try:
            faces = engine.detect(frame)
        except Exception as exc:  # surface the real reason instead of a blank 500
            log.exception("Face embedding failed")
            return jsonify({"success": False, "message": f"Face embedding failed: {exc}"}), 500
        # Validation: exactly one clear face.
        if len(faces) == 0:
            return jsonify({"success": False, "code": "NO_FACE", "message": "No face detected. Ensure the face is clearly visible."}), 422
        if len(faces) > 1:
            return jsonify({"success": False, "code": "MULTIPLE_FACES", "message": "Multiple faces detected. Use an image with exactly one face."}), 422
        face = faces[0]
        if float(face.get("detScore", 0)) < min_det:
            return jsonify({"success": False, "code": "LOW_QUALITY", "message": "Face image quality is too low. Use a clearer, front-facing image."}), 422

        return jsonify({
            "success": True,
            "data": {
                "embedding": face["embedding"],
                "detScore": face["detScore"],
                "model": engine.model_name,
            },
        })

    return app


def run_enrollment_server(config: Config) -> None:
    """Blocking run (used by the background thread in main.py)."""
    app = create_app(config)
    if app is None:
        return
    log.info("Face enrollment API listening on %s:%d", config.enroll_host, config.enroll_port)
    # threaded=True so enrollment requests don't block each other; single worker.
    app.run(host=config.enroll_host, port=config.enroll_port, threaded=True, use_reloader=False)
