/**
 * streamService — orchestration for the Live Camera Streaming layer.
 *
 * Bridges the in-memory session manager with durable concerns: Prisma
 * persistence (Camera stream state + CameraStreamLog), audit logging, and
 * credential decryption. The frontend never talks to a camera directly — every
 * stream is opened, monitored and proxied through here.
 *
 * Security:
 *   - Decrypted credentials are obtained only to drive the upstream connection
 *     and are handed to the session manager in-memory; they are NEVER returned,
 *     logged, or persisted.
 *   - Every API-facing payload is sanitized (no passwordEncrypted, no creds).
 *
 * Reuses existing infrastructure: config/prisma, utils/AppError,
 * services/auditService, services/storageService, utils/cryptoBox.
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
const manager = require('./streamSessionManager');

const STREAM_AUDIT = 'CAMERA_STREAM';

// Map a manager lifecycle event → the Camera.streamStatus we persist.
const EVENT_STATUS = {
  STREAM_OPENED: 'CONNECTING',
  CONNECTED: 'ONLINE',
  RECONNECTING: 'RECONNECTING',
  DISCONNECTED: 'OFFLINE',
  ERROR: 'ERROR',
  STREAM_CLOSED: 'OFFLINE',
};

/** Strip secrets from a camera row before returning it to any caller. */
const sanitizeCamera = (cam) => {
  if (!cam) return cam;
  const { passwordEncrypted, videoFilePath, ...rest } = cam;
  return { ...rest, hasPassword: Boolean(passwordEncrypted), hasVideo: Boolean(videoFilePath) };
};

// ─── Manager event sink: persist state + append connection log ────────────────
// Registered once at module load. Best-effort and fully isolated from the live
// stream — a DB hiccup never disrupts playback.
manager.setEventHandler((cameraId, ev) => {
  const data = { streamStatus: EVENT_STATUS[ev.event] || undefined };
  if (ev.event === 'CONNECTED') {
    data.lastConnectedAt = ev.lastConnectedAt || new Date();
    data.lastStreamAt = ev.lastStreamAt || new Date();
    data.health = 'ONLINE';
    if (ev.metrics && ev.metrics.resolution) data.resolution = ev.metrics.resolution;
    if (ev.metrics && typeof ev.metrics.fps === 'number') data.fps = ev.metrics.fps;
  }
  if (ev.event === 'DISCONNECTED' || ev.event === 'STREAM_CLOSED') {
    data.lastDisconnectedAt = ev.lastDisconnectedAt || new Date();
  }
  if (ev.event === 'ERROR') {
    data.lastDisconnectedAt = ev.lastDisconnectedAt || new Date();
    data.health = 'OFFLINE';
  }

  // Persist camera state (only when there is something to write).
  const ops = [];
  if (Object.keys(data).some((k) => data[k] !== undefined)) {
    ops.push(prisma.camera.update({ where: { id: cameraId }, data }).catch(() => {}));
  }
  // Append a connection-log entry for the meaningful lifecycle events.
  if (['STREAM_OPENED', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'ERROR', 'STREAM_CLOSED'].includes(ev.event)) {
    ops.push(prisma.cameraStreamLog.create({
      data: { cameraId, event: ev.event, status: ev.status, message: ev.message || null },
    }).catch(() => {}));
  }
  Promise.all(ops).catch(() => {});
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

const loadCamera = async (id) => {
  const cam = await prisma.camera.findUnique({ where: { id } });
  if (!cam) throw new AppError(`Camera "${id}" was not found.`, 404);
  return cam;
};

/** Decrypt stored credentials for in-memory upstream use only. */
const credentialsFor = (cam) => ({
  username: cam.username || null,
  password: cam.passwordEncrypted ? decrypt(cam.passwordEncrypted) : null,
});

/** Merge live session state with the durable camera mirror into one status view. */
const buildStatus = (cam) => {
  const snap = manager.snapshot(cam.id);
  return {
    cameraId: cam.id,
    streamType: cam.streamType,
    // Live session state wins when active; otherwise the persisted mirror.
    status: snap.active ? snap.status : cam.streamStatus,
    health: cam.health,
    descriptor: snap.descriptor,
    resolution: snap.metrics.resolution ?? cam.resolution ?? null,
    fps: snap.metrics.fps ?? cam.fps ?? null,
    viewers: snap.viewers,
    attempts: snap.attempts,
    error: snap.error,
    lastConnectedAt: snap.lastConnectedAt ?? cam.lastConnectedAt ?? null,
    lastDisconnectedAt: snap.lastDisconnectedAt ?? cam.lastDisconnectedAt ?? null,
    lastStreamAt: snap.lastStreamAt ?? cam.lastStreamAt ?? null,
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/** Open (or join) a camera's live stream. Returns camera + sanitized status. */
const openStream = async (cameraId, viewerId, actingUserId = null) => {
  const cam = await loadCamera(cameraId);
  if (cam.status === 'INACTIVE') {
    throw new AppError('This camera is inactive. Re-activate it before streaming.', 409);
  }
  await manager.join(cam, credentialsFor(cam), viewerId);
  await auditService.logAction(STREAM_AUDIT, 'STREAM_OPENED', cameraId, `Opened live stream (${cam.streamType})`, actingUserId);
  const fresh = await loadCamera(cameraId);
  return { camera: sanitizeCamera(fresh), stream: buildStatus(fresh) };
};

/** Leave a camera's live stream (reference-counted). */
const closeStream = async (cameraId, viewerId, actingUserId = null) => {
  manager.leave(cameraId, viewerId);
  await auditService.logAction(STREAM_AUDIT, 'STREAM_CLOSED', cameraId, 'Viewer left live stream', actingUserId);
  const snap = manager.snapshot(cameraId);
  return { cameraId, status: snap.active ? snap.status : 'OFFLINE', viewers: snap.viewers };
};

/** Force a reconnect of an active session ("Refresh Stream"). */
const refreshStream = async (cameraId, actingUserId = null) => {
  const cam = await loadCamera(cameraId);
  if (!manager.hasSession(cameraId)) {
    // Nothing to refresh — open a transient session keyed to a synthetic viewer.
    await manager.join(cam, credentialsFor(cam), `refresh:${crypto.randomUUID()}`);
  } else {
    await manager.refresh(cameraId);
  }
  await auditService.logAction(STREAM_AUDIT, 'STREAM_REFRESHED', cameraId, 'Manual stream refresh', actingUserId);
  const fresh = await loadCamera(cameraId);
  return buildStatus(fresh);
};

/** Current merged stream status for one camera. */
const getStatus = async (cameraId) => {
  const cam = await loadCamera(cameraId);
  return buildStatus(cam);
};

/** Connection logs for one camera (most recent first). */
const getLogs = async (cameraId, limit = 50) => {
  await loadCamera(cameraId);
  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  return prisma.cameraStreamLog.findMany({
    where: { cameraId },
    orderBy: { createdAt: 'desc' },
    take,
  });
};

/**
 * Live wall: every camera plus its merged stream state, in one efficient call.
 * Scales to hundreds of cameras (single query + O(1) in-memory lookups).
 */
const listLive = async (query = {}) => {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.health) where.health = query.health;
  if (query.zone) where.zone = query.zone;
  if (query.streamType) where.streamType = query.streamType;
  if (query.site) where.site = query.site;
  if (query.search) {
    const s = String(query.search).trim();
    where.OR = [
      { cameraName: { contains: s, mode: 'insensitive' } },
      { cameraCode: { contains: s, mode: 'insensitive' } },
      { location: { contains: s, mode: 'insensitive' } },
      { zone: { contains: s, mode: 'insensitive' } },
    ];
  }
  const cams = await prisma.camera.findMany({ where, orderBy: { cameraName: 'asc' } });
  return cams.map((cam) => ({ ...sanitizeCamera(cam), stream: buildStatus(cam) }));
};

// ─── Uploaded demo video association ──────────────────────────────────────────

const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v', '.mkv']);

/**
 * Persist an uploaded video buffer and associate it with a camera as its demo
 * source. Switches the camera to UPLOADED_VIDEO so it behaves like a live feed.
 */
const associateVideo = async (cameraId, { buffer, originalName }, actingUserId = null) => {
  const cam = await loadCamera(cameraId);
  const ext = path.extname(originalName || '').toLowerCase() || '.mp4';
  if (!ALLOWED_VIDEO_EXT.has(ext)) {
    throw new AppError(`Unsupported video type "${ext}". Allowed: ${[...ALLOWED_VIDEO_EXT].join(', ')}.`, 400);
  }
  if (!buffer || buffer.length === 0) throw new AppError('No video data was received.', 400);
  if (buffer.length > env.VIDEO_MAX_BYTES) {
    throw new AppError(`Video exceeds the maximum size of ${Math.round(env.VIDEO_MAX_BYTES / (1024 * 1024))} MB.`, 413);
  }

  const safeName = `${cameraId}_${crypto.randomUUID()}${ext}`;
  const fileRef = await storageService.saveFile(safeName, buffer, env.VIDEO_UPLOAD_DIR);

  // Remove any previously associated file to avoid orphans.
  if (cam.videoFilePath && cam.videoFilePath !== fileRef) {
    await storageService.deleteFile(cam.videoFilePath).catch(() => {});
  }

  const updated = await prisma.camera.update({
    where: { id: cameraId },
    data: {
      videoFilePath: fileRef,
      videoFileName: path.basename(originalName || safeName),
      streamType: 'UPLOADED_VIDEO',
    },
  });
  await auditService.logAction(STREAM_AUDIT, 'VIDEO_ASSOCIATED', cameraId, `Associated demo video ${updated.videoFileName}`, actingUserId);
  return sanitizeCamera(updated);
};

/** Remove a camera's associated demo video. */
const clearVideo = async (cameraId, actingUserId = null) => {
  const cam = await loadCamera(cameraId);
  if (cam.videoFilePath) await storageService.deleteFile(cam.videoFilePath).catch(() => {});
  const updated = await prisma.camera.update({
    where: { id: cameraId },
    data: { videoFilePath: null, videoFileName: null },
  });
  await auditService.logAction(STREAM_AUDIT, 'VIDEO_CLEARED', cameraId, 'Removed demo video', actingUserId);
  return sanitizeCamera(updated);
};

/**
 * Resolve the absolute path of a camera's playable file (uploaded video) for
 * range-supported serving. Throws if the camera is not a file source.
 */
const resolveVideoFile = async (cameraId) => {
  const cam = await loadCamera(cameraId);
  if (cam.streamType !== 'UPLOADED_VIDEO' || !cam.videoFilePath) {
    throw new AppError('This camera has no uploaded video to play.', 404);
  }
  const abs = storageService.getFilePath(cam.videoFilePath);
  if (!fs.existsSync(abs)) throw new AppError('The associated video file is missing.', 404);
  return { absolutePath: abs, fileName: cam.videoFileName, camera: cam };
};

/** Resolve the upstream HTTP source for backend proxying (HTTP/MJPEG cameras). */
const resolveProxyTarget = async (cameraId) => {
  const cam = await loadCamera(cameraId);
  if (cam.streamType !== 'HTTP' || !cam.streamUrl) {
    throw new AppError('This camera does not expose a proxyable HTTP stream.', 404);
  }
  return { url: cam.streamUrl, credentials: credentialsFor(cam), camera: cam };
};

module.exports = {
  openStream,
  closeStream,
  refreshStream,
  getStatus,
  getLogs,
  listLive,
  associateVideo,
  clearVideo,
  resolveVideoFile,
  resolveProxyTarget,
  sanitizeCamera,
};
