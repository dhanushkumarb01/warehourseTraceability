"""
Face detector — pre-trained face detection + recognition.

Reuses the shared FaceEngine (InsightFace) to detect faces and produce
embeddings, then matches each face against the registered-employee gallery. Per
the platform's separation of concerns, ALL recognition (embedding + gallery
match + threshold) lives here in the detector; the rule only reads the
recognised/unknown flags and decides whether to alert.

Returns, per face: bounding box, detection score, whether it matched a known
employee, the matched employee (id + name) and the similarity score. Reusable
by any future face-based use case.

Degrades gracefully if InsightFace is unavailable (returns no faces).
"""

from __future__ import annotations

from typing import Any

from detectors.base_detector import BaseDetector, DetectionResult
from face.face_engine import FaceEngine
from face.face_gallery import FaceGallery


class FaceDetector(BaseDetector):
    name = "face"

    def __init__(self, gallery: FaceGallery, threshold: float = 0.45,
                 min_det_score: float = 0.5, model_name: str = "buffalo_l"):
        self._gallery = gallery
        self._threshold = float(threshold)
        self._min_det_score = float(min_det_score)
        self._engine = FaceEngine.shared(model_name=model_name)

    def reset(self) -> None:
        pass

    def process(self, frame) -> DetectionResult:
        height, width = frame.shape[:2]
        frame_size = f"{width}x{height}"

        detected_faces = self._engine.detect(frame)
        faces: list[dict[str, Any]] = []
        regions: list[tuple[int, int, int, int]] = []
        recognized_count = 0

        for f in detected_faces:
            if float(f.get("detScore", 0)) < self._min_det_score:
                continue
            match = self._gallery.match(f["embedding"])
            recognized = match["similarity"] >= self._threshold and match["employeeId"] is not None
            if recognized:
                recognized_count += 1
            bbox = f["bbox"]
            faces.append({
                "bbox": bbox,
                "detScore": f.get("detScore"),
                "recognized": bool(recognized),
                "employeeId": match["employeeId"] if recognized else None,
                "employeeName": match["employeeName"] if recognized else None,
                "similarity": match["similarity"],
            })
            regions.append(tuple(bbox))

        unknown_count = len(faces) - recognized_count
        return DetectionResult(
            detector=self.name,
            detected=len(faces) > 0,
            alert_type="OTHER",  # neutral — the rule decides
            details={
                "faces": faces,
                "count": len(faces),
                "recognizedCount": recognized_count,
                "unknownCount": unknown_count,
                "gallerySize": self._gallery.size,
                "threshold": self._threshold,
                "frameSize": frame_size,
                "available": self._engine.available,
            },
            regions=regions[:20],
        )
