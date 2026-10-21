/**
 * surveillanceService — the reusable AI-surveillance alert layer.
 *
 * This is the single system of record for every AI surveillance use case. The
 * first detector is motion; future detectors (intrusion, face, vehicle, …) reuse
 * this service unchanged — they only emit a new alertType through the same
 * ingest path. The Python AI service performs detection and applies rules; this
 * service persists alerts, stores evidence, de-duplicates, audits, and serves
 * the dashboard.
 *
 * Security:
 *   - Evidence is stored as an internal reference and served only through an
 *     authenticated endpoint; raw paths are never returned.
 *   - Camera credentials handed to the AI worker (internal, service-token only)
 *     are decrypted in-memory and never exposed to user-facing responses.
 *
 * Reuses: config/prisma, config/env, utils/AppError, services/auditService,
 * services/storageService, utils/cryptoBox, services/surveillanceState.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const storageService = require('./storageService');
const { decrypt } = require('../utils/cryptoBox');
const state = require('./surveillanceState');

const AUDIT = 'SURVEILLANCE';
const ALERT_TYPES = ['MOTION', 'INTRUSION', 'WALL_INTRUSION', 'MAN_INSIDE_WAGON', 'OVER_SPEED', 'CANCELLED_VEHICLE', 'FACE_DETECTION', 'FACE', 'GEOFENCE', 'VEHICLE', 'OVERSPEED', 'DRIVER_MONITORING', 'OTHER'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const CAMERA_SELECT = {
  id: true, cameraName: true, cameraCode: true, location: true, zone: true,
  streamType: true, status: true, health: true,
};

// ─── Per-camera detector (motion) configuration (stored in Camera.aiConfig) ───
const defaultMotionConfig = () => ({
  enabled: false,
  sensitivity: 'medium',          // low | medium | high
  minAreaPercent: 1.5,            // % of frame that must change to count as motion
  cooldownSec: env.SURVEILLANCE_DEFAULT_COOLDOWN_SEC,
  armed: 'non_operational',       // always | non_operational
  severity: 'MEDIUM',
  operationalHours: {
    start: env.SURVEILLANCE_OPERATIONAL_START,
    end: env.SURVEILLANCE_OPERATIONAL_END,
    days: env.SURVEILLANCE_OPERATIONAL_DAYS.split(',').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n)),
  },
});

const getMotionConfig = (camera) => {
  const d = defaultMotionConfig();
  const m = (camera.aiConfig && camera.aiConfig.motion) || {};
  return {
    ...d,
    ...m,
    operationalHours: { ...d.operationalHours, ...(m.operationalHours || {}) },
  };
};

// ─── Per-camera detector (wall intrusion / person) config — also in aiConfig ──
const defaultWallIntrusionConfig = () => ({
  enabled: false,
  minConfidence: 0.4,         // YOLO person confidence threshold
  severity: 'HIGH',
  cooldownSec: env.SURVEILLANCE_DEFAULT_COOLDOWN_SEC,
  modelPath: 'yolov8n.pt',    // pre-trained YOLO weights (no training)
  zoneIds: [],                // which boundary zones this rule enforces ([] = all boundary zones)
});

const getWallIntrusionConfig = (camera) => {
  const d = defaultWallIntrusionConfig();
  const w = (camera.aiConfig && camera.aiConfig.wallIntrusion) || {};
  return { ...d, ...w, zoneIds: Array.isArray(w.zoneIds) ? w.zoneIds : d.zoneIds };
};

// ─── Per-camera man-inside-wagon config (reuses the same person detector) ─────
const defaultWagonConfig = () => ({
  enabled: false,
  minConfidence: 0.4,         // YOLO person confidence threshold (shared detector)
  minDurationSec: 2.5,        // dwell time inside the wagon before alerting (false-positive guard)
  severity: 'HIGH',
  cooldownSec: env.SURVEILLANCE_DEFAULT_COOLDOWN_SEC,
  modelPath: 'yolov8n.pt',
  zoneIds: [],                // which wagon zones this rule enforces ([] = all WAGON_ZONE zones)
});

const getWagonConfig = (camera) => {
  const d = defaultWagonConfig();
  const w = (camera.aiConfig && camera.aiConfig.manInsideWagon) || {};
  return { ...d, ...w, zoneIds: Array.isArray(w.zoneIds) ? w.zoneIds : d.zoneIds };
};

// ─── Per-camera over-speed config (reuses the vehicle detector + tracker) ─────
const defaultOverSpeedConfig = () => ({
  enabled: false,
  speedLimit: 20,             // km/h
  pixelsPerMeter: 10,         // camera calibration on the processed frame
  minConfidence: 0.4,         // YOLO vehicle confidence threshold
  severity: 'HIGH',
  cooldownSec: env.SURVEILLANCE_DEFAULT_COOLDOWN_SEC,
  modelPath: 'yolov8n.pt',
});

const getOverSpeedConfig = (camera) => {
  const d = defaultOverSpeedConfig();
  const o = (camera.aiConfig && camera.aiConfig.overSpeed) || {};
  return { ...d, ...o };
};

// ─── Per-camera cancelled-vehicle config (reuses the vehicle detector) ────────
const defaultCancelledVehicleConfig = () => ({
  enabled: false,
  minConfidence: 0.4,         // YOLO vehicle confidence threshold
  severity: 'HIGH',
  cooldownSec: env.SURVEILLANCE_DEFAULT_COOLDOWN_SEC,
  modelPath: 'yolov8n.pt',
});

const getCancelledVehicleConfig = (camera) => {
  const d = defaultCancelledVehicleConfig();
  const c = (camera.aiConfig && camera.aiConfig.cancelledVehicle) || {};
  return { ...d, ...c };
};

// ─── Per-camera face-detection config (reuses the shared face detector) ───────
// Recognition (embedding + compare + threshold) happens in the detector; the
// rule only decides Known vs Unknown. Known employees never alert.
const defaultFaceDetectionConfig = () => ({
  enabled: false,
  threshold: 0.45,            // cosine-similarity threshold: >= ⇒ recognised employee
  minConfidence: 0.5,         // minimum face-detection score to consider a face
  severity: 'HIGH',
  cooldownSec: env.SURVEILLANCE_DEFAULT_COOLDOWN_SEC,
});

const getFaceDetectionConfig = (camera) => {
  const d = defaultFaceDetectionConfig();
  const f = (camera.aiConfig && camera.aiConfig.faceDetection) || {};
  return { ...d, ...f };
};

/**
 * WMS validation: vehicles marked CANCELLED that were carrying material and have
 * not exited — i.e. a cancelled dispatch whose vehicle may still be in the yard.
 * Reuses the existing Dispatch data; no new model. This is the "backend
 * validation" the cancelled-vehicle rule relies on for identity.
 */
const getCancelledVehicles = async () => {
  let rows = [];
  try {
    rows = await prisma.dispatch.findMany({
      where: { dispatchStatus: 'CANCELLED', vehicleNumber: { not: null } },
      select: { dispatchNumber: true, vehicleNumber: true, approvedQuantity: true, requestedQuantity: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  } catch {
    rows = [];
  }
  const byVehicle = new Map();
  for (const d of rows) {
    const num = (d.vehicleNumber || '').trim();
    if (!num || byVehicle.has(num)) continue;
    byVehicle.set(num, {
      vehicleNumber: num,
      status: 'CANCELLED',
      dispatchStatus: 'CANCELLED',
      dispatchNumber: d.dispatchNumber,
      materialLoaded: Number(d.approvedQuantity ?? d.requestedQuantity ?? 0) > 0,
    });
  }
  return [...byVehicle.values()];
};

/** Per-camera surveillance zones (normalised polygons). Stored in aiConfig.zones. */
const getCameraZones = (camera) => (Array.isArray(camera.aiConfig && camera.aiConfig.zones) ? camera.aiConfig.zones : []);

/** Clamp a value into the normalised 0..1 range (defensive for zone polygons). */
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// ─── Sanitisation — never expose raw evidence paths ───────────────────────────
const sanitizeAlert = (a) => {
  if (!a) return a;
  const { snapshotPath, clipPath, ...rest } = a;
  return {
    ...rest,
    hasSnapshot: Boolean(snapshotPath),
    hasClip: Boolean(clipPath),
    snapshotUrl: snapshotPath ? `/api/surveillance/alerts/${a.id}/snapshot` : null,
  };
};

// ─── Alert listing / detail / summary ─────────────────────────────────────────
const listAlerts = async (q = {}) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20));

  const where = {};
  if (q.status) where.status = q.status;
  if (q.severity) where.severity = q.severity;
  if (q.alertType) where.alertType = q.alertType;
  if (q.cameraId) where.cameraId = q.cameraId;
  if (q.detectorType) where.detectorType = q.detectorType;
  if (q.active === 'true') where.status = { in: ['NEW', 'ACKNOWLEDGED'] };
  if (q.from || q.to) {
    where.detectedAt = {};
    if (q.from) where.detectedAt.gte = new Date(q.from);
    if (q.to) where.detectedAt.lte = new Date(q.to);
  }
  if (q.search) {
    const s = String(q.search).trim();
    where.OR = [
      { message: { contains: s, mode: 'insensitive' } },
      { location: { contains: s, mode: 'insensitive' } },
      { camera: { is: { cameraName: { contains: s, mode: 'insensitive' } } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.surveillanceAlert.count({ where }),
    prisma.surveillanceAlert.findMany({
      where,
      include: { camera: { select: CAMERA_SELECT } },
      orderBy: { detectedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items: rows.map(sanitizeAlert), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

const getAlert = async (id) => {
  const a = await prisma.surveillanceAlert.findUnique({ where: { id }, include: { camera: { select: CAMERA_SELECT } } });
  if (!a) throw new AppError(`Alert "${id}" was not found.`, 404);
  return sanitizeAlert(a);
};

const getSummary = async () => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [byStatus, bySeverity, byType, total, today] = await Promise.all([
    prisma.surveillanceAlert.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.surveillanceAlert.groupBy({ by: ['severity'], _count: { _all: true } }),
    prisma.surveillanceAlert.groupBy({ by: ['alertType'], _count: { _all: true } }),
    prisma.surveillanceAlert.count(),
    prisma.surveillanceAlert.count({ where: { detectedAt: { gte: startOfDay } } }),
  ]);
  const status = { NEW: 0, ACKNOWLEDGED: 0, RESOLVED: 0, DISMISSED: 0 };
  byStatus.forEach((r) => { status[r.status] = r._count._all; });
  const severity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  bySeverity.forEach((r) => { severity[r.severity] = r._count._all; });
  const types = {};
  byType.forEach((r) => { types[r.alertType] = r._count._all; });
  return { total, today, active: status.NEW + status.ACKNOWLEDGED, status, severity, types };
};

const getRecentForCamera = async (cameraId, limit = 10) => {
  const take = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const rows = await prisma.surveillanceAlert.findMany({ where: { cameraId }, orderBy: { detectedAt: 'desc' }, take });
  return rows.map(sanitizeAlert);
};

// ─── Alert lifecycle (acknowledge / resolve / dismiss) ────────────────────────
const transition = async (id, status, actorId, action) => {
  const a = await prisma.surveillanceAlert.findUnique({ where: { id } });
  if (!a) throw new AppError(`Alert "${id}" was not found.`, 404);

  const data = { status };
  if (status === 'ACKNOWLEDGED') { data.acknowledgedBy = actorId; data.acknowledgedAt = new Date(); }
  if (status === 'RESOLVED' || status === 'DISMISSED') { data.resolvedBy = actorId; data.resolvedAt = new Date(); }

  const updated = await prisma.surveillanceAlert.update({ where: { id }, data, include: { camera: { select: CAMERA_SELECT } } });
  await auditService.logAction(AUDIT, action, id, `Alert ${a.alertType} → ${status}`, actorId);
  return sanitizeAlert(updated);
};

const acknowledgeAlert = (id, actorId) => transition(id, 'ACKNOWLEDGED', actorId, 'ALERT_ACKNOWLEDGED');
const resolveAlert = (id, actorId) => transition(id, 'RESOLVED', actorId, 'ALERT_RESOLVED');
const dismissAlert = (id, actorId) => transition(id, 'DISMISSED', actorId, 'ALERT_DISMISSED');

// ─── Evidence serving ─────────────────────────────────────────────────────────
const resolveSnapshot = async (id) => {
  const a = await prisma.surveillanceAlert.findUnique({ where: { id }, select: { snapshotPath: true } });
  if (!a) throw new AppError(`Alert "${id}" was not found.`, 404);
  if (!a.snapshotPath) throw new AppError('This alert has no snapshot.', 404);
  const abs = storageService.getFilePath(a.snapshotPath);
  if (!fs.existsSync(abs)) throw new AppError('Snapshot file is missing.', 404);
  return abs;
};

/**
 * Absolute path of a camera's uploaded demo video, for the AI worker. Lets a
 * worker on another machine fetch the clip instead of opening a server path.
 */
const resolveWorkerVideo = async (cameraId) => {
  const cam = await prisma.camera.findUnique({ where: { id: cameraId }, select: { videoFilePath: true } }).catch(() => null);
  if (!cam) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  if (!cam.videoFilePath) throw new AppError('This camera has no demo video.', 404);
  const abs = storageService.getFilePath(cam.videoFilePath);
  if (!fs.existsSync(abs)) throw new AppError('Video file is missing from storage.', 404);
  return abs;
};

// ─── Ingest (AI worker → backend) ─────────────────────────────────────────────
/**
 * Persist an alert reported by the AI service. Applies cooldown de-duplication
 * per camera+type, stores the snapshot as evidence, audits, and updates live
 * motion state. Returns { created, alert? , deduped? }.
 */
const ingestAlert = async (payload) => {
  const {
    cameraId, alertType = 'MOTION', detectorType = 'motion',
    severity, message, detectionDetails = null, snapshotBase64 = null, detectedAt,
  } = payload;

  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  if (!ALERT_TYPES.includes(alertType)) throw new AppError(`Unknown alertType "${alertType}".`, 400);

  const motionCfg = getMotionConfig(camera);
  const cooldownSec = Number(payload.cooldownSec) || motionCfg.cooldownSec;

  // De-duplicate bursts: one alert per camera+type per cooldown window.
  if (state.isWithinCooldown(cameraId, alertType, cooldownSec)) {
    state.markAlert(cameraId, alertType);
    return { created: false, deduped: true };
  }

  // Persist snapshot evidence (if provided).
  let snapshotPath = null;
  if (snapshotBase64) {
    try {
      const buffer = Buffer.from(String(snapshotBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
      if (buffer.length > 0) {
        const filename = `${cameraId}_${Date.now()}_${crypto.randomUUID()}.jpg`;
        snapshotPath = await storageService.saveFile(filename, buffer, env.SURVEILLANCE_SNAPSHOT_DIR);
      }
    } catch {
      snapshotPath = null; // evidence failure must not drop the alert
    }
  }

  const sev = SEVERITIES.includes(severity) ? severity : (SEVERITIES.includes(motionCfg.severity) ? motionCfg.severity : 'MEDIUM');

  const alert = await prisma.surveillanceAlert.create({
    data: {
      alertType,
      detectorType,
      cameraId,
      location: camera.location,
      severity: sev,
      status: 'NEW',
      message: message || `${alertType} detected on ${camera.cameraName}`,
      snapshotPath,
      detectionDetails: detectionDetails || undefined,
      detectedAt: detectedAt ? new Date(detectedAt) : new Date(),
    },
    include: { camera: { select: CAMERA_SELECT } },
  });

  state.markAlert(cameraId, alertType);
  await auditService.logAction(AUDIT, 'ALERT_RAISED', alert.id, `${alertType} on ${camera.cameraName} (${detectorType})`, null);

  return { created: true, alert: sanitizeAlert(alert) };
};

// ─── Motion configuration (per camera) ────────────────────────────────────────
const getCameraMotionConfig = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, cameraName: camera.cameraName, motion: getMotionConfig(camera) };
};

const setCameraMotionConfig = async (cameraId, patch, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  const current = getMotionConfig(camera);
  const next = {
    ...current,
    ...patch,
    operationalHours: { ...current.operationalHours, ...(patch.operationalHours || {}) },
  };
  const aiConfig = { ...(camera.aiConfig || {}), motion: next };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'MOTION_CONFIG_UPDATED', cameraId, `Motion ${next.enabled ? 'enabled' : 'disabled'} (${next.armed})`, actorId);
  return { cameraId, motion: next };
};

// ─── Wall-intrusion (person) configuration (per camera) ───────────────────────
const getCameraWallConfig = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, cameraName: camera.cameraName, wallIntrusion: getWallIntrusionConfig(camera), zones: getCameraZones(camera) };
};

const setCameraWallConfig = async (cameraId, patch, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  const next = { ...getWallIntrusionConfig(camera), ...patch };
  if (patch.zoneIds && !Array.isArray(patch.zoneIds)) delete next.zoneIds;
  const aiConfig = { ...(camera.aiConfig || {}), wallIntrusion: next };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'WALL_CONFIG_UPDATED', cameraId, `Wall intrusion ${next.enabled ? 'enabled' : 'disabled'}`, actorId);
  return { cameraId, wallIntrusion: next };
};

// ─── Man-inside-wagon configuration (per camera) ──────────────────────────────
const getCameraWagonConfig = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, cameraName: camera.cameraName, manInsideWagon: getWagonConfig(camera), zones: getCameraZones(camera) };
};

const setCameraWagonConfig = async (cameraId, patch, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  const next = { ...getWagonConfig(camera), ...patch };
  if (patch.zoneIds && !Array.isArray(patch.zoneIds)) delete next.zoneIds;
  const aiConfig = { ...(camera.aiConfig || {}), manInsideWagon: next };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'WAGON_CONFIG_UPDATED', cameraId, `Man-inside-wagon ${next.enabled ? 'enabled' : 'disabled'}`, actorId);
  return { cameraId, manInsideWagon: next };
};

// ─── Over-speed configuration (per camera) ────────────────────────────────────
const getCameraOverSpeedConfig = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, cameraName: camera.cameraName, overSpeed: getOverSpeedConfig(camera) };
};

const setCameraOverSpeedConfig = async (cameraId, patch, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  const next = { ...getOverSpeedConfig(camera), ...patch };
  const aiConfig = { ...(camera.aiConfig || {}), overSpeed: next };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'OVERSPEED_CONFIG_UPDATED', cameraId, `Over-speed ${next.enabled ? 'enabled' : 'disabled'} (limit ${next.speedLimit} km/h)`, actorId);
  return { cameraId, overSpeed: next };
};

// ─── Cancelled-vehicle configuration (per camera) ─────────────────────────────
const getCameraCancelledConfig = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, cameraName: camera.cameraName, cancelledVehicle: getCancelledVehicleConfig(camera) };
};

const setCameraCancelledConfig = async (cameraId, patch, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  const next = { ...getCancelledVehicleConfig(camera), ...patch };
  const aiConfig = { ...(camera.aiConfig || {}), cancelledVehicle: next };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'CANCELLED_VEHICLE_CONFIG_UPDATED', cameraId, `Cancelled-vehicle ${next.enabled ? 'enabled' : 'disabled'}`, actorId);
  return { cameraId, cancelledVehicle: next };
};

// ─── Face-detection configuration (per camera) ────────────────────────────────
const getCameraFaceConfig = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, cameraName: camera.cameraName, faceDetection: getFaceDetectionConfig(camera) };
};

const setCameraFaceConfig = async (cameraId, patch, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  const next = { ...getFaceDetectionConfig(camera), ...patch };
  const aiConfig = { ...(camera.aiConfig || {}), faceDetection: next };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'FACE_CONFIG_UPDATED', cameraId, `Face detection ${next.enabled ? 'enabled' : 'disabled'} (threshold ${next.threshold})`, actorId);
  return { cameraId, faceDetection: next };
};

// ─── Surveillance zones (per camera, reusable for any zone-based use case) ─────
const getCameraZonesPublic = async (cameraId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  return { cameraId, zones: getCameraZones(camera) };
};

const setCameraZones = async (cameraId, zones, actorId) => {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) throw new AppError(`Camera "${cameraId}" was not found.`, 404);
  // Normalise + assign stable ids; clamp polygon points to 0..1.
  const clean = (Array.isArray(zones) ? zones : []).map((z, i) => ({
    id: String(z.id || `zone-${i + 1}`),
    name: String(z.name || `Zone ${i + 1}`),
    type: String(z.type || 'RESTRICTED'),
    polygon: (Array.isArray(z.polygon) ? z.polygon : [])
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [clamp01(p[0]), clamp01(p[1])]),
  }));
  const aiConfig = { ...(camera.aiConfig || {}), zones: clean };
  await prisma.camera.update({ where: { id: cameraId }, data: { aiConfig } });
  await auditService.logAction(AUDIT, 'ZONES_UPDATED', cameraId, `Configured ${clean.length} surveillance zone(s)`, actorId);
  return { cameraId, zones: clean };
};

// ─── Live service status + heartbeat ──────────────────────────────────────────
const recordHeartbeat = (payload) => { state.heartbeat(payload || {}); return { ok: true }; };

const getServiceStatus = async () => {
  const status = state.serviceStatus();
  if (status.cameras.length === 0) return status;
  const ids = status.cameras.map((c) => c.cameraId);
  const cams = await prisma.camera.findMany({ where: { id: { in: ids } }, select: { id: true, cameraName: true, location: true } });
  const byId = Object.fromEntries(cams.map((c) => [c.id, c]));
  status.cameras = status.cameras.map((c) => ({ ...c, cameraName: byId[c.cameraId]?.cameraName || null, location: byId[c.cameraId]?.location || null }));
  return status;
};

/** Live motion snapshot for one camera (dashboard tile + detail page). */
const getCameraLiveMotion = (cameraId) => ({ cameraId, ...state.getCameraState(cameraId) });

// ─── Internal: cameras for the AI worker (service-token only) ─────────────────
/**
 * Build the worker's job list: every ACTIVE camera with ANY detector enabled,
 * including a resolved capture source (credentials embedded for network streams,
 * absolute path for uploaded video, device index for webcams), every detector's
 * config, and the camera's surveillance zones. Returned ONLY to the
 * authenticated AI service — never to user-facing routes.
 *
 * The `detectors` map is generic: new detectors are added here without changing
 * the worker contract. `motion` is also kept at the top level for backward
 * compatibility with the original single-detector worker.
 */
const listCamerasForWorker = async () => {
  const cameras = await prisma.camera.findMany({ where: { status: 'ACTIVE' } });

  // Pre-check whether any camera needs the cancelled-vehicle watchlist, and if
  // so fetch it once (WMS validation), then inject it into those jobs' config.
  const anyCancelled = cameras.some((c) => getCancelledVehicleConfig(c).enabled);
  const cancelledVehicles = anyCancelled ? await getCancelledVehicles() : [];

  const jobs = [];
  for (const cam of cameras) {
    const motion = getMotionConfig(cam);
    const wallIntrusion = getWallIntrusionConfig(cam);
    const manInsideWagon = getWagonConfig(cam);
    const overSpeed = getOverSpeedConfig(cam);
    const cancelledVehicle = getCancelledVehicleConfig(cam);
    const faceDetection = getFaceDetectionConfig(cam);
    if (!motion.enabled && !wallIntrusion.enabled && !manInsideWagon.enabled && !overSpeed.enabled && !cancelledVehicle.enabled && !faceDetection.enabled) continue;
    jobs.push({
      id: cam.id,
      cameraName: cam.cameraName,
      location: cam.location,
      streamType: cam.streamType,
      capture: buildCapture(cam),
      detectors: {
        motion,
        wallIntrusion,
        manInsideWagon,
        overSpeed,
        // Inject the WMS watchlist so the rule stays pure (queries via config).
        cancelledVehicle: cancelledVehicle.enabled ? { ...cancelledVehicle, cancelledVehicles } : cancelledVehicle,
        // The registered-face gallery is served separately (GET /ai/faces) so it
        // is loaded once and shared across cameras — this only carries the config.
        faceDetection,
      },
      motion, // back-compat
      zones: getCameraZones(cam),
    });
  }
  return jobs;
};

/**
 * Registered-face gallery for the AI worker (service-token only). Returns one
 * row per enrolled face embedding with the owning employee's identity. Only
 * embeddings + metadata are stored/returned — never any image. The worker loads
 * this once into a shared in-memory gallery and matches live faces against it,
 * so recognition scales to thousands of employees across many cameras.
 */
const listFacesForWorker = async () => {
  let rows = [];
  try {
    rows = await prisma.employeeFace.findMany({
      where: { employee: { is: { status: 'ACTIVE' } } },
      select: {
        id: true, embedding: true, model: true,
        employee: { select: { id: true, name: true, employeeCode: true, department: true, designation: true } },
      },
    });
  } catch {
    rows = [];
  }
  return rows.map((r) => ({
    faceId: r.id,
    employeeId: r.employee.id,
    employeeCode: r.employee.employeeCode,
    employeeName: r.employee.name,
    department: r.employee.department || null,
    designation: r.employee.designation || null,
    model: r.model,
    embedding: r.embedding,
  }));
};

const buildCapture = (cam) => {
  switch (cam.streamType) {
    case 'UPLOADED_VIDEO':
      return cam.videoFilePath
        ? {
          kind: 'file',
          path: storageService.getFilePath(cam.videoFilePath),
          // Download route for workers that don't share the backend's disk.
          videoUrl: `/api/surveillance/ai/cameras/${cam.id}/video`,
          loop: true,
        }
        : { kind: 'none', reason: 'No demo video associated.' };
    case 'LOCAL_WEBCAM':
      return { kind: 'webcam', index: Number((cam.aiConfig && cam.aiConfig.webcamIndex) ?? 0) };
    case 'RTSP':
    case 'RTMP':
    case 'HTTP': {
      let url = cam.streamUrl || '';
      if (url && cam.username) {
        try {
          const u = new URL(url);
          u.username = encodeURIComponent(cam.username);
          if (cam.passwordEncrypted) u.password = encodeURIComponent(decrypt(cam.passwordEncrypted) || '');
          url = u.toString();
        } catch { /* keep original url */ }
      }
      return { kind: 'stream', url };
    }
    default:
      return { kind: 'none', reason: 'Unsupported stream type.' };
  }
};

module.exports = {
  // dashboard / user-facing
  listAlerts, getAlert, getSummary, getRecentForCamera,
  acknowledgeAlert, resolveAlert, dismissAlert, resolveSnapshot, resolveWorkerVideo,
  getCameraMotionConfig, setCameraMotionConfig,
  getCameraWallConfig, setCameraWallConfig,
  getCameraWagonConfig, setCameraWagonConfig,
  getCameraOverSpeedConfig, setCameraOverSpeedConfig,
  getCameraCancelledConfig, setCameraCancelledConfig,
  getCameraFaceConfig, setCameraFaceConfig,
  getCameraZonesPublic, setCameraZones,
  getServiceStatus, getCameraLiveMotion,
  // internal (AI worker, service token)
  ingestAlert, recordHeartbeat, listCamerasForWorker, getCancelledVehicles, listFacesForWorker,
  // helpers (exposed for tests)
  sanitizeAlert, getMotionConfig, defaultMotionConfig, getWallIntrusionConfig, getWagonConfig, getOverSpeedConfig, getCancelledVehicleConfig, getFaceDetectionConfig, getCameraZones,
};
