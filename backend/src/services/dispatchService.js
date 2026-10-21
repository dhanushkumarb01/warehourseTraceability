/**
 * Dispatch Service
 *
 * Owns ALL business logic and database access for the Dispatch module
 * (Phase 6, Part 1). Controllers never touch Prisma directly.
 *
 * Lifecycle: PENDING → APPROVED → COMPLETED
 *                    ↘ REJECTED
 *                    ↘ CANCELLED  (from PENDING or APPROVED, before exit)
 *
 * COMPLETED is reached only via a validated gate exit (gateValidationService),
 * never directly — keeping "approved to leave" and "actually left" distinct.
 *
 * Guarantees:
 *   - A lot can have at most ONE open (PENDING/APPROVED) dispatch at a time
 *     (enforced here AND by a partial unique index).
 *   - Only mapped, non-dispatched lots can be requested.
 *   - Requested/approved quantity can never exceed available inventory.
 *   - Every state change is transactional and audit-logged with full metadata.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const sapValidationService = require('../sap/sapValidationService');
const { resolveActingUserId } = require('../utils/actingUser');

const DISPATCH_INCLUDE = {
  lot: { include: { material: true } },
  bay: true,
  requester: { select: { id: true, username: true, role: true } },
  approver: { select: { id: true, username: true, role: true } },
};

const AUDIT_MODULE = 'DISPATCH';
const OPEN_STATUSES = ['PENDING', 'APPROVED'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a unique, human-readable dispatch number (DSP-YYYYMMDD-HHMMSS-RRR). */
const generateDispatchNumber = () => {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const hms = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = p(Math.floor(Math.random() * 1000), 3);
  return `DSP-${ymd}-${hms}-${rand}`;
};

const writeAudit = (tx, { action, entityId, userId, metadata = {} }) =>
  tx.auditLog.create({
    data: { userId, module: AUDIT_MODULE, action, entityId, remarks: JSON.stringify(metadata) },
  });

/**
 * Validate that a lot is eligible to be dispatched and return it together with
 * its current active mapping (which determines the origin bay).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} lotId
 */
const assertDispatchableLot = async (tx, lotId) => {
  const lot = await tx.materialLot.findUnique({ where: { id: lotId }, include: { material: true } });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);
  if (lot.status === 'DISPATCHED') {
    throw new AppError(`Lot "${lot.lotCode}" has already been dispatched.`, 409);
  }

  const activeMapping = await tx.materialBayMapping.findFirst({
    where: { lotId, status: 'ACTIVE' },
    include: { bay: true },
  });
  if (!activeMapping) {
    throw new AppError(
      `Lot "${lot.lotCode}" is not currently mapped to any bay and cannot be dispatched.`,
      409
    );
  }

  return { lot, activeMapping };
};

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Create a dispatch request (PENDING).
 *
 * @param {{ lotId: string, requestedQuantity: number, vehicleNumber?: string, remarks?: string, requestedBy?: string }} input
 */
const createDispatch = async ({ lotId, requestedQuantity, vehicleNumber = null, remarks = null, requestedBy = null }) => {
  return prisma.$transaction(async (tx) => {
    const { lot, activeMapping } = await assertDispatchableLot(tx, lotId);

    if (!(requestedQuantity > 0)) {
      throw new AppError('Requested quantity must be greater than zero.', 400);
    }
    if (requestedQuantity > lot.quantity) {
      throw new AppError(
        `Requested quantity (${requestedQuantity}) exceeds available inventory (${lot.quantity} ${lot.unit}) for lot "${lot.lotCode}".`,
        400
      );
    }

    const openExisting = await tx.dispatch.findFirst({
      where: { lotId, dispatchStatus: { in: OPEN_STATUSES } },
    });
    if (openExisting) {
      throw new AppError(
        `Lot "${lot.lotCode}" already has an open dispatch (${openExisting.dispatchNumber}). ` +
        `Resolve it before creating another.`,
        409
      );
    }

    const userId = await resolveActingUserId(tx, requestedBy);

    // Generate a unique dispatch number, retrying on the (rare) unique clash.
    let dispatch;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        dispatch = await tx.dispatch.create({
          data: {
            dispatchNumber: generateDispatchNumber(),
            lotId,
            bayId: activeMapping.bayId,
            requestedQuantity,
            requestedBy: userId,
            vehicleNumber,
            remarks,
            dispatchStatus: 'PENDING',
          },
          include: DISPATCH_INCLUDE,
        });
        break;
      } catch (err) {
        if (err.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }

    await writeAudit(tx, {
      action: 'DISPATCH_REQUESTED',
      entityId: dispatch.id,
      userId,
      metadata: {
        dispatchNumber: dispatch.dispatchNumber,
        lotId,
        lotCode: lot.lotCode,
        bayId: activeMapping.bayId,
        bayCode: activeMapping.bay.bayCode,
        requestedQuantity,
        vehicleNumber,
        remarks,
      },
    });

    return dispatch;
  });
};

/**
 * Approve a PENDING dispatch.
 *
 * @param {{ id: string, approvedQuantity?: number, remarks?: string, approvedBy?: string }} input
 */
const approveDispatch = async ({ id, approvedQuantity = null, remarks = null, approvedBy = null }) => {
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.findUnique({ where: { id } });
    if (!dispatch) throw new AppError(`Dispatch with ID "${id}" was not found.`, 404);
    if (dispatch.dispatchStatus !== 'PENDING') {
      throw new AppError(
        `Only PENDING dispatches can be approved. This dispatch is ${dispatch.dispatchStatus}.`,
        409
      );
    }

    // Re-validate inventory at approval time (state may have changed since request).
    const { lot } = await assertDispatchableLot(tx, dispatch.lotId);

    const finalQty = approvedQuantity ?? dispatch.requestedQuantity;
    if (!(finalQty > 0)) {
      throw new AppError('Approved quantity must be greater than zero.', 400);
    }
    if (finalQty > lot.quantity) {
      throw new AppError(
        `Approved quantity (${finalQty}) exceeds available inventory (${lot.quantity} ${lot.unit}).`,
        400
      );
    }

    // ─── SAP validation gate (integration layer) ───────────────────────────
    // SAP remains the system of record: a genuine SAP check failure blocks the
    // approval. SAP downtime fails safe (WARNING) unless strict mode is on.
    const sapValidation = await sapValidationService.validateDispatchApproval({
      dispatch, lot, requestedQuantity: finalQty, actingUserId: approvedBy,
    });
    if (sapValidation.decision === 'BLOCKED') {
      throw new AppError(
        'SAP validation blocked this approval: ' + sapValidation.reasons.join('; '),
        422
      );
    }

    const userId = await resolveActingUserId(tx, approvedBy);

    const updated = await tx.dispatch.update({
      where: { id },
      data: {
        dispatchStatus: 'APPROVED',
        approvedQuantity: finalQty,
        approvedBy: userId,
        approvedAt: new Date(),
        remarks: remarks ?? dispatch.remarks,
      },
      include: DISPATCH_INCLUDE,
    });

    await writeAudit(tx, {
      action: 'DISPATCH_APPROVED',
      entityId: id,
      userId,
      metadata: {
        dispatchNumber: dispatch.dispatchNumber,
        lotId: dispatch.lotId,
        lotCode: lot.lotCode,
        approvedQuantity: finalQty,
        remarks,
      },
    });

    return updated;
  });
};

/**
 * Reject a PENDING dispatch.
 *
 * @param {{ id: string, remarks?: string, approvedBy?: string }} input
 */
const rejectDispatch = async ({ id, remarks = null, approvedBy = null }) => {
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.findUnique({ where: { id } });
    if (!dispatch) throw new AppError(`Dispatch with ID "${id}" was not found.`, 404);
    if (dispatch.dispatchStatus !== 'PENDING') {
      throw new AppError(
        `Only PENDING dispatches can be rejected. This dispatch is ${dispatch.dispatchStatus}.`,
        409
      );
    }

    const userId = await resolveActingUserId(tx, approvedBy);

    const updated = await tx.dispatch.update({
      where: { id },
      data: {
        dispatchStatus: 'REJECTED',
        approvedBy: userId,
        approvedAt: new Date(),
        remarks: remarks ?? dispatch.remarks,
      },
      include: DISPATCH_INCLUDE,
    });

    await writeAudit(tx, {
      action: 'DISPATCH_REJECTED',
      entityId: id,
      userId,
      metadata: { dispatchNumber: dispatch.dispatchNumber, lotId: dispatch.lotId, remarks },
    });

    return updated;
  });
};

/**
 * Cancel a dispatch (from PENDING or APPROVED, before the material has exited).
 *
 * @param {{ id: string, remarks?: string, requestedBy?: string }} input
 */
const cancelDispatch = async ({ id, remarks = null, requestedBy = null }) => {
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.findUnique({ where: { id } });
    if (!dispatch) throw new AppError(`Dispatch with ID "${id}" was not found.`, 404);
    if (!OPEN_STATUSES.includes(dispatch.dispatchStatus)) {
      throw new AppError(
        `Only PENDING or APPROVED dispatches can be cancelled. This dispatch is ${dispatch.dispatchStatus}.`,
        409
      );
    }

    // Guard: cannot cancel once the material has physically exited.
    const exited = await tx.gateValidation.findFirst({
      where: { dispatchId: id, validationStatus: 'EXITED' },
    });
    if (exited) {
      throw new AppError('This dispatch has already exited the warehouse and cannot be cancelled.', 409);
    }

    const userId = await resolveActingUserId(tx, requestedBy);

    const updated = await tx.dispatch.update({
      where: { id },
      data: { dispatchStatus: 'CANCELLED', remarks: remarks ?? dispatch.remarks },
      include: DISPATCH_INCLUDE,
    });

    await writeAudit(tx, {
      action: 'DISPATCH_CANCELLED',
      entityId: id,
      userId,
      metadata: { dispatchNumber: dispatch.dispatchNumber, lotId: dispatch.lotId, remarks },
    });

    return updated;
  });
};

// ─── Reads ────────────────────────────────────────────────────────────────────

const getDispatchById = async (id) => {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id },
    include: { ...DISPATCH_INCLUDE, gateValidations: true },
  });
  if (!dispatch) throw new AppError(`Dispatch with ID "${id}" was not found.`, 404);
  return dispatch;
};

/** All dispatches, optionally filtered by status. Newest first. */
const getAllDispatches = async (status = null) => {
  const where = status ? { dispatchStatus: status } : {};
  return prisma.dispatch.findMany({ where, include: DISPATCH_INCLUDE, orderBy: { createdAt: 'desc' } });
};

const getPendingDispatches = () => getAllDispatches('PENDING');
const getApprovedDispatches = () => getAllDispatches('APPROVED');

/** Full dispatch history for a single lot (chronological). */
const getDispatchHistory = async (lotId) => {
  const lot = await prisma.materialLot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);
  return prisma.dispatch.findMany({
    where: { lotId },
    include: { ...DISPATCH_INCLUDE, gateValidations: true },
    orderBy: { createdAt: 'asc' },
  });
};

/** Dashboard counts by status. */
const getDashboardSummary = async () => {
  const grouped = await prisma.dispatch.groupBy({
    by: ['dispatchStatus'],
    _count: { _all: true },
  });
  const summary = { PENDING: 0, APPROVED: 0, REJECTED: 0, COMPLETED: 0, CANCELLED: 0, total: 0 };
  for (const row of grouped) {
    summary[row.dispatchStatus] = row._count._all;
    summary.total += row._count._all;
  }
  return summary;
};

module.exports = {
  createDispatch,
  approveDispatch,
  rejectDispatch,
  cancelDispatch,
  getDispatchById,
  getAllDispatches,
  getPendingDispatches,
  getApprovedDispatches,
  getDispatchHistory,
  getDashboardSummary,
};
