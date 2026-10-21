"""Camera input layer: the common frame source for every AI module."""

from camera.video_source import VideoSource
from camera.camera_manager import CameraManager

__all__ = ["VideoSource", "CameraManager"]
