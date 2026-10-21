/**
 * Surveillance Controller (Phase 13) — HTTP layer only, no business logic.
 *
 * User-facing alert dashboard + management, plus the internal endpoints the
 * Python AI worker uses (ingest / heartbeat / camera jobs). The snapshot
 * endpoint streams an image and manages its own response.
 */

'use strict';

const surveillanceService = require('../services/surveillanceService');
const { sendSuccess } = require('../utils/responseHelper');

// ── Dashboard / alerts ──────────────────────────────────────────────────────
const list = async (req, res) => {
  const data = await surveillanceService.listAlerts(req.query);
  sendSuccess(res, 200, 'Alerts retrieved.', data);
};

const summary = async (req, res) => {
  const data = await surveillanceService.getSummary();
  sendSuccess(res, 200, 'Alert summary retrieved.', data);
};

const getById = async (req, res) => {
  const data = await surveillanceService.getAlert(req.params.id);
  sendSuccess(res, 200, 'Alert retrieved.', data);
};

const acknowledge = async (req, res) => {
  const data = await surveillanceService.acknowledgeAlert(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Alert acknowledged.', data);
};

const resolve = async (req, res) => {
  const data = await surveillanceService.resolveAlert(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Alert resolved.', data);
};

const dismiss = async (req, res) => {
  const data = await surveillanceService.dismissAlert(req.params.id, req.user.id);
  sendSuccess(res, 200, 'Alert dismissed.', data);
};

const snapshot = async (req, res) => {
  const abs = await surveillanceService.resolveSnapshot(req.params.id);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(abs);
};

// ── Per-camera ──────────────────────────────────────────────────────────────
const cameraAlerts = async (req, res) => {
  const data = await surveillanceService.getRecentForCamera(req.params.id, req.query.limit);
  sendSuccess(res, 200, 'Camera alerts retrieved.', data);
};

const cameraMotion = async (req, res) => {
  const data = surveillanceService.getCameraLiveMotion(req.params.id);
  sendSuccess(res, 200, 'Live motion state retrieved.', data);
};

const getMotionConfig = async (req, res) => {
  const data = await surveillanceService.getCameraMotionConfig(req.params.id);
  sendSuccess(res, 200, 'Motion configuration retrieved.', data);
};

const setMotionConfig = async (req, res) => {
  const data = await surveillanceService.setCameraMotionConfig(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Motion configuration updated.', data);
};

const getWallConfig = async (req, res) => {
  const data = await surveillanceService.getCameraWallConfig(req.params.id);
  sendSuccess(res, 200, 'Wall intrusion configuration retrieved.', data);
};

const setWallConfig = async (req, res) => {
  const data = await surveillanceService.setCameraWallConfig(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Wall intrusion configuration updated.', data);
};

const getWagonConfig = async (req, res) => {
  const data = await surveillanceService.getCameraWagonConfig(req.params.id);
  sendSuccess(res, 200, 'Man-inside-wagon configuration retrieved.', data);
};

const setWagonConfig = async (req, res) => {
  const data = await surveillanceService.setCameraWagonConfig(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Man-inside-wagon configuration updated.', data);
};

const getOverSpeedConfig = async (req, res) => {
  const data = await surveillanceService.getCameraOverSpeedConfig(req.params.id);
  sendSuccess(res, 200, 'Over-speed configuration retrieved.', data);
};

const setOverSpeedConfig = async (req, res) => {
  const data = await surveillanceService.setCameraOverSpeedConfig(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Over-speed configuration updated.', data);
};

const getCancelledConfig = async (req, res) => {
  const data = await surveillanceService.getCameraCancelledConfig(req.params.id);
  sendSuccess(res, 200, 'Cancelled-vehicle configuration retrieved.', data);
};

const setCancelledConfig = async (req, res) => {
  const data = await surveillanceService.setCameraCancelledConfig(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Cancelled-vehicle configuration updated.', data);
};

const getFaceConfig = async (req, res) => {
  const data = await surveillanceService.getCameraFaceConfig(req.params.id);
  sendSuccess(res, 200, 'Face-detection configuration retrieved.', data);
};

const setFaceConfig = async (req, res) => {
  const data = await surveillanceService.setCameraFaceConfig(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'Face-detection configuration updated.', data);
};

const getZones = async (req, res) => {
  const data = await surveillanceService.getCameraZonesPublic(req.params.id);
  sendSuccess(res, 200, 'Zones retrieved.', data);
};

const setZones = async (req, res) => {
  const data = await surveillanceService.setCameraZones(req.params.id, req.body.zones, req.user.id);
  sendSuccess(res, 200, 'Zones updated.', data);
};

const serviceStatus = async (req, res) => {
  const data = await surveillanceService.getServiceStatus();
  sendSuccess(res, 200, 'AI service status retrieved.', data);
};

// ── Internal (AI worker, service token) ───────────────────────────────────────
const ingest = async (req, res) => {
  const data = await surveillanceService.ingestAlert(req.body);
  sendSuccess(res, data.created ? 201 : 200, data.created ? 'Alert ingested.' : 'Alert de-duplicated.', data);
};

const heartbeat = async (req, res) => {
  const data = surveillanceService.recordHeartbeat(req.body);
  sendSuccess(res, 200, 'Heartbeat recorded.', data);
};

const workerCameras = async (req, res) => {
  const data = await surveillanceService.listCamerasForWorker();
  sendSuccess(res, 200, 'Camera jobs retrieved.', data);
};

const workerFaces = async (req, res) => {
  const data = await surveillanceService.listFacesForWorker();
  sendSuccess(res, 200, 'Face gallery retrieved.', data);
};

module.exports = {
  list, summary, getById, acknowledge, resolve, dismiss, snapshot,
  cameraAlerts, cameraMotion, getMotionConfig, setMotionConfig,
  getWallConfig, setWallConfig, getWagonConfig, setWagonConfig,
  getOverSpeedConfig, setOverSpeedConfig, getCancelledConfig, setCancelledConfig,
  getFaceConfig, setFaceConfig, getZones, setZones, serviceStatus,
  ingest, heartbeat, workerCameras, workerFaces,
};
