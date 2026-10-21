"""Per-camera processing pipeline: read → detect → rules → alert → heartbeat."""

from pipeline.camera_pipeline import CameraPipeline

__all__ = ["CameraPipeline"]
