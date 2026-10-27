/**
 * Material → Bay Mapping Service
 *
 * Owns ALL business logic and database access for the Material-to-Bay Mapping
 * module (Phase 5). Controllers must never touch Prisma directly.
 *
 * Core invariants enforced here (and, for the active-uniqueness rule, also at
 * the database level via a partial unique index):
 *
 *   1. A lot can have AT MOST ONE active mapping at any time.
 *   2. A lot can never be physically present in two bays simultaneously.
 *   3. Movement history is append-only: closing a mapping NEVER deletes it.
 *      Relocations set the old mapping to MOVED and create a fresh ACTIVE row;
 *      explicit removals set it to UNMAPPED. History is therefore permanent and
 *      fully reconstructable for audit.
 *
 * Every state-changing operation runs inside a single Prisma transaction so the
 * mapping row, the dependent Lot status, the Bay occupancy status and the audit
 * log are all committed atomically — there is never a partially-applied move.
 *
 * Throws AppError for all expected failure scenarios so the global error
 * handler produces the correct HTTP response.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { resolveLotIdFromQR, resolveBayIdFromQR } = require('../utils/qrPayload');

// ─── Shared include shape ─────────────────────────────────────────────────────
// Used everywhere a mapping is returned so the API contract is consistent.
const MAPPING_INCLUDE = {
  lot: { include: { material: true } },
  bay: true,
  user: { select: { id: true, username: true, role: true } },
};

const AUDIT_MODULE = 'MAPPING';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the user id to attribute an action / mapping to.
 *
 * Until the auth module lands there is no request-scoped user, so we fall back
 * to an ADMIN (then any user). The `mappedBy` column and AuditLog.userId are
 * non-nullable foreign keys, so a real user MUST exist.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string|null} providedUserId
 * @returns {Promise<string>} a valid user id
 * @throws {AppError} 400 when the provided id is unknown, 409 when no user exists
 */
const resolveActingUserId = async (tx, providedUserId) => {
  if (providedUserId) {
    const user = await tx.user.findUnique({ where: { id: providedUserId } });
    if (!user) {
      throw new AppError(`User with ID "${providedUserId}" was not found.`, 400);
    }
    return user.id;
  }

  const admin = await tx.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) return admin.id;

  const anyUser = await tx.user.findFirst();
  if (anyUser) return anyUser.id;

  throw new AppError(
    'No user exists to attribute this mapping to. Create a user before mapping materials.',
    409
  );
};

/**
 * Write an audit log row inside the active transaction.
 *
 * Metadata is serialised into `remarks` as JSON so future auditors can fully
 * reconstruct each movement (lot, bay(s), user note, action context).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ action: string, entityId: string, userId: string, metadata?: object }} params
 */
const writeAudit = (tx, { action, entityId, userId, metadata = {} }) =>
  tx.auditLog.create({
    data: {
      userId,
      module: AUDIT_MODULE,
      action,
      entityId,
      remarks: JSON.stringify(metadata),
    },
  });

/**
 * Recalculate and persist a bay's occupancy status from its live active
 * mapping count. INACTIVE bays are intentionally left untouched — occupancy is
 * an operational concern, not an administrative one.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} bayId
 */
const syncBayOccupancy = async (tx, bayId) => {
  const bay = await tx.bay.findUnique({ where: { id: bayId } });
  if (!bay || bay.status === 'INACTIVE') return;

  const activeCount = await tx.materialBayMapping.count({
    where: { bayId, status: 'ACTIVE' },
  });

  if (activeCount > 0 && bay.status !== 'OCCUPIED') {
    await tx.bay.update({ where: { id: bayId }, data: { status: 'OCCUPIED' } });
  } else if (activeCount === 0 && bay.status === 'OCCUPIED') {
    await tx.bay.update({ where: { id: bayId }, data: { status: 'AVAILABLE' } });
  }
};

/**
 * Load a lot for mutation, asserting it exists and is not already dispatched.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} lotId
 */
const loadMappableLot = async (tx, lotId) => {
  const lot = await tx.materialLot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);
  if (lot.status === 'DISPATCHED') {
    throw new AppError(`Lot "${lot.lotCode}" has been dispatched and can no longer be mapped.`, 409);
  }
  return lot;
};

/**
 * Load a bay as a mapping target, asserting it exists and is not INACTIVE.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} bayId
 */
const loadTargetBay = async (tx, bayId) => {
  const bay = await tx.bay.findUnique({ where: { id: bayId } });
  if (!bay) throw new AppError(`Bay with ID "${bayId}" was not found.`, 404);
  if (bay.status === 'INACTIVE') {
    throw new AppError(`Bay "${bay.bayCode}" is inactive and cannot receive material.`, 409);
  }
  return bay;
};

/**
 * Take a row lock on the lot for the rest of the transaction. Serialises every
 * placement / allocation decision for the same lot, so two concurrent requests
 * cannot both pass their "is it free?" checks.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} lotId
 */
const lockLot = (tx, lotId) =>
  tx.$queryRaw`SELECT "id" FROM "MaterialLot" WHERE "id" = ${lotId} FOR UPDATE`;

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Place a lot into a bay inside an existing transaction. Shared by the manual
 * Map action, the dual-QR scan and allocation confirmation, so occupancy, lot
 * status and audit are handled by one implementation.
 *
 * If a supervisor has allotted the lot to a bay (open BayAllocation), the lot
 * may only be placed in THAT bay; the allocation is then marked PLACED.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ lotId: string, bayId: string, remarks?: string, mappedBy?: string }} input
 * @returns {Promise<object>} the created mapping (with includes)
 */
const createMappingInTx = async (tx, { lotId, bayId, remarks = null, mappedBy = null }) => {
  await lockLot(tx, lotId);
  const lot = await loadMappableLot(tx, lotId);
  const bay = await loadTargetBay(tx, bayId);

  const activeExisting = await tx.materialBayMapping.findFirst({
    where: { lotId, status: 'ACTIVE' },
    include: { bay: true },
  });
  if (activeExisting) {
    throw new AppError(
      `Lot "${lot.lotCode}" is already mapped to bay "${activeExisting.bay.bayCode}". ` +
      `Use the Move action to relocate it.`,
      409
    );
  }

  const allocation = await tx.bayAllocation.findFirst({
    where: { lotId, status: 'ALLOCATED' },
    include: { bay: true },
  });
  if (allocation && allocation.bayId !== bayId) {
    throw new AppError(
      `Lot "${lot.lotCode}" has been allotted to bay "${allocation.bay.bayCode}". ` +
      `Place it there, or ask a supervisor to cancel the allocation first.`,
      409
    );
  }

  const userId = await resolveActingUserId(tx, mappedBy);

  const mapping = await tx.materialBayMapping.create({
    data: { lotId, bayId, mappedBy: userId, status: 'ACTIVE', remarks },
    include: MAPPING_INCLUDE,
  });

  await tx.materialLot.update({ where: { id: lotId }, data: { status: 'MAPPED' } });
  await syncBayOccupancy(tx, bayId);

  if (allocation) {
    await tx.bayAllocation.update({
      where: { id: allocation.id },
      data: { status: 'PLACED', placedMappingId: mapping.id, placedAt: new Date() },
    });
  }

  await writeAudit(tx, {
    action: 'MATERIAL_MAPPED_TO_BAY',
    entityId: mapping.id,
    userId,
    metadata: {
      mappingId: mapping.id,
      lotId,
      lotCode: lot.lotCode,
      bayId,
      bayCode: bay.bayCode,
      zone: bay.zone,
      allocationId: allocation?.id ?? null,
      remarks,
    },
  });

  return mapping;
};

/**
 * Create a NEW active mapping (place a lot into a bay for the first time, or
 * after it was previously removed).
 *
 * Fails if the lot already has an active mapping — the caller must use
 * moveMaterial() instead. This keeps "place" and "relocate" as distinct,
 * auditable intents.
 *
 * @param {{ lotId: string, bayId: string, remarks?: string, mappedBy?: string }} input
 * @returns {Promise<object>} the created mapping (with includes)
 */
const createMapping = async (input) =>
  prisma.$transaction((tx) => createMappingInTx(tx, input));

/**
 * Move a lot from its current bay to a different bay.
 *
 * History-preserving: the current ACTIVE mapping is closed as MOVED (with
 * unmappedAt set) and a brand-new ACTIVE mapping is created for the target bay.
 *
 * @param {{ lotId: string, toBayId: string, remarks?: string, mappedBy?: string }} input
 * @returns {Promise<object>} the new active mapping (with includes)
 */
const moveMaterial = async ({ lotId, toBayId, remarks = null, mappedBy = null }) => {
  return prisma.$transaction(async (tx) => {
    const lot = await loadMappableLot(tx, lotId);

    const current = await tx.materialBayMapping.findFirst({
      where: { lotId, status: 'ACTIVE' },
      include: { bay: true },
    });
    if (!current) {
      throw new AppError(
        `Lot "${lot.lotCode}" is not currently mapped to any bay. Use the Map action first.`,
        409
      );
    }
    if (current.bayId === toBayId) {
      throw new AppError(`Lot "${lot.lotCode}" is already in bay "${current.bay.bayCode}".`, 409);
    }

    const toBay = await loadTargetBay(tx, toBayId);
    const userId = await resolveActingUserId(tx, mappedBy);

    // Close the old mapping — preserved forever as part of the trail.
    await tx.materialBayMapping.update({
      where: { id: current.id },
      data: { status: 'MOVED', unmappedAt: new Date() },
    });

    // Open the new active mapping.
    const newMapping = await tx.materialBayMapping.create({
      data: { lotId, bayId: toBayId, mappedBy: userId, status: 'ACTIVE', remarks },
      include: MAPPING_INCLUDE,
    });

    // Lot remains MAPPED; reconcile occupancy of BOTH bays.
    await syncBayOccupancy(tx, current.bayId);
    await syncBayOccupancy(tx, toBayId);

    await writeAudit(tx, {
      action: 'MATERIAL_MOVED_BETWEEN_BAYS',
      entityId: newMapping.id,
      userId,
      metadata: {
        lotId,
        lotCode: lot.lotCode,
        fromBayId: current.bayId,
        fromBayCode: current.bay.bayCode,
        toBayId,
        toBayCode: toBay.bayCode,
        closedMappingId: current.id,
        newMappingId: newMapping.id,
        remarks,
      },
    });

    return newMapping;
  });
};

/**
 * Remove a lot from its current bay (e.g. consumed, returned, staged out).
 *
 * History-preserving: the ACTIVE mapping is closed as UNMAPPED. The lot returns
 * to AVAILABLE so it can be re-mapped later.
 *
 * @param {{ lotId: string, remarks?: string, mappedBy?: string }} input
 * @returns {Promise<object>} the closed mapping (with includes)
 */
const removeMaterialFromBay = async ({ lotId, remarks = null, mappedBy = null }) => {
  return prisma.$transaction(async (tx) => {
    const lot = await tx.materialLot.findUnique({ where: { id: lotId } });
    if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);

    const current = await tx.materialBayMapping.findFirst({
      where: { lotId, status: 'ACTIVE' },
      include: { bay: true },
    });
    if (!current) {
      throw new AppError(`Lot "${lot.lotCode}" is not currently mapped to any bay.`, 409);
    }

    const userId = await resolveActingUserId(tx, mappedBy);

    const closed = await tx.materialBayMapping.update({
      where: { id: current.id },
      data: { status: 'UNMAPPED', unmappedAt: new Date(), remarks: remarks ?? current.remarks },
      include: MAPPING_INCLUDE,
    });

    await tx.materialLot.update({ where: { id: lotId }, data: { status: 'AVAILABLE' } });
    await syncBayOccupancy(tx, current.bayId);

    await writeAudit(tx, {
      action: 'MATERIAL_REMOVED_FROM_BAY',
      entityId: closed.id,
      userId,
      metadata: {
        lotId,
        lotCode: lot.lotCode,
        bayId: current.bayId,
        bayCode: current.bay.bayCode,
        closedMappingId: current.id,
        remarks,
      },
    });

    return closed;
  });
};

// ─── Read operations ──────────────────────────────────────────────────────────

/**
 * Inventory for a single bay: every lot currently stored in it.
 * @param {string} bayId
 */
const getBayInventory = async (bayId) => {
  const bay = await prisma.bay.findUnique({ where: { id: bayId } });
  if (!bay) throw new AppError(`Bay with ID "${bayId}" was not found.`, 404);

  const mappings = await prisma.materialBayMapping.findMany({
    where: { bayId, status: 'ACTIVE' },
    include: MAPPING_INCLUDE,
    orderBy: { mappedAt: 'desc' },
  });

  const totalQuantity = mappings.reduce((sum, m) => sum + (m.lot?.quantity || 0), 0);

  return {
    bay,
    lotCount: mappings.length,
    totalQuantity,
    mappings,
  };
};

/**
 * Where is a given lot right now?
 * @param {string} lotId
 */
const getMaterialLocation = async (lotId) => {
  const lot = await prisma.materialLot.findUnique({
    where: { id: lotId },
    include: { material: true },
  });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);

  const active = await prisma.materialBayMapping.findFirst({
    where: { lotId, status: 'ACTIVE' },
    include: MAPPING_INCLUDE,
  });

  return {
    lotId,
    lotCode: lot.lotCode,
    isMapped: Boolean(active),
    status: lot.status,
    bay: active ? active.bay : null,
    zone: active ? active.bay.zone : null,
    mappedAt: active ? active.mappedAt : null,
    activeMapping: active,
  };
};

/**
 * Full, chronological movement history for a lot — including closed mappings.
 * @param {string} lotId
 */
const getMappingHistory = async (lotId) => {
  const lot = await prisma.materialLot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);

  return prisma.materialBayMapping.findMany({
    where: { lotId },
    include: MAPPING_INCLUDE,
    orderBy: { mappedAt: 'asc' },
  });
};

/**
 * The current ACTIVE mapping for a lot, or null when unmapped.
 * @param {string} lotId
 */
const getActiveMapping = async (lotId) => {
  const lot = await prisma.materialLot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);

  return prisma.materialBayMapping.findFirst({
    where: { lotId, status: 'ACTIVE' },
    include: MAPPING_INCLUDE,
  });
};

/**
 * All active inventory across the whole yard (flat list of active mappings).
 */
const getAllActiveInventory = async () => {
  return prisma.materialBayMapping.findMany({
    where: { status: 'ACTIVE' },
    include: MAPPING_INCLUDE,
    orderBy: { mappedAt: 'desc' },
  });
};

/**
 * Per-bay active inventory summary (lot counts + quantity), keyed by bayId.
 * Powers the inventory-aware yard map / layout without shipping every mapping.
 *
 * @returns {Promise<Object<string, { lotCount: number, totalQuantity: number }>>}
 */
const getInventorySummary = async () => {
  const mappings = await prisma.materialBayMapping.findMany({
    where: { status: 'ACTIVE' },
    select: { bayId: true, lot: { select: { quantity: true } } },
  });

  const summary = {};
  for (const m of mappings) {
    if (!summary[m.bayId]) summary[m.bayId] = { lotCount: 0, totalQuantity: 0 };
    summary[m.bayId].lotCount += 1;
    summary[m.bayId].totalQuantity += m.lot?.quantity || 0;
  }
  return summary;
};

// ─── Dual-QR scan workflow ────────────────────────────────────────────────────

/**
 * Resolve scanned QR payloads into the entities they reference WITHOUT making
 * any change. Powers the scan-confirm UX: scan material, scan bay, preview,
 * then commit.
 *
 * @param {{ materialQr?: string|object, bayQr?: string|object }} input
 */
const resolveScan = async ({ materialQr = null, bayQr = null }) => {
  const result = { lot: null, bay: null, activeMapping: null };

  if (materialQr) {
    const lotId = resolveLotIdFromQR(materialQr);
    const lot = await prisma.materialLot.findUnique({
      where: { id: lotId },
      include: { material: true },
    });
    if (!lot) throw new AppError('The scanned Material Lot does not exist in the system.', 404);
    result.lot = lot;

    result.activeMapping = await prisma.materialBayMapping.findFirst({
      where: { lotId, status: 'ACTIVE' },
      include: MAPPING_INCLUDE,
    });
  }

  if (bayQr) {
    const bayId = resolveBayIdFromQR(bayQr);
    const bay = await prisma.bay.findUnique({ where: { id: bayId } });
    if (!bay) throw new AppError('The scanned Bay does not exist in the system.', 404);
    result.bay = bay;
  }

  return result;
};

/**
 * Commit a dual-QR scan: identify the lot and bay from their QR payloads, then
 * place or relocate the lot accordingly.
 *
 *   - lot has no active mapping            → createMapping (place)
 *   - lot active in a DIFFERENT bay        → moveMaterial (relocate)
 *   - lot already active in the SAME bay   → 409 (no-op rejected)
 *
 * @param {{ materialQr: string|object, bayQr: string|object, remarks?: string, mappedBy?: string }} input
 * @returns {Promise<{ action: 'MAPPED'|'MOVED', mapping: object }>}
 */
const commitScan = async ({ materialQr, bayQr, remarks = null, mappedBy = null }) => {
  if (!materialQr || !bayQr) {
    throw new AppError('Both a Material Lot QR code and a Bay QR code are required.', 400);
  }

  const lotId = resolveLotIdFromQR(materialQr);
  const bayId = resolveBayIdFromQR(bayQr);

  const active = await prisma.materialBayMapping.findFirst({
    where: { lotId, status: 'ACTIVE' },
  });

  if (!active) {
    const mapping = await createMapping({ lotId, bayId, remarks, mappedBy });
    return { action: 'MAPPED', mapping };
  }

  const mapping = await moveMaterial({ lotId, toBayId: bayId, remarks, mappedBy });
  return { action: 'MOVED', mapping };
};

module.exports = {
  // writes
  createMapping,
  moveMaterial,
  removeMaterialFromBay,
  // reads
  getBayInventory,
  getMaterialLocation,
  getMappingHistory,
  getActiveMapping,
  getAllActiveInventory,
  getInventorySummary,
  // dual-QR
  resolveScan,
  commitScan,
  // shared inventory helper — reused by the gate-exit flow so bay occupancy
  // is reconciled by a single, canonical implementation.
  syncBayOccupancy,
  // shared transactional helpers — reused by the bay-allocation flow.
  createMappingInTx,
  lockLot,
  loadTargetBay,
  resolveActingUserId,
  MAPPING_INCLUDE,
};
