/**
 * surveillanceState — in-memory live state for the AI surveillance layer.
 *
 * Holds transient, real-time signals that don't belong in the database:
 *   - per-camera live motion status + observed fps/resolution (pushed by the AI
 *     worker via heartbeat), so the dashboard can show "Motion / Clear" live
 *     without websockets (the frontend polls Node, the worker pushes to Node);
 *   - the AI service's last heartbeat (drives the ONLINE/OFFLINE service badge);
 *   - the last-alert timestamp per camera+type, used for cooldown de-duplication.
 *
 * Mirrors the pattern of streamSessionManager: a single in-process singleton,
 * decoupled from Prisma. Safe to lose on restart — it is purely a live cache.
 */

'use strict';

const env = require('../config/env');

class SurveillanceState {
  constructor() {
    /** cameraId → { motion, fps, resolution, detector, updatedAt } */
    this.cameras = new Map();
    /** cameraId+type → ISO timestamp of last raised alert (cooldown) */
    this.lastAlertAt = new Map();
    this.lastHeartbeatAt = null;
    this.workerInfo = null;
  }

  /** Record an AI worker heartbeat (overall + optional per-camera motion state). */
  heartbeat({ worker = null, cameras = [] } = {}) {
    this.lastHeartbeatAt = new Date();
    if (worker) this.workerInfo = worker;
    for (const c of cameras) {
      if (!c || !c.cameraId) continue;
      this.cameras.set(c.cameraId, {
        motion: Boolean(c.motion),
        persons: typeof c.persons === 'number' ? c.persons : 0,
        intrusion: Boolean(c.intrusion),
        wagon: typeof c.wagon === 'number' ? c.wagon : 0,
        vehicles: typeof c.vehicles === 'number' ? c.vehicles : 0,
        maxSpeedKmh: typeof c.maxSpeedKmh === 'number' ? c.maxSpeedKmh : 0,
        speedLimit: typeof c.speedLimit === 'number' ? c.speedLimit : null,
        faces: typeof c.faces === 'number' ? c.faces : 0,
        unknownFaces: typeof c.unknownFaces === 'number' ? c.unknownFaces : 0,
        fps: typeof c.fps === 'number' ? c.fps : null,
        resolution: c.resolution || null,
        detectors: Array.isArray(c.detectors) ? c.detectors : (c.detector ? [c.detector] : []),
        updatedAt: new Date(),
      });
    }
  }

  /** Live detector snapshot for one camera (or a neutral default). */
  getCameraState(cameraId) {
    return this.cameras.get(cameraId) || { motion: false, persons: 0, intrusion: false, wagon: 0, vehicles: 0, maxSpeedKmh: 0, speedLimit: null, faces: 0, unknownFaces: 0, fps: null, resolution: null, detectors: [], updatedAt: null };
  }

  /** Whether the AI service is considered online (recent heartbeat). */
  isServiceOnline() {
    if (!this.lastHeartbeatAt) return false;
    const ageSec = (Date.now() - this.lastHeartbeatAt.getTime()) / 1000;
    return ageSec <= env.SURVEILLANCE_HEARTBEAT_TIMEOUT_SEC;
  }

  serviceStatus() {
    return {
      online: this.isServiceOnline(),
      lastHeartbeatAt: this.lastHeartbeatAt,
      worker: this.workerInfo,
      cameras: [...this.cameras.entries()].map(([cameraId, s]) => ({ cameraId, ...s })),
    };
  }

  // ── Cooldown de-duplication ───────────────────────────────────────────────
  _key(cameraId, alertType) { return `${cameraId}:${alertType}`; }

  /** True if a new alert is within the cooldown window of the previous one. */
  isWithinCooldown(cameraId, alertType, cooldownSec) {
    const last = this.lastAlertAt.get(this._key(cameraId, alertType));
    if (!last) return false;
    return (Date.now() - last) / 1000 < cooldownSec;
  }

  markAlert(cameraId, alertType) {
    this.lastAlertAt.set(this._key(cameraId, alertType), Date.now());
  }
}

module.exports = new SurveillanceState();
