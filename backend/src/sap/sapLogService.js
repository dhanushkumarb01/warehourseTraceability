/**
 * SAP Log Service
 *
 * Persistence for SAP sync and validation logs, plus the dashboard summary.
 * Centralised so the sync/validation services and the API all read/write logs
 * through one module. Best-effort: logging failures never break the calling
 * operation.
 */

'use strict';

const prisma = require('../config/prisma');

// ─── Sync logs ────────────────────────────────────────────────────────────────
const createSyncLog = async ({ entityType, entityId, syncType, requestPayload = null, status = 'PENDING' }) => {
  try {
    return await prisma.sAPSyncLog.create({
      data: { entityType, entityId, syncType, requestPayload, status, attemptCount: 0 },
    });
  } catch (err) {
    console.error('[SAP] createSyncLog failed:', err.message);
    return null;
  }
};

const updateSyncLog = async (id, data) => {
  if (!id) return null;
  try {
    return await prisma.sAPSyncLog.update({ where: { id }, data });
  } catch (err) {
    console.error('[SAP] updateSyncLog failed:', err.message);
    return null;
  }
};

const listSyncLogs = ({ status = null, entityType = null, limit = 100 } = {}) => {
  const where = {};
  if (status) where.status = status;
  if (entityType) where.entityType = entityType;
  return prisma.sAPSyncLog.findMany({ where, orderBy: { updatedAt: 'desc' }, take: Math.min(Number(limit) || 100, 500) });
};

const getSyncLog = (id) => prisma.sAPSyncLog.findUnique({ where: { id } });

// ─── Validation logs ──────────────────────────────────────────────────────────
const createValidationLog = async ({ entityType, entityId, validationType, status, message = null, details = null }) => {
  try {
    return await prisma.sAPValidationLog.create({
      data: { entityType, entityId, validationType, status, message, details },
    });
  } catch (err) {
    console.error('[SAP] createValidationLog failed:', err.message);
    return null;
  }
};

const listValidationLogs = ({ status = null, validationType = null, limit = 100 } = {}) => {
  const where = {};
  if (status) where.status = status;
  if (validationType) where.validationType = validationType;
  return prisma.sAPValidationLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 100, 500) });
};

// ─── Dashboard summary ────────────────────────────────────────────────────────
const getDashboardSummary = async () => {
  const [syncGroups, valGroups, lastSuccess, recentSyncs, recentValidations] = await Promise.all([
    prisma.sAPSyncLog.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.sAPValidationLog.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.sAPSyncLog.findFirst({ where: { status: 'SUCCESS' }, orderBy: { updatedAt: 'desc' } }),
    prisma.sAPSyncLog.findMany({ orderBy: { updatedAt: 'desc' }, take: 8 }),
    prisma.sAPValidationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);

  const sync = { PENDING: 0, IN_PROGRESS: 0, SUCCESS: 0, FAILED: 0 };
  for (const g of syncGroups) sync[g.status] = g._count._all;

  const validation = { VALIDATED: 0, WARNING: 0, BLOCKED: 0 };
  for (const g of valGroups) validation[g.status] = g._count._all;

  return {
    sync,
    validation,
    lastSyncTime: lastSuccess?.updatedAt || null,
    recentSyncs,
    recentValidations,
  };
};

module.exports = {
  createSyncLog,
  updateSyncLog,
  listSyncLogs,
  getSyncLog,
  createValidationLog,
  listValidationLogs,
  getDashboardSummary,
};
