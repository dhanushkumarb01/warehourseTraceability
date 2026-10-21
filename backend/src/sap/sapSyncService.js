/**
 * SAP Synchronization Service
 *
 * Synchronises warehouse entities with SAP and records every attempt in
 * SAPSyncLog. Built for manual, automatic, scheduled and retry-driven syncing:
 *   - each sync is wrapped by the retry handler (bounded exponential backoff),
 *   - the request/response payloads and attempt count are persisted,
 *   - SAP outages never throw to the caller — they are logged as FAILED with
 *     the payload retained so an admin (or a future background job) can retry.
 *
 * Audit actions: SAP_SYNC_STARTED, SAP_SYNC_COMPLETED, SAP_SYNC_FAILED,
 * SAP_RETRY_EXECUTED.
 */

'use strict';

const { getConnector, getMode } = require('./connectors');
const { withRetry } = require('./sapRetryHandler');
const sapLogService = require('./sapLogService');
const mappingUtils = require('./sapMappingUtils');
const auditService = require('../services/auditService');

/**
 * Generic sync runner. Never throws — returns { status, log }.
 */
const runSync = async ({ entityType, entityId, requestPayload, op, actingUserId = null }) => {
  const log = await sapLogService.createSyncLog({ entityType, entityId, syncType: entityType, requestPayload, status: 'PENDING' });
  await auditService.logAction('SAP', 'SAP_SYNC_STARTED', entityId, JSON.stringify({ entityType, mode: getMode() }), actingUserId);
  await sapLogService.updateSyncLog(log?.id, { status: 'IN_PROGRESS' });

  let attempts = 0;
  try {
    const { result, attempts: n } = await withRetry(op, { onAttempt: (a) => { attempts = a; } });
    await sapLogService.updateSyncLog(log?.id, {
      status: 'SUCCESS', responsePayload: result ?? null, attemptCount: n, errorMessage: null,
    });
    await auditService.logAction('SAP', 'SAP_SYNC_COMPLETED', entityId, JSON.stringify({ entityType, attempts: n }), actingUserId);
    return { status: 'SUCCESS', log: { ...log, status: 'SUCCESS', attemptCount: n }, response: result };
  } catch (err) {
    await sapLogService.updateSyncLog(log?.id, {
      status: 'FAILED', errorMessage: err.message, attemptCount: err.attempts || attempts || 1,
    });
    await auditService.logAction('SAP', 'SAP_SYNC_FAILED', entityId, JSON.stringify({ entityType, error: err.message }), actingUserId);
    return { status: 'FAILED', log: { ...log, status: 'FAILED' }, error: err.message };
  }
};

// ─── Entity-specific syncs ────────────────────────────────────────────────────
const syncMaterial = (material, actingUserId = null) => {
  const connector = getConnector();
  const payload = mappingUtils.toSapMaterialPayload(material);
  return runSync({
    entityType: 'MATERIAL', entityId: material.id, requestPayload: payload,
    op: () => connector.getMaterial(payload.materialNumber), actingUserId,
  });
};

const syncInventory = (material, actingUserId = null) => {
  const connector = getConnector();
  const materialNumber = mappingUtils.toSapMaterialNumber(material);
  return runSync({
    entityType: 'INVENTORY', entityId: material.id, requestPayload: { materialNumber },
    op: () => connector.getInventory(materialNumber), actingUserId,
  });
};

const syncDispatch = (dispatch, lot, actingUserId = null) => {
  const connector = getConnector();
  const payload = mappingUtils.toSapDeliveryPayload(dispatch, lot);
  return runSync({
    entityType: 'DISPATCH', entityId: dispatch.id, requestPayload: payload,
    op: () => connector.createDispatch(payload), actingUserId,
  });
};

const syncStatus = (material, actingUserId = null) => {
  const connector = getConnector();
  const materialNumber = mappingUtils.toSapMaterialNumber(material);
  return runSync({
    entityType: 'STATUS', entityId: material.id, requestPayload: { materialNumber },
    op: () => connector.getMaterial(materialNumber), actingUserId,
  });
};

// ─── Retry a previously-failed sync ───────────────────────────────────────────
const retrySync = async (syncId, actingUserId = null) => {
  const log = await sapLogService.getSyncLog(syncId);
  if (!log) return { status: 'NOT_FOUND' };

  const connector = getConnector();
  const payload = log.requestPayload || {};
  const ops = {
    MATERIAL: () => connector.getMaterial(payload.materialNumber),
    INVENTORY: () => connector.getInventory(payload.materialNumber),
    DISPATCH: () => connector.createDispatch(payload),
    STATUS: () => connector.getMaterial(payload.materialNumber),
  };
  const op = ops[log.entityType];
  if (!op) return { status: 'UNSUPPORTED' };

  await auditService.logAction('SAP', 'SAP_RETRY_EXECUTED', log.entityId, JSON.stringify({ syncId, entityType: log.entityType }), actingUserId);
  await sapLogService.updateSyncLog(syncId, { status: 'IN_PROGRESS' });

  let attempts = 0;
  try {
    const { result, attempts: n } = await withRetry(op, { onAttempt: (a) => { attempts = a; } });
    await sapLogService.updateSyncLog(syncId, {
      status: 'SUCCESS', responsePayload: result ?? null, errorMessage: null,
      attemptCount: (log.attemptCount || 0) + n,
    });
    await auditService.logAction('SAP', 'SAP_SYNC_COMPLETED', log.entityId, JSON.stringify({ retriedSyncId: syncId, attempts: n }), actingUserId);
    return { status: 'SUCCESS' };
  } catch (err) {
    await sapLogService.updateSyncLog(syncId, {
      status: 'FAILED', errorMessage: err.message,
      attemptCount: (log.attemptCount || 0) + (err.attempts || attempts || 1),
    });
    await auditService.logAction('SAP', 'SAP_SYNC_FAILED', log.entityId, JSON.stringify({ retriedSyncId: syncId, error: err.message }), actingUserId);
    return { status: 'FAILED', error: err.message };
  }
};

// ─── Connection status (for the dashboard) ────────────────────────────────────
const getConnectionStatus = async () => {
  const connector = getConnector();
  try {
    const info = await withRetry(() => connector.ping(), { maxRetries: 1 });
    return { connected: true, mode: getMode(), info: info.result };
  } catch (err) {
    return { connected: false, mode: getMode(), error: err.message };
  }
};

module.exports = {
  syncMaterial,
  syncInventory,
  syncDispatch,
  syncStatus,
  retrySync,
  getConnectionStatus,
};
