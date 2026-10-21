/**
 * streamHealthService — background stream-health reconciliation.
 *
 * Periodically re-probes every active live session so silent upstream drops are
 * detected and reconnection kicks in even when no frame is flowing. Import-safe:
 * importing this module starts nothing. The runtime entry point (server.js)
 * calls start(); tests and app.js can import the API surface freely.
 *
 * The loop is defensive — a single camera's failure can never stop monitoring
 * of the others, and it never throws out of the interval callback.
 */

'use strict';

const env = require('../config/env');
const manager = require('./streamSessionManager');

let timer = null;
let running = false;

const tick = async () => {
  if (running) return; // avoid overlap on a slow probe cycle
  running = true;
  try {
    const ids = manager.activeCameraIds();
    // Probe concurrently but isolate failures per camera.
    await Promise.all(ids.map((id) => manager.healthCheck(id).catch(() => {})));
  } catch {
    // Never let the monitor crash the process.
  } finally {
    running = false;
  }
};

/** Begin periodic health reconciliation. Idempotent. */
const start = () => {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, env.STREAM_HEALTH_POLL_MS);
  if (typeof timer.unref === 'function') timer.unref(); // don't keep the event loop alive alone
  console.log(`[STREAM] Health monitor started (every ${env.STREAM_HEALTH_POLL_MS} ms).`);
};

/** Stop the loop. Does not tear down sessions (use manager.stopAll for that). */
const stop = () => {
  if (timer) { clearInterval(timer); timer = null; }
};

module.exports = { start, stop, tick };
