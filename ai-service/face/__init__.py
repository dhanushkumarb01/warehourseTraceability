"""
Face subsystem: pre-trained face detection + embedding (InsightFace) and an
in-memory gallery of registered employee embeddings.

Reused by both the live FaceDetector (detection stage) and the enrollment API
(registration stage), so embeddings are produced by exactly one code path.
"""

from face.face_engine import FaceEngine
from face.face_gallery import FaceGallery

__all__ = ["FaceEngine", "FaceGallery"]
