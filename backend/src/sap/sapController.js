/**
 * SAP Integration Controller  (/api/sap)
 *
 * The warehouse-facing API for the integration layer: connection status,
 * dashboard, sync/validation logs, manual sync triggers, retry, and validation
 * previews for the dispatch/gate UIs. Orchestration only — all SAP logic lives
 * in the sap services.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/responseHelper');
const sapSyncService = require('./sapSyncService');
const sapLogService = require('./sapLogService');
const sapValidationService = require('./sapValidationService');

const DISPATCH_INCLUDE = { lot: { include: { material: true } }, bay: true };

// ─── Status & dashboard ───────────────────────────────────────────────────────
const getStatus = async (req, res) => {
  const status = await sapSyncService.getConnectionStatus();
  sendSuccess(res, 200, 'SAP connection status retrieved.', status);
};

const getDashboard = async (req, res) => {
  const [summary, status] = await Promise.all([
    sapLogService.getDashboardSummary(),
    sapSyncService.getConnectionStatus(),
  ]);
  sendSuccess(res, 200, 'SAP dashboard retrieved.', { connection: status, ...summary });
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
const getSyncLogs = async (req, res) => {
  const logs = await sapLogService.listSyncLogs({ status: req.query.status, entityType: req.query.entityType, limit: req.query.limit });
  sendSuccess(res, 200, 'SAP sync logs retrieved.', logs);
};

const getValidationLogs = async (req, res) => {
  const logs = await sapLogService.listValidationLogs({ status: req.query.status, validationType: req.query.validationType, limit: req.query.limit });
  sendSuccess(res, 200, 'SAP validation logs retrieved.', logs);
};

// ─── Manual sync ──────────────────────────────────────────────────────────────
const syncMaterial = async (req, res) => {
  const material = await prisma.material.findUnique({ where: { id: req.params.materialId } });
  if (!material) throw new AppError('Material not found.', 404);
  const result = await sapSyncService.syncMaterial(material, req.user.id);
  sendSuccess(res, 200, `Material sync ${result.status.toLowerCase()}.`, result);
};

const syncInventory = async (req, res) => {
  const material = await prisma.material.findUnique({ where: { id: req.params.materialId } });
  if (!material) throw new AppError('Material not found.', 404);
  const result = await sapSyncService.syncInventory(material, req.user.id);
  sendSuccess(res, 200, `Inventory sync ${result.status.toLowerCase()}.`, result);
};

const syncDispatch = async (req, res) => {
  const dispatch = await prisma.dispatch.findUnique({ where: { id: req.params.dispatchId }, include: DISPATCH_INCLUDE });
  if (!dispatch) throw new AppError('Dispatch not found.', 404);
  const result = await sapSyncService.syncDispatch(dispatch, dispatch.lot, req.user.id);
  sendSuccess(res, 200, `Dispatch sync ${result.status.toLowerCase()}.`, result);
};

const retrySync = async (req, res) => {
  const result = await sapSyncService.retrySync(req.params.id, req.user.id);
  if (result.status === 'NOT_FOUND') throw new AppError('Sync log not found.', 404);
  sendSuccess(res, 200, `Retry ${result.status.toLowerCase()}.`, result);
};

// ─── Validation previews (for dispatch/gate UIs) ──────────────────────────────
const previewDispatchValidation = async (req, res) => {
  const dispatch = await prisma.dispatch.findUnique({ where: { id: req.params.id }, include: DISPATCH_INCLUDE });
  if (!dispatch) throw new AppError('Dispatch not found.', 404);
  const result = await sapValidationService.validateDispatchApproval({
    dispatch, lot: dispatch.lot, requestedQuantity: dispatch.approvedQuantity ?? dispatch.requestedQuantity,
    actingUserId: req.user.id, persist: false,
  });
  sendSuccess(res, 200, 'SAP dispatch validation preview.', result);
};

const previewGateValidation = async (req, res) => {
  const dispatch = await prisma.dispatch.findUnique({ where: { id: req.params.id }, include: DISPATCH_INCLUDE });
  if (!dispatch) throw new AppError('Dispatch not found.', 404);
  const result = await sapValidationService.validateGateExit({
    dispatch, lot: dispatch.lot, actingUserId: req.user.id, persist: false,
  });
  sendSuccess(res, 200, 'SAP gate validation preview.', result);
};

module.exports = {
  getStatus,
  getDashboard,
  getSyncLogs,
  getValidationLogs,
  syncMaterial,
  syncInventory,
  syncDispatch,
  retrySync,
  previewDispatchValidation,
  previewGateValidation,
};
