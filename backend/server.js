/**
 * Server Entry Point
 *
 * Responsible only for binding the HTTP server to a port.
 * Application configuration lives in src/app.js.
 * Environment values are read via src/config/env.js.
 */

'use strict';

// Must be called before importing config/env.js which reads process.env
require('dotenv').config();

const app = require('./src/app');
const env = require('./src/config/env');
const streamHealthService = require('./src/services/streamHealthService');
const streamSessionManager = require('./src/services/streamSessionManager');

const server = app.listen(env.PORT, () => {
  console.log(`[SERVER] Warehouse Traceability API  →  http://localhost:${env.PORT}`);
  console.log(`[SERVER] Environment : ${env.NODE_ENV}`);
  console.log(`[SERVER] CORS origin : ${env.FRONTEND_URL}`);
  // Start background stream-health reconciliation (import-safe: only here, not
  // in app.js, so tests importing the app never spin up timers).
  streamHealthService.start();
});

/** Stop streaming background work, then close the HTTP server. */
const shutdown = (code = 0) => {
  try { streamHealthService.stop(); streamSessionManager.stopAll(); } catch { /* ignore */ }
  server.close(() => process.exit(code));
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received. Shutting down gracefully…');
  shutdown(0);
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received. Shutting down…');
  shutdown(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER] Unhandled Promise Rejection:', reason);
  shutdown(1);
});