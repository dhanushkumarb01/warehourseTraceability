/**
 * Express Application Bootstrap
 *
 * Configures and exports the Express app instance.
 * server.js is responsible for binding the port — keeping them separate
 * makes the app importable for integration tests without starting a server.
 *
 * Middleware registration order matters:
 *   1. Security / CORS
 *   2. Body parsers
 *   3. Route handlers
 *   4. 404 handler
 *   5. Global error handler (must be last and have 4 arguments)
 */

'use strict';

// Load env vars before importing the config module that reads them.
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const corsConfig = require('./config/cors');
const bayRoutes = require('./routes/bayRoutes');
const qrRoutes = require('./routes/qrRoutes');
const materialRoutes = require('./routes/materialRoutes');
const lotRoutes = require('./routes/lotRoutes');
const mappingRoutes = require('./routes/mappingRoutes');
const placementRoutes = require('./routes/placementRoutes');
const inboundRoutes = require('./routes/inboundRoutes');
const { zoneRouter, dockRouter } = require('./routes/locationRoutes');
const dispatchRoutes = require('./routes/dispatchRoutes');
const gateValidationRoutes = require('./routes/gateValidationRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const auditRoutes = require('./routes/auditRoutes');
const sapRoutes = require('./sap/sapRoutes');
const sapMockRoutes = require('./sap/mock/sapMockRoutes');
const truckRoutes = require('./routes/truckRoutes');
const rfidRoutes = require('./routes/rfidRoutes');
const cameraRoutes = require('./routes/cameraRoutes');
const streamRoutes = require('./routes/streamRoutes');
const surveillanceRoutes = require('./routes/surveillanceRoutes');
const faceRoutes = require('./routes/faceRoutes');
const globalErrorHandler = require('./middleware/errorHandler');
const { sendError } = require('./utils/responseHelper');

const app = express();

// ─── Security & CORS ──────────────────────────────────────────────────────────
//
// cors() is registered as app-level middleware, which automatically handles
// pre-flight OPTIONS requests for every route when the `preflightContinue`
// option is false (the default). An explicit app.options('*') is therefore
// not needed and would fail under Express 5's strict path-to-regexp v8.

app.use(cors(corsConfig));

// ─── Body Parsers ─────────────────────────────────────────────────────────────

// The global JSON limit stays tight (10kb) for the whole API. The AI worker's
// alert-ingest endpoints carry base64 snapshot evidence and parse their own body
// with a larger, configurable limit, so they are skipped here.
const jsonParser = express.json({ limit: '10kb' });
// Face-enrollment routes carry a base64 image; they parse their own body with a
// larger limit inside faceRoutes, so they are skipped here (like the AI worker).
const FACE_IMAGE_PATH = /^\/api\/faces\/[^/]+\/faces$/;
app.use((req, res, next) => {
  if (req.path.startsWith('/api/surveillance/ai/')) return next();
  if (FACE_IMAGE_PATH.test(req.path)) return next();
  return jsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

// ─── Health Check ─────────────────────────────────────────────────────────────

// Also exposed at /health for platform health checks (Render).
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Warehouse Traceability API is running.',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/bays', bayRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/placement', placementRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/zones', zoneRouter);
app.use('/api/loading-docks', dockRouter);
app.use('/api/dispatches', dispatchRoutes);
app.use('/api/gate-validations', gateValidationRoutes);

// SAP integration API (warehouse-facing) and the simulated external SAP ERP.
// In production, remove the mock router and point SAP_BASE_URL at the real SAP.
app.use('/api/sap', sapRoutes);
app.use('/sap', sapMockRoutes);
app.use('/api/trucks', truckRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/surveillance', surveillanceRoutes);
app.use('/api/faces', faceRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found.`);
});

// ─── Global Error Handler (must be last) ─────────────────────────────────────

app.use(globalErrorHandler);

module.exports = app;