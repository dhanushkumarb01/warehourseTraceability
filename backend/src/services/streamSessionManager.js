/**
 * streamSessionManager — in-memory live-stream session registry.
 *
 * One session per camera, shared by all viewers (reference counted), so the
 * backend opens a single upstream connection no matter how many operators watch
 * — and never reconnects a stream that is already live. Designed to scale to
 * hundreds of concurrent cameras: state is O(1) per camera with no per-viewer
 * upstream cost.
 *
 * Responsibilities:
 *   - Reference-counted join/leave with idle teardown (efficient long sessions).
 *   - A resilient connection state machine:
 *       OFFLINE → CONNECTING → ONLINE
 *                     ↘ (failure) RECONNECTING → … → ERROR (after max attempts)
 *   - Automatic, interval-based reconnection that NEVER throws or crashes.
 *   - A frame-consumer subscription seam so future AI modules (PPE, Fire, Face,
 *     Motion, Vehicle, Crowd …) can attach to the SAME session without any
 *     architectural change.
 *
 * The manager is deliberately decoupled from Prisma/HTTP: it emits lifecycle
 * events through a single injected handler. Persistence, audit and logging live
 * in streamService. This keeps the manager pure and unit-testable.
 *
 * Decrypted credentials live only inside the in-memory session for the lifetime
 * of an active stream and are never emitted, persisted, or returned.
 */

'use strict';

const env = require('../config/env');
const { createDriver } = require('./streamDrivers');

const STATUS = Object.freeze({
  OFFLINE: 'OFFLINE',
  CONNECTING: 'CONNECTING',
  ONLINE: 'ONLINE',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR',
});

class StreamSessionManager {
  constructor() {
    /** @type {Map<string, object>} cameraId → session */
    this.sessions = new Map();
    /** Lifecycle event sink, injected by streamService. */
    this.onEvent = null;
  }

  /** Register the persistence/audit handler: (cameraId, {event,status,message,metrics}) => void */
  setEventHandler(fn) { this.onEvent = fn; }

  _emit(session, event, message = null) {
    if (typeof this.onEvent !== 'function') return;
    try {
      this.onEvent(session.cameraId, {
        event,
        status: session.status,
        message,
        metrics: { resolution: session.metrics.resolution, fps: session.metrics.fps },
        lastConnectedAt: session.lastConnectedAt,
        lastDisconnectedAt: session.lastDisconnectedAt,
        lastStreamAt: session.lastStreamAt,
      });
    } catch {
      // Persistence problems must never affect the live stream.
    }
  }

  _clearTimers(session) {
    if (session.reconnectTimer) { clearTimeout(session.reconnectTimer); session.reconnectTimer = null; }
    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
  }

  /**
   * Join (or open) the live session for a camera.
   * @param {object} camera     full camera row (with streamType, streamUrl, etc.)
   * @param {object} creds      { username, password } decrypted, in-memory only
   * @param {string} viewerId   stable id for this viewer (user id + tab)
   * @returns {object} sanitized snapshot
   */
  async join(camera, creds, viewerId) {
    let session = this.sessions.get(camera.id);

    if (!session) {
      session = {
        cameraId: camera.id,
        streamType: camera.streamType,
        status: STATUS.OFFLINE,
        descriptor: null,
        error: null,
        viewers: new Set(),
        frameConsumers: new Set(),
        attempts: 0,
        driver: createDriver(camera, creds),
        metrics: { resolution: camera.resolution || null, fps: camera.fps || null },
        createdAt: new Date(),
        lastActivityAt: new Date(),
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastStreamAt: null,
        _camera: camera,
        _creds: creds,
      };
      session.descriptor = session.driver.describe();
      this.sessions.set(camera.id, session);
      session.viewers.add(viewerId);
      session.status = STATUS.CONNECTING;
      this._emit(session, 'STREAM_OPENED');
      // Connect asynchronously; viewers get the CONNECTING snapshot immediately.
      this._connect(session);
    } else {
      // Reuse the existing connection — do NOT reconnect a healthy stream.
      this._clearTimers(session);
      session.viewers.add(viewerId);
      session.lastActivityAt = new Date();
      this._emit(session, 'SESSION_JOINED');
    }

    return this.snapshot(camera.id);
  }

  async _connect(session) {
    session.status = session.attempts > 0 ? STATUS.RECONNECTING : STATUS.CONNECTING;
    try {
      const result = await session.driver.connect();
      // A teardown may have happened while awaiting — guard against races.
      if (!this.sessions.has(session.cameraId)) return;

      if (result && result.ok) {
        session.status = STATUS.ONLINE;
        session.error = null;
        session.attempts = 0;
        const now = new Date();
        session.lastConnectedAt = now;
        session.lastStreamAt = now;
        if (result.metrics) {
          if (result.metrics.resolution) session.metrics.resolution = result.metrics.resolution;
          if (result.metrics.fps) session.metrics.fps = result.metrics.fps;
        }
        this._emit(session, 'CONNECTED');
      } else {
        session.error = (result && result.message) || 'Connection failed.';
        this._scheduleReconnect(session, session.error);
      }
    } catch (err) {
      session.error = err && err.message ? err.message : 'Connection error.';
      this._scheduleReconnect(session, session.error);
    }
  }

  _scheduleReconnect(session, reason) {
    session.lastDisconnectedAt = new Date();

    // No viewers → settle to OFFLINE instead of burning reconnect attempts.
    if (session.viewers.size === 0) {
      session.status = STATUS.OFFLINE;
      this._emit(session, 'DISCONNECTED', reason);
      return;
    }

    session.attempts += 1;
    if (session.attempts > env.STREAM_MAX_RECONNECT_ATTEMPTS) {
      session.status = STATUS.ERROR;
      this._emit(session, 'ERROR', `Giving up after ${session.attempts - 1} reconnection attempts: ${reason}`);
      return;
    }

    session.status = STATUS.RECONNECTING;
    this._emit(session, 'RECONNECTING', `Attempt ${session.attempts}/${env.STREAM_MAX_RECONNECT_ATTEMPTS}: ${reason}`);
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null;
      // Never let a timer callback throw out of the event loop.
      Promise.resolve(this._connect(session)).catch(() => {});
    }, env.STREAM_RECONNECT_INTERVAL_MS);
  }

  /** A viewer leaves. When the last viewer leaves, schedule idle teardown. */
  leave(cameraId, viewerId) {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    session.viewers.delete(viewerId);
    session.lastActivityAt = new Date();
    this._emit(session, 'SESSION_LEFT');

    if (session.viewers.size === 0 && session.frameConsumers.size === 0) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
      session.idleTimer = setTimeout(() => {
        try { this._teardown(cameraId, 'Idle — no active viewers.'); } catch { /* never crash */ }
      }, env.STREAM_IDLE_TIMEOUT_MS);
    }
  }

  /** Force a fresh reconnect (the "Refresh Stream" action). */
  async refresh(cameraId) {
    const session = this.sessions.get(cameraId);
    if (!session) return null;
    this._clearTimers(session);
    session.attempts = 0;
    session.error = null;
    await this._connect(session);
    return this.snapshot(cameraId);
  }

  _teardown(cameraId, reason) {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    this._clearTimers(session);
    if (session.driver && typeof session.driver.disconnect === 'function') {
      try { session.driver.disconnect(); } catch { /* ignore */ }
    }
    session.status = STATUS.OFFLINE;
    session.lastDisconnectedAt = new Date();
    this._emit(session, 'STREAM_CLOSED', reason);
    // Drop decrypted credentials and free memory.
    session._creds = null;
    this.sessions.delete(cameraId);
  }

  // ── Future AI seam ────────────────────────────────────────────────────────
  // PPE/Fire/Face/Motion/Vehicle/Crowd modules attach here to consume frames
  // from the SAME shared session. No frames are produced in this phase, but the
  // contract (and the keep-alive it implies) already exists.
  addFrameConsumer(cameraId, consumer) {
    const session = this.sessions.get(cameraId);
    if (!session) return false;
    session.frameConsumers.add(consumer);
    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
    return true;
  }

  removeFrameConsumer(cameraId, consumer) {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    session.frameConsumers.delete(consumer);
    if (session.viewers.size === 0 && session.frameConsumers.size === 0) {
      this.leave(cameraId, '__noop__'); // triggers idle teardown logic
    }
  }

  /**
   * Re-probe an active session to detect a silent upstream drop. Called by the
   * background health monitor. Skips sessions already mid-(re)connect to avoid
   * overlapping probes. Reuses the same success/failure transitions as connect.
   */
  async healthCheck(cameraId) {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    if (session.status === STATUS.CONNECTING || session.status === STATUS.RECONNECTING) return;
    if (session.viewers.size === 0 && session.frameConsumers.size === 0) return;
    await this._connect(session);
  }

  /** Update observed media metrics (used by the health monitor / future gateway). */
  updateMetrics(cameraId, { resolution, fps } = {}) {
    const session = this.sessions.get(cameraId);
    if (!session) return;
    if (resolution) session.metrics.resolution = resolution;
    if (typeof fps === 'number') session.metrics.fps = fps;
    session.lastStreamAt = new Date();
  }

  /** Sanitized snapshot for API responses — never contains credentials. */
  snapshot(cameraId) {
    const session = this.sessions.get(cameraId);
    if (!session) {
      return { active: false, status: STATUS.OFFLINE, descriptor: null, metrics: { resolution: null, fps: null }, viewers: 0, attempts: 0, error: null };
    }
    return {
      active: true,
      status: session.status,
      descriptor: session.descriptor,
      metrics: { resolution: session.metrics.resolution, fps: session.metrics.fps },
      viewers: session.viewers.size,
      attempts: session.attempts,
      error: session.error,
      lastConnectedAt: session.lastConnectedAt,
      lastDisconnectedAt: session.lastDisconnectedAt,
      lastStreamAt: session.lastStreamAt,
    };
  }

  hasSession(cameraId) { return this.sessions.has(cameraId); }
  activeCameraIds() { return [...this.sessions.keys()]; }
  getSession(cameraId) { return this.sessions.get(cameraId) || null; }

  /** Tear down every session (graceful shutdown). */
  stopAll() {
    for (const cameraId of [...this.sessions.keys()]) {
      try { this._teardown(cameraId, 'Server shutting down.'); } catch { /* ignore */ }
    }
  }
}

// Singleton — one registry per process.
const manager = new StreamSessionManager();
manager.STATUS = STATUS;

module.exports = manager;
