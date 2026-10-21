"""
CameraPipeline — the reusable per-camera processing loop.

One pipeline runs per camera in its own thread:

    read frame → run every detector → evaluate every rule → report fired alerts
                                                          → publish live state

This is the common runtime for the whole AI platform. A new use case adds a
detector and a rule (constructed here from camera config) — the loop, the
threading, the reconnection and the reporting are all reused unchanged.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime
from typing import Any

from camera.video_source import VideoSource
from detectors.motion_detector import MotionDetector
from detectors.person_detector import PersonDetector
from detectors.vehicle_detector import VehicleDetector
from detectors.face_detector import FaceDetector
from rules.rule_engine import RuleEngine
from rules.base_rule import RuleContext
from rules.motion_rule import MotionClosedRule
from rules.wall_intrusion_rule import WallIntrusionRule
from rules.man_inside_wagon_rule import ManInsideWagonRule
from rules.over_speed_rule import OverSpeedRule
from rules.cancelled_vehicle_rule import CancelledVehicleRule
from rules.face_detection_rule import FaceDetectionRule
from tracking.vehicle_tracker import VehicleTracker
from speed.speed_estimator import SpeedEstimator
from zones.zone import zones_from_config
from alerts.alert_reporter import AlertReporter
from alerts.evidence import capture_snapshot
from utils.logger import get_logger

# Zone types used for live status display.
_BOUNDARY_TYPES = {"BOUNDARY", "RESTRICTED", "WALL", "WALL_INTRUSION"}
_WAGON_TYPES = {"WAGON_ZONE", "WAGON"}

log = get_logger("pipeline")


class CameraPipeline(threading.Thread):
    def __init__(self, job: dict[str, Any], reporter: AlertReporter, config, face_gallery=None):
        super().__init__(daemon=True, name=f"cam-{job.get('id')}")
        self._job = job
        self._reporter = reporter
        self._config = config
        self._face_gallery = face_gallery
        self._stop = threading.Event()

        self.camera = {
            "id": job.get("id"),
            "cameraName": job.get("cameraName"),
            "location": job.get("location"),
            "streamType": job.get("streamType"),
        }
        # Per-feature configs. Supports the generalised `detectors` map and the
        # legacy top-level `motion` key (kept for backward compatibility).
        detector_cfgs = job.get("detectors") or {}
        motion_cfg = detector_cfgs.get("motion") or job.get("motion") or {}
        wall_cfg = detector_cfgs.get("wallIntrusion") or {}
        wagon_cfg = detector_cfgs.get("manInsideWagon") or {}
        overspeed_cfg = detector_cfgs.get("overSpeed") or {}
        cancelled_cfg = detector_cfgs.get("cancelledVehicle") or {}
        face_cfg = detector_cfgs.get("faceDetection") or {}
        self._motion_cfg = motion_cfg            # back-compat for MotionClosedRule (ctx.config)
        self._configs = {"motion": motion_cfg, "wallIntrusion": wall_cfg,
                         "manInsideWagon": wagon_cfg, "overSpeed": overspeed_cfg,
                         "cancelledVehicle": cancelled_cfg, "faceDetection": face_cfg}
        self._zones = zones_from_config(job.get("zones", []))
        self._boundary_zones = [z for z in self._zones if str(z.zone_type).upper() in _BOUNDARY_TYPES]
        self._wagon_zones = [z for z in self._zones if str(z.zone_type).upper() in _WAGON_TYPES]
        self._default_cooldown = 30.0

        # Detectors + rules are assembled generically from config. Each enabled
        # feature contributes a rule; the loop below is unchanged no matter how
        # many are active. Future use cases add a branch here.
        self._detectors = []
        self._engine = RuleEngine()
        self._cooldowns: dict[str, float] = {}

        if motion_cfg.get("enabled", bool(motion_cfg) and not detector_cfgs):
            self._detectors.append(MotionDetector(
                sensitivity=motion_cfg.get("sensitivity", "medium"),
                min_area_percent=float(motion_cfg.get("minAreaPercent", 1.5)),
            ))
            self._engine.register(MotionClosedRule())
            self._cooldowns["MOTION"] = float(motion_cfg.get("cooldownSec", 30))

        # A SINGLE shared PersonDetector serves EVERY person-based rule (wall
        # intrusion, man-inside-wagon, and future use cases). It is created at the
        # lowest confidence any active rule needs; each rule applies its own
        # threshold. The detector itself is never modified or duplicated.
        person_confidences = []
        if wall_cfg.get("enabled"):
            person_confidences.append(float(wall_cfg.get("minConfidence", 0.4)))
        if wagon_cfg.get("enabled"):
            person_confidences.append(float(wagon_cfg.get("minConfidence", 0.4)))
        if person_confidences:
            self._detectors.append(PersonDetector(
                model_path=(wall_cfg.get("modelPath") or wagon_cfg.get("modelPath") or "yolov8n.pt"),
                min_confidence=min(person_confidences),
            ))
        if wall_cfg.get("enabled"):
            self._engine.register(WallIntrusionRule())
            self._cooldowns["WALL_INTRUSION"] = float(wall_cfg.get("cooldownSec", 30))
        if wagon_cfg.get("enabled"):
            self._engine.register(ManInsideWagonRule())
            self._cooldowns["MAN_INSIDE_WAGON"] = float(wagon_cfg.get("cooldownSec", 30))

        # Vehicle detection + tracking. A SINGLE shared VehicleDetector + tracker
        # serves EVERY vehicle-based rule (over-speed, cancelled-vehicle, and
        # future use cases) — never duplicated. The speed estimator is only built
        # when speed is actually needed.
        self._vehicle_tracker = None
        self._speed_estimator = None
        vehicle_confidences = []
        if overspeed_cfg.get("enabled"):
            vehicle_confidences.append(float(overspeed_cfg.get("minConfidence", 0.4)))
        if cancelled_cfg.get("enabled"):
            vehicle_confidences.append(float(cancelled_cfg.get("minConfidence", 0.4)))
        if vehicle_confidences:
            self._detectors.append(VehicleDetector(
                model_path=(overspeed_cfg.get("modelPath") or cancelled_cfg.get("modelPath") or "yolov8n.pt"),
                min_confidence=min(vehicle_confidences),
            ))
            self._vehicle_tracker = VehicleTracker()
        if overspeed_cfg.get("enabled"):
            self._speed_estimator = SpeedEstimator(
                pixels_per_meter=float(overspeed_cfg.get("pixelsPerMeter", 10.0)),
            )
            self._engine.register(OverSpeedRule())
            self._cooldowns["OVER_SPEED"] = float(overspeed_cfg.get("cooldownSec", 30))
        if cancelled_cfg.get("enabled"):
            self._engine.register(CancelledVehicleRule())
            self._cooldowns["CANCELLED_VEHICLE"] = float(cancelled_cfg.get("cooldownSec", 30))

        # Face detection + recognition. Uses the shared, manager-refreshed face
        # gallery so recognition scales without reloading embeddings per camera.
        if face_cfg.get("enabled") and self._face_gallery is not None:
            self._detectors.append(FaceDetector(
                gallery=self._face_gallery,
                threshold=float(face_cfg.get("threshold", 0.45)),
                min_det_score=float(face_cfg.get("minConfidence", 0.5)),
            ))
            self._engine.register(FaceDetectionRule())
            self._cooldowns["FACE_DETECTION"] = float(face_cfg.get("cooldownSec", 30))

        self._source = VideoSource(
            job.get("capture", {}),
            frame_width=config.frame_width,
            reconnect_delay=config.reconnect_delay_sec,
            max_reconnect_delay=config.max_reconnect_delay_sec,
        )

        # Live state published to the heartbeat (read by the manager).
        self.state: dict[str, Any] = {
            "cameraId": self.camera["id"], "motion": False, "persons": 0, "intrusion": False, "wagon": 0,
            "vehicles": 0, "maxSpeedKmh": 0, "speedLimit": float(overspeed_cfg.get("speedLimit", 0)) or None,
            "faces": 0, "unknownFaces": 0,
            "fps": None, "resolution": None, "detectors": [d.name for d in self._detectors],
        }

    def _count_in(self, person_result, zone_list) -> int:
        """Persons whose ground point is inside any of the given zones (live status)."""
        if not person_result or not zone_list:
            return 0
        details = person_result.details or {}
        frame_size = (int(details.get("frameWidth", 0)), int(details.get("frameHeight", 0)))
        count = 0
        for p in details.get("persons", []) or []:
            fx, fy = (p.get("foot") or [None, None])
            if fx is None:
                continue
            if any(z.contains((fx, fy), frame_size) for z in zone_list):
                count += 1
        return count

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        if not self._source.open():
            # keep trying until told to stop
            while not self._stop.is_set() and not self._source.reconnect():
                if self._stop.is_set():
                    return
        log.info("Camera %s (%s) connected ✓ | detectors=%s | rules=%s",
                 self.camera["id"], self.camera["cameraName"],
                 [d.name for d in self._detectors], [r.name for r in self._engine.rules])

        target_dt = 1.0 / max(self._config.target_fps, 0.1)
        ema_fps = None
        frame_count = 0
        first_frame = False
        last_status_log = time.monotonic()

        while not self._stop.is_set():
            t0 = time.monotonic()
            ok, frame = self._source.read()
            if not ok or frame is None:
                for d in self._detectors:
                    d.reset()
                self.state["motion"] = False
                self.state["persons"] = 0
                self.state["intrusion"] = False
                self.state["wagon"] = 0
                self.state["vehicles"] = 0
                self.state["maxSpeedKmh"] = 0
                self.state["faces"] = 0
                self.state["unknownFaces"] = 0
                if self._stop.is_set() or not self._source.reconnect():
                    if self._stop.is_set():
                        break
                continue

            now = datetime.now()
            frame_count += 1
            if not first_frame:
                first_frame = True
                log.info("Camera %s: frames received ✓ (%dx%d) — %d detector(s) executing per frame",
                         self.camera["id"], frame.shape[1], frame.shape[0], len(self._detectors))

            # Run all detectors → (vehicle tracking + speed stage) → context → rules.
            detections = {d.name: d.process(frame) for d in self._detectors}
            motion = detections.get("motion")
            person = detections.get("person")
            vehicle = detections.get("vehicle")

            # Vehicle-motion stage: track vehicles and estimate speed (reusable).
            tracks = []
            if vehicle is not None and self._vehicle_tracker is not None:
                tracks = self._vehicle_tracker.update(vehicle.details.get("vehicles", []), now)
                if self._speed_estimator is not None:
                    self._speed_estimator.annotate(tracks, now)

            ctx = RuleContext(
                camera=self.camera, detections=detections, config=self._motion_cfg,
                now=now, configs=self._configs, zones=self._zones, tracks=tracks,
            )
            fired = self._engine.evaluate(ctx)

            for result in fired:
                regions = result.details.get("regions") or (detections.get(result.detector).regions if detections.get(result.detector) else [])
                snapshot = capture_snapshot(frame, regions)
                cooldown = self._cooldowns.get(result.alert_type, self._default_cooldown)
                sent = self._reporter.report(self.camera["id"], result, snapshot, cooldown)
                log.info("Camera %s: rule '%s' TRIGGERED ✓ → %s | %s",
                         self.camera["id"], result.rule, result.alert_type,
                         "alert sent ✓" if sent else "suppressed (cooldown)")

            # Publish live state (motion + person/boundary).
            h, w = frame.shape[:2]
            self.state["resolution"] = f"{w}x{h}"
            self.state["motion"] = bool(motion.detected) if motion else False
            self.state["persons"] = int(person.details.get("count", 0)) if person else 0
            self.state["intrusion"] = self._count_in(person, self._boundary_zones) > 0
            self.state["wagon"] = self._count_in(person, self._wagon_zones)
            self.state["vehicles"] = len(tracks)
            self.state["maxSpeedKmh"] = round(max((t.get("speedKmh") or 0 for t in tracks), default=0), 1)
            face = detections.get("face")
            self.state["faces"] = int(face.details.get("count", 0)) if face else 0
            self.state["unknownFaces"] = int(face.details.get("unknownCount", 0)) if face else 0

            # Periodic pipeline heartbeat so it is visible that frames are being
            # processed and detectors are executing (helps diagnose "no alerts").
            if t0 - last_status_log >= 15:
                last_status_log = t0
                log.info("Camera %s: processed %d frames @ %.1f fps | motion=%s persons=%d vehicles=%d intrusion=%s wagon=%d",
                         self.camera["id"], frame_count, self.state["fps"] or 0.0, self.state["motion"],
                         self.state["persons"], self.state["vehicles"], self.state["intrusion"], self.state["wagon"])

            # Pace to the target FPS; record the achieved rate.
            elapsed = time.monotonic() - t0
            inst_fps = 1.0 / elapsed if elapsed > 0 else self._config.target_fps
            ema_fps = inst_fps if ema_fps is None else (0.8 * ema_fps + 0.2 * inst_fps)
            self.state["fps"] = round(ema_fps, 1)
            sleep = target_dt - elapsed
            if sleep > 0:
                self._stop.wait(sleep)

        self._source.release()
        self.state["motion"] = False
        log.info("Pipeline stopped for camera %s", self.camera["id"])
