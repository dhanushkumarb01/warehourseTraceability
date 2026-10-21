"""Detectors: pluggable frame analysers. Add new ones without touching the core."""

from detectors.base_detector import BaseDetector, DetectionResult
from detectors.motion_detector import MotionDetector
from detectors.person_detector import PersonDetector
from detectors.vehicle_detector import VehicleDetector
from detectors.face_detector import FaceDetector

__all__ = ["BaseDetector", "DetectionResult", "MotionDetector", "PersonDetector", "VehicleDetector", "FaceDetector"]
