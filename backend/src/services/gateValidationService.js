/**
 * Gate Validation Service  (Phase 6, Part 2)
 *
 * The final exit-control layer. No material may physically leave the warehouse
 * unless a scanned Material QR resolves to a lot whose dispatch is APPROVED,
 * matches the lot, and has not already exited.
 *
 * Reuses existing architecture — it does NOT build a second QR system:
 *   - Material QR payloads are parsed by the shared qrPayload util.
 *   - Bay occupancy is reconciled by mappingService.syncBayOccupancy (single
 *     canonical implementation).
 *
 * A successful exit is fully transactional and updates everything at once:
 *   GateValidation → EXITED, Dispatch → COMPLETED, active mapping → DISPATCHED,
 *   lot → DISPATCHED, bay occupancy recalculated. History is never overwritten.
 *
 * Business denials (no approved dispatch, already exited, lot mismatch, etc.)
 * are returned as DENIED decisions (HTTP 200) and recorded for the dashboard —
 * they are valid outcomes, not server errors. Only malformed input (bad QR,
 * unknown lot) throws.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { resolveLotIdFromQR } = require('../utils/qrPayload');
const { resolveActingUserId } = require('../utils/actingUser');
const { syncBayOccupancy } = require('./mappingService');
const sapValidationService = require('../sap/sapValidationService');

const GATE_INCLUDE = {
  lot: { include: { material: true } },
  bay: true,
  validator: { select: { id: true, username: true, role: true } },
  dispatch: true,
};

const AUDIT_MODULE = 'GATE_VALIDATION';

const writeAudit = (tx, { action, entityId, userId, metadata = {} }) =>
  tx.auditLog.create({
    data: { userId, module: AUDIT_MODULE, action, entityId, remarks: JSON.stringify(metadata) },
  });

// ─── Scan resolve (no commit) ─────────────────────────────────────────────────

/**
 * Identify the lot behind a scanned Material QR and report exit eligibility
 * WITHOUT changing anything. Powers the scan-confirm gate UX.
 *
 * @param {{ materialQr: string|object }} input
 */
const resolveScan = async ({ materialQr }) => {
  const lotId = resolveLotIdFromQR(materialQr);

  const lot = await prisma.materialLot.findUnique({
    where: { id: lotId },
    include: { material: true },
  });
  if (!lot) throw new AppError('The scanned Material Lot does not exist in the system.', 404);

  const approvedDispatch = await prisma.dispatch.findFirst({
    where: { lotId, dispatchStatus: 'APPROVED' },
    include: { bay: true },
  });

  const activeMapping = await prisma.materialBayMapping.findFirst({
    where: { lotId, status: 'ACTIVE' },
    include: { bay: true },
  });

  let eligible = false;
  let reason = null;
  if (!approvedDispatch) {
    reason = lot.status === 'DISPATCHED'
      ? 'This lot has already left the warehouse.'
      : 'No approved dispatch exists for this lot. Exit denied.';
  } else {
    eligible = true;
  }

  return { lot, approvedDispatch, activeMapping, eligible, reason };
};

// ─── Process exit (commit) ────────────────────────────────────────────────────

/**
 * Validate a scanned Material QR at the gate and, if all checks pass, authorise
 * and record the exit.
 *
 * @param {{ materialQr: string|object, dispatchId?: string, validatedBy?: string, remarks?: string }} input
 * @returns {Promise<{ decision: 'EXITED'|'DENIED', reason: string|null, gateValidation: object|null, dispatch: object|null }>}
 */
const processGateExit = async ({ materialQr, dispatchId = null, validatedBy = null, remarks = null }) => {
  const lotId = resolveLotIdFromQR(materialQr);

  return prisma.$transaction(async (tx) => {
    const lot = await tx.materialLot.findUnique({ where: { id: lotId }, include: { material: true } });
    if (!lot) throw new AppError('The scanned Material Lot does not exist in the system.', 404);

    const userId = await resolveActingUserId(tx, validatedBy);

    // Resolve which dispatch this exit concerns.
    let dispatch = null;
    if (dispatchId) {
      dispatch = await tx.dispatch.findUnique({ where: { id: dispatchId } });
      if (!dispatch) throw new AppError(`Dispatch with ID "${dispatchId}" was not found.`, 404);
    } else {
      dispatch = await tx.dispatch.findFirst({ where: { lotId, dispatchStatus: 'APPROVED' } });
    }
    // For recording a denial we still want a dispatch to attach to, if any exists.
    const dispatchForRecord =
      dispatch || (await tx.dispatch.findFirst({ where: { lotId }, orderBy: { createdAt: 'desc' } }));

    /** Helper: persist a DENIED gate validation (when a dispatch exists) + audit. */
    const deny = async (reason) => {
      let gateValidation = null;
      if (dispatchForRecord) {
        gateValidation = await tx.gateValidation.create({
          data: {
            dispatchId: dispatchForRecord.id,
            lotId,
            bayId: dispatchForRecord.bayId,
            validatedBy: userId,
            validationStatus: 'DENIED',
            remarks: reason,
          },
          include: GATE_INCLUDE,
        });
      }
      await writeAudit(tx, {
        action: 'GATE_EXIT_DENIED',
        entityId: gateValidation?.id || lotId,
        userId,
        metadata: {
          lotId,
          lotCode: lot.lotCode,
          dispatchId: dispatchForRecord?.id || null,
          dispatchNumber: dispatchForRecord?.dispatchNumber || null,
          reason,
        },
      });
      return { decision: 'DENIED', reason, gateValidation, dispatch: dispatchForRecord || null };
    };

    // ── Denial rules ──────────────────────────────────────────────────────
    if (!dispatchForRecord) {
      // Nothing to attach a record to — still audit against the lot.
      await writeAudit(tx, {
        action: 'GATE_EXIT_DENIED',
        entityId: lotId,
        userId,
        metadata: { lotId, lotCode: lot.lotCode, reason: 'NO_DISPATCH' },
      });
      return {
        decision: 'DENIED',
        reason: 'No dispatch exists for this lot. Exit denied.',
        gateValidation: null,
        dispatch: null,
      };
    }
    if (dispatchForRecord.lotId !== lot.id) {
      return deny('Scanned lot does not match the dispatch. Exit denied.');
    }
    if (dispatchForRecord.dispatchStatus === 'REJECTED') {
      return deny('Dispatch was rejected. Exit denied.');
    }
    if (dispatchForRecord.dispatchStatus === 'CANCELLED') {
      return deny('Dispatch was cancelled. Exit denied.');
    }
    if (dispatchForRecord.dispatchStatus === 'COMPLETED') {
      return deny('This dispatch has already exited the warehouse. Exit denied.');
    }
    if (dispatchForRecord.dispatchStatus === 'PENDING') {
      return deny('Dispatch is not yet approved. Exit denied.');
    }

    // Defensive: an already-EXITED gate row for this dispatch (race / replay).
    const alreadyExited = await tx.gateValidation.findFirst({
      where: { dispatchId: dispatchForRecord.id, validationStatus: 'EXITED' },
    });
    if (alreadyExited) {
      return deny('This dispatch has already exited the warehouse. Exit denied.');
    }

    // ── SAP validation gate (integration layer) ───────────────────────────
    // A genuine SAP check failure denies the exit; SAP downtime fails safe
    // (WARNING → allowed) unless strict mode is configured.
    const sapValidation = await sapValidationService.validateGateExit({
      dispatch: dispatchForRecord, lot, actingUserId: userId,
    });
    if (sapValidation.decision === 'BLOCKED') {
      return deny('SAP validation denied exit: ' + sapValidation.reasons.join('; '));
    }

    // ── Approved & matching → authorise exit ──────────────────────────────
    let gateValidation;
    try {
      gateValidation = await tx.gateValidation.create({
        data: {
          dispatchId: dispatchForRecord.id,
          lotId,
          bayId: dispatchForRecord.bayId,
          validatedBy: userId,
          validationStatus: 'EXITED',
          gateExitTime: new Date(),
          remarks,
        },
        include: GATE_INCLUDE,
      });
    } catch (err) {
      // Unique partial index on (dispatchId) WHERE EXITED → concurrent duplicate.
      if (err.code === 'P2002') {
        return deny('This dispatch has already exited the warehouse. Exit denied.');
      }
      throw err;
    }

    // Close the active mapping as DISPATCHED (history preserved, never deleted).
    const activeMapping = await tx.materialBayMapping.findFirst({
      where: { lotId, status: 'ACTIVE' },
    });
    if (activeMapping) {
      await tx.materialBayMapping.update({
        where: { id: activeMapping.id },
        data: { status: 'DISPATCHED', unmappedAt: new Date() },
      });
    }

    // Lot leaves inventory; dispatch completes.
    await tx.materialLot.update({ where: { id: lotId }, data: { status: 'DISPATCHED' } });
    await tx.dispatch.update({
      where: { id: dispatchForRecord.id },
      data: { dispatchStatus: 'COMPLETED', completedAt: new Date() },
    });

    // Reconcile bay occupancy via the single canonical implementation.
    await syncBayOccupancy(tx, dispatchForRecord.bayId);

    await writeAudit(tx, {
      action: 'MATERIAL_EXITED',
      entityId: gateValidation.id,
      userId,
      metadata: {
        gateValidationId: gateValidation.id,
        lotId,
        lotCode: lot.lotCode,
        dispatchId: dispatchForRecord.id,
        dispatchNumber: dispatchForRecord.dispatchNumber,
        bayId: dispatchForRecord.bayId,
        closedMappingId: activeMapping?.id || null,
      },
    });
    await writeAudit(tx, {
      action: 'DISPATCH_COMPLETED',
      entityId: dispatchForRecord.id,
      userId,
      metadata: { dispatchNumber: dispatchForRecord.dispatchNumber, lotId, lotCode: lot.lotCode },
    });

    return { decision: 'EXITED', reason: null, gateValidation, dispatch: dispatchForRecord };
  });
};

// ─── Reads ────────────────────────────────────────────────────────────────────

const getGateValidationById = async (id) => {
  const gv = await prisma.gateValidation.findUnique({ where: { id }, include: GATE_INCLUDE });
  if (!gv) throw new AppError(`Gate validation with ID "${id}" was not found.`, 404);
  return gv;
};

/** All gate validations, optionally filtered by status. Newest first. */
const getAllGateValidations = async (status = null) => {
  const where = status ? { validationStatus: status } : {};
  return prisma.gateValidation.findMany({ where, include: GATE_INCLUDE, orderBy: { createdAt: 'desc' } });
};

/**
 * Approved dispatches that are waiting at the gate (no EXITED record yet).
 * Represents the gate's "Pending" queue.
 */
const getPendingExits = async () => {
  return prisma.dispatch.findMany({
    where: {
      dispatchStatus: 'APPROVED',
      gateValidations: { none: { validationStatus: 'EXITED' } },
    },
    include: {
      lot: { include: { material: true } },
      bay: true,
      requester: { select: { id: true, username: true, role: true } },
      approver: { select: { id: true, username: true, role: true } },
    },
    orderBy: { approvedAt: 'desc' },
  });
};

/** Gate dashboard counts + inventory-impact summary. */
const getDashboardSummary = async () => {
  const grouped = await prisma.gateValidation.groupBy({
    by: ['validationStatus'],
    _count: { _all: true },
  });
  const summary = { PENDING: 0, VALIDATED: 0, DENIED: 0, EXITED: 0, total: 0 };
  for (const row of grouped) {
    summary[row.validationStatus] = row._count._all;
    summary.total += row._count._all;
  }

  const readyForExit = await prisma.dispatch.count({
    where: {
      dispatchStatus: 'APPROVED',
      gateValidations: { none: { validationStatus: 'EXITED' } },
    },
  });

  return { ...summary, readyForExit };
};

module.exports = {
  resolveScan,
  processGateExit,
  getGateValidationById,
  getAllGateValidations,
  getPendingExits,
  getDashboardSummary,
};
