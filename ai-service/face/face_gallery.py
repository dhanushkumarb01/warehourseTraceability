"""
FaceGallery — in-memory registry of enrolled employee embeddings.

Holds the current set of registered faces (fetched from the backend and
refreshed periodically by the CameraManager) and answers the only question the
detector needs: "does this embedding match a known employee, and how closely?"

Matching is cosine similarity. InsightFace embeddings are L2-normalised, so
cosine similarity reduces to a dot product — which we vectorise into a single
matrix multiply so recognition stays fast even with thousands of enrolled faces.
Multiple faces per employee are supported (the best-matching face wins).

Thread-safe: the gallery is replaced atomically on refresh while detectors read
it concurrently.
"""

from __future__ import annotations

import threading
from typing import Any, Optional

import numpy as np


class FaceGallery:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._matrix: Optional[np.ndarray] = None   # (N, D) normalised embeddings
        self._meta: list[dict[str, Any]] = []        # parallel [{employeeId, name}]
        self._count = 0

    def load(self, faces: list[dict[str, Any]]) -> None:
        """Replace the gallery with the given list of {employeeId, name, embedding}."""
        vectors, meta = [], []
        for f in faces or []:
            emb = f.get("embedding")
            if not emb:
                continue
            vec = np.asarray(emb, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm == 0:
                continue
            vectors.append(vec / norm)  # ensure normalised (defensive)
            meta.append({
                "employeeId": f.get("employeeId"),
                # Backend sends "employeeName"; accept "name" too (defensive).
                "employeeName": f.get("employeeName") or f.get("name"),
            })
        matrix = np.vstack(vectors).astype(np.float32) if vectors else None
        with self._lock:
            self._matrix = matrix
            self._meta = meta
            self._count = len(meta)

    @property
    def size(self) -> int:
        return self._count

    def match(self, embedding) -> dict[str, Any]:
        """Best match for an embedding: {employeeId, employeeName, similarity}."""
        with self._lock:
            matrix, meta = self._matrix, self._meta
        if matrix is None or not len(meta):
            return {"employeeId": None, "employeeName": None, "similarity": 0.0}
        vec = np.asarray(embedding, dtype=np.float32)
        n = np.linalg.norm(vec)
        if n == 0:
            return {"employeeId": None, "employeeName": None, "similarity": 0.0}
        sims = matrix @ (vec / n)          # cosine similarity (all normalised)
        idx = int(np.argmax(sims))
        best = meta[idx]
        return {
            "employeeId": best["employeeId"],
            "employeeName": best["employeeName"],
            "similarity": round(float(sims[idx]), 4),
        }
