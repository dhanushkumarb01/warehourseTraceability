"""
FaceEngine — pre-trained face detection + embedding via InsightFace.

A thin, single-responsibility wrapper around a pre-trained InsightFace model
(ArcFace embeddings). No training, no fine-tuning. It performs two things and
nothing else:
  - detect faces in a frame (bounding box + detection score)
  - produce a normalised embedding vector for each detected face

The same engine powers live recognition (FaceDetector) and enrollment (the HTTP
enrollment API), so an employee's registered embedding is produced by exactly
the same pipeline that runs at detection time — the key to reliable matching.

Loaded lazily and degrades gracefully: if InsightFace / its models are not
installed, the engine reports unavailable and returns no faces, so the rest of
the AI worker keeps running (mirrors the YOLO detectors' behaviour).
"""

from __future__ import annotations

import threading
from typing import Any

from utils.logger import get_logger

log = get_logger("face.engine")


class FaceEngine:
    # Process-wide singleton — the model is heavy; load it once and share it.
    _instance: "FaceEngine | None" = None
    _lock = threading.Lock()

    def __init__(self, model_name: str = "buffalo_l", det_size: int = 640):
        self._model_name = model_name
        self._det_size = int(det_size)
        self._app = None
        self._load_attempted = False
        self._warned = False
        # Guards the one-time model load so a startup warmup and a concurrent
        # request can't both trigger initialisation (or read a half-built model).
        self._load_lock = threading.Lock()

    @classmethod
    def shared(cls, model_name: str = "buffalo_l") -> "FaceEngine":
        with cls._lock:
            if cls._instance is None:
                cls._instance = FaceEngine(model_name=model_name)
            return cls._instance

    @property
    def model_name(self) -> str:
        return self._model_name

    def _ensure(self) -> bool:
        # Fast path: already loaded (no locking needed once _app is set).
        if self._app is not None:
            return True
        with self._load_lock:
            # Re-check under the lock in case another thread finished loading.
            if self._app is not None:
                return True
            if self._load_attempted:
                return False
            self._load_attempted = True
            try:
                from insightface.app import FaceAnalysis  # lazy import

                app = FaceAnalysis(name=self._model_name, providers=["CPUExecutionProvider"])
                app.prepare(ctx_id=0, det_size=(self._det_size, self._det_size))
                self._app = app
                log.info("Loaded InsightFace model '%s'", self._model_name)
                return True
            except Exception as exc:
                log.warning("Face recognition unavailable (%s). Install 'insightface' + 'onnxruntime'.", exc)
                return False

    @property
    def available(self) -> bool:
        return self._ensure()

    def warmup(self) -> bool:
        """Eagerly load the model and run one throwaway inference.

        Called once at worker startup so the first *user* enrollment/recognition
        does not pay InsightFace's lazy-load + first-inference cost (which can
        exceed the request timeout). Safe to run in a background thread; the load
        is serialised by ``_ensure``'s lock, so a request arriving mid-warmup
        simply waits for the same load instead of starting a second one. Returns
        whether the model is available.
        """
        if not self._ensure():
            return False
        try:
            import numpy as np  # always available in this service

            # Priming the detection model: a full-frame pass through FaceAnalysis.
            blank = np.zeros((self._det_size, self._det_size, 3), dtype=np.uint8)
            self._app.get(blank)

            # A blank frame contains no face, so FaceAnalysis never runs the
            # recognition / landmark / attribute models here — they stay cold and
            # the FIRST real face would otherwise pay their one-time ONNX
            # initialisation (the actual cause of the slow first enrollment).
            # Prime every remaining model's ONNX session directly so no per-model
            # first-inference cost lands on a user request. Sessions with dynamic
            # input shapes (detection) are already warmed above and are skipped.
            for model in getattr(self._app, "models", {}).values():
                session = getattr(model, "session", None)
                if session is None:
                    continue
                try:
                    feeds = {
                        inp.name: np.zeros(
                            [d if isinstance(d, int) and d > 0 else 1 for d in inp.shape],
                            dtype=np.float32,
                        )
                        for inp in session.get_inputs()
                    }
                    session.run(None, feeds)
                except Exception:
                    continue  # dynamic-shape session (already primed) — ignore

            log.info("Face model warmed up — enrollment/recognition ready.")
        except Exception as exc:  # warmup is best-effort; the model is still loaded
            log.debug("Face model warmup inference skipped: %s", exc)
        return True

    def detect(self, frame) -> list[dict[str, Any]]:
        """Return one dict per detected face: bbox (x,y,w,h), detScore, embedding."""
        if not self._ensure():
            if not self._warned:
                log.warning("Skipping face detection — model not loaded.")
                self._warned = True
            return []

        try:
            faces = self._app.get(frame)
        except Exception as exc:
            log.error("Face detection error: %s", exc)
            return []

        results: list[dict[str, Any]] = []
        for f in faces:
            x1, y1, x2, y2 = [float(v) for v in f.bbox]
            emb = getattr(f, "normed_embedding", None)
            if emb is None:
                continue
            results.append({
                "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)],
                "detScore": round(float(getattr(f, "det_score", 0.0)), 3),
                # normalised embedding as a plain list (JSON-friendly for storage)
                "embedding": [float(v) for v in emb],
            })
        return results
