/**
 * RFID Controller (Phase 10) — HTTP layer only.
 */

'use strict';

const rfidService = require('../services/rfidService');
const { sendSuccess } = require('../utils/responseHelper');

// ── Event pipeline (simulator + hardware) ──────────────────────────────────
const ingestEvent = async (req, res) => {
  const result = await rfidService.ingestEvent(req.body, req.user.id);
  const decision = result.alerts.length ? `recorded with ${result.alerts.length} alert(s)` : 'recorded';
  sendSuccess(res, 201, `RFID event ${decision}.`, result);
};

// ── Reader registry ─────────────────────────────────────────────────────────
const getReaderDashboard = async (req, res) => {
  const data = await rfidService.getReaderDashboard();
  sendSuccess(res, 200, 'Reader health retrieved.', data);
};

const listReaders = async (req, res) => {
  const readers = await rfidService.listReaders();
  sendSuccess(res, 200, 'Readers retrieved.', readers);
};

const getReader = async (req, res) => {
  const reader = await rfidService.getReader(req.params.id);
  sendSuccess(res, 200, 'Reader retrieved.', reader);
};

const createReader = async (req, res) => {
  const reader = await rfidService.createReader(req.body, req.user.id);
  sendSuccess(res, 201, 'Reader created.', reader);
};

const updateReader = async (req, res) => {
  const reader = await rfidService.updateReader(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Reader updated.', reader);
};

const deleteReader = async (req, res) => {
  await rfidService.deleteReader(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Reader deleted.');
};

const heartbeat = async (req, res) => {
  const reader = await rfidService.heartbeat(req.params.id);
  sendSuccess(res, 200, 'Heartbeat recorded.', reader);
};

module.exports = {
  ingestEvent,
  getReaderDashboard,
  listReaders,
  getReader,
  createReader,
  updateReader,
  deleteReader,
  heartbeat,
};
