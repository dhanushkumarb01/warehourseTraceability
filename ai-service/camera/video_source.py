"""
VideoSource — the common, resilient frame reader for every AI module.

Wraps ``cv2.VideoCapture`` for all WareTrace capture kinds:
  - ``file``    uploaded demo video (loops, so a finite clip behaves like live)
  - ``stream``  RTSP / RTMP / HTTP network camera (credentials embedded by the
                backend; the worker never decrypts anything itself)
  - ``webcam``  local device index

It handles open/read failures with exponential-backoff reconnection and
optional frame resizing for performance. This is the single input layer the
whole AI platform builds on.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

import cv2
import requests

from config import CONFIG
from utils.logger import get_logger

log = get_logger("video")

# Local copies of uploaded demo videos, for when the backend runs on another
# machine (e.g. a cloud host) and its storage path is not readable here.
VIDEO_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache", "videos")


def _fetch_video(path: str, video_url: str) -> Optional[str]:
    """Download a camera's demo video from the backend once; return the local path."""
    local = os.path.join(VIDEO_CACHE_DIR, os.path.basename(path.replace("\\", "/")))
    if os.path.exists(local):
        return local
    os.makedirs(VIDEO_CACHE_DIR, exist_ok=True)
    tmp = local + ".part"
    try:
        with requests.get(f"{CONFIG.api_url}{video_url}", headers={"X-Service-Token": CONFIG.service_token},
                          stream=True, timeout=CONFIG.http_timeout_sec) as resp:
            resp.raise_for_status()
            with open(tmp, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    fh.write(chunk)
        os.replace(tmp, local)
        log.info("Downloaded demo video %s", os.path.basename(local))
        return local
    except (requests.RequestException, OSError) as exc:
        log.warning("Could not download demo video from backend: %s", exc)
        try:
            os.remove(tmp)
        except OSError:
            pass
        return None


class VideoSource:
    def __init__(self, capture: dict[str, Any], frame_width: int = 0,
                 reconnect_delay: float = 3.0, max_reconnect_delay: float = 30.0):
        self._capture = capture or {}
        self._frame_width = int(frame_width)
        self._reconnect_delay = float(reconnect_delay)
        self._max_reconnect_delay = float(max_reconnect_delay)
        self._cap: Optional[cv2.VideoCapture] = None
        self._loop = bool(self._capture.get("loop"))
        self._kind = self._capture.get("kind", "none")
        self._backoff = self._reconnect_delay

    # ── lifecycle ─────────────────────────────────────────────────────────────
    def _target(self):
        kind = self._kind
        if kind == "file":
            path = self._capture.get("path")
            video_url = self._capture.get("videoUrl")
            if path and not os.path.exists(path) and video_url:
                return _fetch_video(path, video_url)
            return path
        if kind == "stream":
            return self._capture.get("url")
        if kind == "webcam":
            return int(self._capture.get("index", 0))
        return None

    def open(self) -> bool:
        target = self._target()
        if target is None or target == "":
            log.warning("Unusable capture source: %s", self._capture)
            return False
        self._cap = cv2.VideoCapture(target)
        ok = bool(self._cap and self._cap.isOpened())
        if ok:
            self._backoff = self._reconnect_delay
            log.info("Opened %s source", self._kind)
        else:
            log.warning("Could not open %s source", self._kind)
        return ok

    def is_open(self) -> bool:
        return bool(self._cap and self._cap.isOpened())

    def read(self):
        """Return (ok, frame). Loops file sources; returns (False, None) on drop."""
        if not self.is_open():
            return False, None
        ok, frame = self._cap.read()
        if not ok:
            if self._loop and self._kind == "file":
                # restart the clip so a demo video behaves like a continuous feed
                self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self._cap.read()
            if not ok:
                return False, None
        if self._frame_width and frame is not None:
            frame = self._resize(frame)
        return True, frame

    def _resize(self, frame):
        h, w = frame.shape[:2]
        if w <= self._frame_width:
            return frame
        scale = self._frame_width / float(w)
        return cv2.resize(frame, (self._frame_width, int(h * scale)), interpolation=cv2.INTER_AREA)

    def reconnect(self) -> bool:
        """Backoff then attempt to reopen. Backoff grows up to the configured max."""
        self.release()
        delay = self._backoff
        log.info("Reconnecting %s source in %.1fs", self._kind, delay)
        time.sleep(delay)
        self._backoff = min(self._backoff * 2, self._max_reconnect_delay)
        return self.open()

    def release(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None
