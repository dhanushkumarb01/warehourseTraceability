"""
Evidence capture.

Encodes a JPEG snapshot of the triggering frame, optionally annotating detected
regions (a light rectangle overlay — NOT an AI label/box). The module is written
so the same evidence pipeline can later also persist short video clips: callers
build an evidence payload and the backend stores whatever is attached.
"""

from __future__ import annotations

import base64
from typing import Iterable, Optional

import cv2


def capture_snapshot(
    frame,
    regions: Optional[Iterable[tuple[int, int, int, int]]] = None,
    jpeg_quality: int = 80,
) -> Optional[str]:
    """Return a base64-encoded JPEG of ``frame`` (with optional region overlay)."""
    if frame is None:
        return None

    image = frame
    if regions:
        image = frame.copy()
        for (x, y, w, h) in regions:
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 0, 255), 2)

    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), int(jpeg_quality)])
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("ascii")
