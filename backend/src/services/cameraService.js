/**
 * Camera Service (Phase 11 — AI Surveillance foundation)
 *
 * Owns all business logic and DB access for the camera registry. Controllers
 * never touch Prisma directly. Follows the platform conventions exactly
 * (AppError, audit logging, sanitized responses).
 *
 * Security:
 *   - Stream passwords are encrypted at rest (utils/cryptoBox, AES-256-GCM) and
 *     NEVER returned. Responses expose only a `hasPassword` boolean.
 *   - The decrypted password is used solely internally (test-connection today;
 *     a streaming proxy later).
 *
 * The connection probe performs a REAL reachability check (TCP for RTSP/RTMP,
 * HTTP request for HTTP) — results are never faked.
 */

'use strict';

const net = require('net');
const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const { encrypt, decrypt } = require('../utils/cryptoBox');

const CAMERA_AUDIT = 'CAMERA';
const STREAM_TYPES = ['RTSP', 'RTMP', 'HTTP', 'LOCAL_WEBCAM', 'UPLOADED_VIDEO'];

const SORTABLE = new Set(['createdAt', 'cameraName', 'cameraCode', 'status', 'health', 'zone', 'lastConnectivityCheck']);

/**
 * Strip secrets and internal storage references; surface only booleans. Never
 * expose the encrypted password or the on-disk video path.
 */
const sanitize = (cam) => {
  if (!cam) return cam;
  const { passwordEncrypted, videoFilePath, ...rest } = cam;
  return { ...rest, hasPassword: Boolean(passwordEncrypted), hasVideo: Boolean(videoFilePath) };
};

// ─── Listing (search / filter / sort / pagination) ───────────────────────────
const listCameras = async (q = {}) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 12));
  const sortBy = SORTABLE.has(q.sortBy) ? q.sortBy : 'createdAt';
  const sortOrder = q.sortOrder === 'asc' ? 'asc' : 'desc';

  const where = {};
  if (q.status) where.status = q.status;
  if (q.health) where.health = q.health;
  if (q.zone) where.zone = q.zone;
  if (q.streamType) where.streamType = q.streamType;
  if (q.site) where.site = q.site;
  if (q.search) {
    const s = String(q.search).trim();
    where.OR = [
      { cameraName: { contains: s, mode: 'insensitive' } },
      { cameraCode: { contains: s, mode: 'insensitive' } },
      { location: { contains: s, mode: 'insensitive' } },
      { zone: { contains: s, mode: 'insensitive' } },
      { cameraPurpose: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.camera.count({ where }),
    prisma.camera.findMany({ where, orderBy: { [sortBy]: sortOrder }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  return { items: rows.map(sanitize), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

/** Lightweight counts for the dashboard header. */
const getSummary = async () => {
  const [byStatus, byHealth, total] = await Promise.all([
    prisma.camera.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.camera.groupBy({ by: ['health'], _count: { _all: true } }),
    prisma.camera.count(),
  ]);
  const status = { ACTIVE: 0, INACTIVE: 0, MAINTENANCE: 0 };
  byStatus.forEach((r) => { status[r.status] = r._count._all; });
  const health = { ONLINE: 0, OFFLINE: 0, UNKNOWN: 0 };
  byHealth.forEach((r) => { health[r.health] = r._count._all; });
  return { total, status, health };
};

const getCamera = async (id) => {
  const cam = await prisma.camera.findUnique({ where: { id } });
  if (!cam) throw new AppError(`Camera "${id}" was not found.`, 404);
  return sanitize(cam);
};

// ─── Create / update / delete ─────────────────────────────────────────────────
const buildWriteData = (data) => ({
  cameraName: data.cameraName,
  location: data.location,
  cameraType: data.cameraType,
  cameraPurpose: data.cameraPurpose,
  description: data.description ?? null,
  streamType: data.streamType,
  streamUrl: data.streamUrl ?? null,
  username: data.username ?? null,
  zone: data.zone,
  site: data.site ?? null,
  status: data.status,
  installationDate: data.installationDate ? new Date(data.installationDate) : null,
  notes: data.notes ?? null,
  config: data.config ?? undefined,
  aiConfig: data.aiConfig ?? undefined,
});

const createCamera = async (data, actingUserId = null) => {
  const existing = await prisma.camera.findUnique({ where: { cameraCode: data.cameraCode } });
  if (existing) throw new AppError(`Camera code "${data.cameraCode}" is already in use.`, 409);

  const cam = await prisma.camera.create({
    data: {
      cameraCode: data.cameraCode,
      ...buildWriteData({ ...data, status: data.status || 'ACTIVE' }),
      passwordEncrypted: data.password ? encrypt(data.password) : null,
    },
  });
  await auditService.logAction(CAMERA_AUDIT, 'CAMERA_CREATED', cam.id, `Registered camera ${data.cameraCode} (${data.streamType})`, actingUserId);
  return sanitize(cam);
};

const updateCamera = async (id, data, actingUserId = null) => {
  const cam = await prisma.camera.findUnique({ where: { id } });
  if (!cam) throw new AppError(`Camera "${id}" was not found.`, 404);

  if (data.cameraCode && data.cameraCode !== cam.cameraCode) {
    const clash = await prisma.camera.findUnique({ where: { cameraCode: data.cameraCode } });
    if (clash) throw new AppError(`Camera code "${data.cameraCode}" is already in use.`, 409);
  }

  const writable = buildWriteData({
    cameraName: data.cameraName ?? cam.cameraName,
    location: data.location ?? cam.location,
    cameraType: data.cameraType ?? cam.cameraType,
    cameraPurpose: data.cameraPurpose ?? cam.cameraPurpose,
    description: data.description === undefined ? cam.description : data.description,
    streamType: data.streamType ?? cam.streamType,
    streamUrl: data.streamUrl === undefined ? cam.streamUrl : data.streamUrl,
    username: data.username === undefined ? cam.username : data.username,
    zone: data.zone ?? cam.zone,
    site: data.site === undefined ? cam.site : data.site,
    status: data.status ?? cam.status,
    installationDate: data.installationDate === undefined ? cam.installationDate : data.installationDate,
    notes: data.notes === undefined ? cam.notes : data.notes,
    config: data.config === undefined ? cam.config : data.config,
    aiConfig: data.aiConfig === undefined ? cam.aiConfig : data.aiConfig,
  });
  // Password: undefined = keep, '' = clear, value = re-encrypt.
  if (data.password !== undefined) writable.passwordEncrypted = data.password ? encrypt(data.password) : null;
  if (data.cameraCode) writable.cameraCode = data.cameraCode;

  const updated = await prisma.camera.update({ where: { id }, data: writable });
  const action = data.status && data.status !== cam.status ? 'CAMERA_STATUS_CHANGED' : 'CAMERA_UPDATED';
  await auditService.logAction(CAMERA_AUDIT, action, id, `Updated camera ${updated.cameraCode}${data.status && data.status !== cam.status ? ` → ${data.status}` : ''}`, actingUserId);
  return sanitize(updated);
};

const deleteCamera = async (id, actingUserId = null) => {
  const cam = await prisma.camera.findUnique({ where: { id } });
  if (!cam) throw new AppError(`Camera "${id}" was not found.`, 404);
  await prisma.camera.delete({ where: { id } });
  await auditService.logAction(CAMERA_AUDIT, 'CAMERA_DELETED', id, `Deleted camera ${cam.cameraCode}`, actingUserId);
};

// ─── Connection probe (REAL — never faked) ────────────────────────────────────
const DEFAULT_PORTS = { RTSP: 554, RTMP: 1935 };

const probeTcp = (host, port) => new Promise((resolve) => {
  const socket = new net.Socket();
  let settled = false;
  const done = (result, message) => { if (settled) return; settled = true; socket.destroy(); resolve({ result, message }); };
  socket.setTimeout(env.CAMERA_TEST_TIMEOUT_MS);
  socket.once('connect', () => done('SUCCESS', `Reachable at ${host}:${port}.`));
  socket.once('timeout', () => done('TIMEOUT', `No response from ${host}:${port} within ${env.CAMERA_TEST_TIMEOUT_MS} ms.`));
  socket.once('error', (err) => {
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') done('FAILED', `Host "${host}" could not be resolved.`);
    else if (err.code === 'ECONNREFUSED') done('FAILED', `Connection refused at ${host}:${port}.`);
    else done('FAILED', err.message);
  });
  socket.connect(port, host);
});

const probeHttp = async (url, username, password) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.CAMERA_TEST_TIMEOUT_MS);
  const headers = {};
  if (username || password) headers.Authorization = 'Basic ' + Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (res.status === 401 || res.status === 403) return { result: 'AUTH_FAILED', message: `Authentication failed (HTTP ${res.status}).` };
    if (res.ok || (res.status >= 200 && res.status < 400)) return { result: 'SUCCESS', message: `Stream endpoint responded (HTTP ${res.status}).` };
    return { result: 'FAILED', message: `Endpoint returned HTTP ${res.status}.` };
  } catch (err) {
    if (err.name === 'AbortError') return { result: 'TIMEOUT', message: `No response within ${env.CAMERA_TEST_TIMEOUT_MS} ms.` };
    return { result: 'FAILED', message: err.message };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Run a real connectivity probe. Accepts either ad-hoc connection details (for
 * the registration form's "Test Connection" before saving) or an existing
 * camera id (persists the outcome to lastConnectivityCheck/health).
 */
const testConnection = async ({ id = null, streamType, streamUrl, username, password }, actingUserId = null) => {
  let cam = null;
  if (id) {
    cam = await prisma.camera.findUnique({ where: { id } });
    if (!cam) throw new AppError(`Camera "${id}" was not found.`, 404);
    streamType = streamType || cam.streamType;
    streamUrl = streamUrl !== undefined ? streamUrl : cam.streamUrl;
    username = username !== undefined ? username : cam.username;
    if (password === undefined) password = cam.passwordEncrypted ? decrypt(cam.passwordEncrypted) : null;
  }

  if (!STREAM_TYPES.includes(streamType)) throw new AppError('A valid stream type is required.', 400);

  let outcome;
  if (streamType === 'LOCAL_WEBCAM' || streamType === 'UPLOADED_VIDEO') {
    outcome = { result: 'CLIENT_SIDE', message: `${streamType === 'LOCAL_WEBCAM' ? 'Local webcam' : 'Uploaded video'} is verified in the browser preview, not from the server.` };
  } else if (!streamUrl) {
    outcome = { result: 'INVALID_URL', message: 'A stream URL is required for this stream type.' };
  } else {
    let parsed;
    try { parsed = new URL(streamUrl); } catch { parsed = null; }
    if (!parsed) {
      outcome = { result: 'INVALID_URL', message: 'The stream URL could not be parsed.' };
    } else if (streamType === 'HTTP') {
      outcome = await probeHttp(streamUrl, username, password);
    } else {
      const port = Number(parsed.port) || DEFAULT_PORTS[streamType] || 0;
      if (!parsed.hostname || !port) outcome = { result: 'INVALID_URL', message: 'The stream URL is missing a host or port.' };
      else outcome = await probeTcp(parsed.hostname, port);
    }
  }

  const checkedAt = new Date();

  // Persist the outcome on an existing camera (health follows the probe).
  if (cam) {
    const health = outcome.result === 'SUCCESS' ? 'ONLINE'
      : outcome.result === 'CLIENT_SIDE' ? 'UNKNOWN'
      : 'OFFLINE';
    await prisma.camera.update({
      where: { id: cam.id },
      data: { lastConnectivityCheck: checkedAt, lastConnectivityResult: outcome.result, health },
    });
  }

  await auditService.logAction(CAMERA_AUDIT, 'CAMERA_TEST_CONNECTION', id || streamUrl || streamType,
    JSON.stringify({ streamType, result: outcome.result }), actingUserId);

  return { ...outcome, checkedAt, streamType };
};

module.exports = {
  listCameras,
  getSummary,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  testConnection,
};
