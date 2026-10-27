/**
 * Placement Service — arrival mode, bay recommendations and bay allocation.
 *
 * Workflow for an incoming lot:
 *
 *   1. AWAITING_ARRIVAL_MODE  lot has no arrival mode yet
 *   2. PENDING_ALLOCATION     arrival recorded; a recommendation is shown
 *   3. ALLOCATED              a supervisor allotted a bay (BayAllocation)
 *   4. PLACED                 an operator confirmed physical placement — this
 *                             is the existing MaterialBayMapping, created via
 *                             mappingService.createMappingInTx
 *
 * Recommendations come from the pure placement/recommendationEngine using the
 * demand provider in placement/demandProvider. Both are swappable; this service
 * only loads data and enforces the workflow.
 *
 * Every write runs in one transaction that first locks the lot row, so
 * concurrent allocate / place / cancel requests for the same lot serialise.
 * The partial unique index BayAllocation_lot_open_unique is the database-level
 * backstop for "one open allocation per lot".
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { placementConfig, DEMAND_LEVELS } = require('../config/placement');
const { createStaticDemandProvider } = require('../placement/demandProvider');
const { recommendBays, METHOD } = require('../placement/recommendationEngine');
const { createMappingInTx, lockLot, loadTargetBay } = require('./mappingService');

const AUDIT_MODULE = 'PLACEMENT';

const STAGES = Object.freeze(['AWAITING_ARRIVAL_MODE', 'PENDING_ALLOCATION', 'ALLOCATED', 'PLACED']);

// Replaced wholesale when the real demand model lands (same contract).
let demandProvider = createStaticDemandProvider();

/** Test / future-model hook: swap the demand provider. */
const setDemandProvider = (provider) => { demandProvider = provider; };

const ALLOCATION_INCLUDE = {
  bay: true,
  loadingDock: true,
  allocator: { select: { id: true, username: true, role: true } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const writeAudit = (tx, { action, entityId, userId, metadata = {} }) =>
  tx.auditLog.create({
    data: { userId, module: AUDIT_MODULE, action, entityId, remarks: JSON.stringify(metadata) },
  });

/** Bays, zones, docks and per-bay occupancy — everything the engine needs. */
const loadLayout = async (db) => {
  const bays = await db.bay.findMany({
    select: {
      id: true, bayCode: true, bayName: true, zone: true, zoneId: true,
      latitude: true, longitude: true, status: true,
    },
  });
  const zones = await db.zone.findMany();
  const docks = await db.loadingDock.findMany();
  const counts = await db.materialBayMapping.groupBy({
    by: ['bayId'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });
  const occupancy = {};
  for (const c of counts) occupancy[c.bayId] = { lotCount: c._count._all };
  return { bays, zones, docks, occupancy };
};

const runEngine = (lot, layout, demandOverride) => {
  const demand = demandProvider.getDemand({ lot, material: lot.material, override: demandOverride });
  return recommendBays({
    lot,
    demand,
    ...layout,
    options: {
      recommendationCount: placementConfig.recommendationCount,
      preferEmptyBays: placementConfig.preferEmptyBays,
    },
  });
};

const deriveStage = (lot, activeMapping, openAllocation) => {
  if (activeMapping) return 'PLACED';
  if (openAllocation) return 'ALLOCATED';
  if (!lot.arrivalMode) return 'AWAITING_ARRIVAL_MODE';
  return 'PENDING_ALLOCATION';
};

/** Translate the open-allocation unique-index violation into a clear 409. */
const asConflict = (err, message) => {
  if (err?.code === 'P2002') return new AppError(message, 409);
  return err;
};

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Static description of the recommendation method + current configuration. */
const getConfig = () => ({
  method: METHOD,
  demandLevels: DEMAND_LEVELS,
  isPlaceholder: true,
  recommendationCount: placementConfig.recommendationCount,
  preferEmptyBays: placementConfig.preferEmptyBays,
  mockDemand: placementConfig.mockDemand,
  distanceBasis: {
    id: 'STRAIGHT_LINE',
    description:
      'Great-circle (Haversine) distance between surveyed coordinates. It is not the ' +
      'road, rail or indoor travel distance, which depends on the actual route.',
  },
});

/**
 * Lots for the allocation workspace (dispatched lots excluded).
 *
 * @param {{ arrivalMode?: 'RAIL'|'ROAD'|'UNRECORDED', stage?: string, search?: string }} filters
 */
const listLots = async ({ arrivalMode, stage, search } = {}) => {
  const lots = await prisma.materialLot.findMany({
    where: { status: { not: 'DISPATCHED' } },
    include: {
      material: true,
      mappings: {
        where: { status: 'ACTIVE' },
        include: { bay: true, allocation: { include: { loadingDock: true } } },
      },
      allocations: { where: { status: 'ALLOCATED' }, include: ALLOCATION_INCLUDE },
    },
    orderBy: { receivedDate: 'desc' },
  });

  const term = search?.trim().toLowerCase();
  const rows = lots
    .map((lot) => {
      const activeMapping = lot.mappings[0] || null;
      const openAllocation = lot.allocations[0] || null;
      const { mappings, allocations, ...rest } = lot;
      return { ...rest, stage: deriveStage(lot, activeMapping, openAllocation), activeMapping, openAllocation };
    })
    .filter((row) => !term || [row.lotCode, row.material?.materialName, row.material?.materialCode]
      .some((v) => v?.toLowerCase().includes(term)));

  const byArrivalMode = { RAIL: 0, ROAD: 0, UNRECORDED: 0 };
  for (const r of rows) byArrivalMode[r.arrivalMode || 'UNRECORDED'] += 1;

  const modeFiltered = rows.filter((r) => {
    if (!arrivalMode) return true;
    if (arrivalMode === 'UNRECORDED') return !r.arrivalMode;
    return r.arrivalMode === arrivalMode;
  });

  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const r of modeFiltered) byStage[r.stage] += 1;

  const result = modeFiltered.filter((r) => !stage || r.stage === stage);

  // Top suggestion for lots awaiting a decision (one layout load for all).
  const pending = result.filter((r) => r.stage === 'PENDING_ALLOCATION');
  if (pending.length) {
    const layout = await loadLayout(prisma);
    for (const row of pending) {
      const rec = runEngine(row, layout);
      const top = rec.recommendations[0];
      row.topRecommendation = top
        ? { bay: top.bay, dock: top.dock, distanceM: top.distanceM, distanceLabel: top.distanceLabel, demandLevel: rec.demand.level }
        : null;
      row.recommendationStatus = rec.status;
    }
  }

  return { lots: result, summary: { byStage, byArrivalMode, total: rows.length } };
};

/**
 * Ranked bay recommendations for one lot.
 * @param {string} lotId
 * @param {{ demandLevel?: string }} [options] optional supervisor what-if override
 */
const getRecommendations = async (lotId, { demandLevel } = {}) => {
  const lot = await prisma.materialLot.findUnique({ where: { id: lotId }, include: { material: true } });
  if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);
  if (lot.status === 'DISPATCHED') {
    throw new AppError(`Lot "${lot.lotCode}" has been dispatched.`, 409);
  }
  const layout = await loadLayout(prisma);
  return runEngine(lot, layout, demandLevel);
};

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Record (or correct) how a lot arrived. Locked once the lot is allotted; once
 * placed it can only be filled in if it was never recorded (historic lots).
 */
const recordArrivalMode = async ({ lotId, arrivalMode, userId }) =>
  prisma.$transaction(async (tx) => {
    await lockLot(tx, lotId);
    const lot = await tx.materialLot.findUnique({ where: { id: lotId } });
    if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);
    if (lot.status === 'DISPATCHED') {
      throw new AppError(`Lot "${lot.lotCode}" has been dispatched; its arrival record is closed.`, 409);
    }
    if (lot.arrivalMode === arrivalMode) return lot;

    const open = await tx.bayAllocation.findFirst({ where: { lotId, status: 'ALLOCATED' } });
    if (open) {
      throw new AppError(
        `Lot "${lot.lotCode}" already has a bay allotted. Cancel the allocation before changing its arrival mode.`,
        409
      );
    }
    const placed = await tx.materialBayMapping.findFirst({ where: { lotId, status: 'ACTIVE' } });
    if (placed && lot.arrivalMode) {
      throw new AppError(`Lot "${lot.lotCode}" is already placed; its arrival mode can no longer be changed.`, 409);
    }

    const updated = await tx.materialLot.update({
      where: { id: lotId },
      data: { arrivalMode, arrivalRecordedAt: new Date() },
      include: { material: true },
    });

    await writeAudit(tx, {
      action: 'ARRIVAL_MODE_RECORDED',
      entityId: lotId,
      userId,
      metadata: { lotId, lotCode: lot.lotCode, previous: lot.arrivalMode, arrivalMode },
    });
    return updated;
  });

/**
 * Allot a bay to an incoming lot. The supervisor may choose any eligible bay —
 * the recommendation is advice; its rank and distance are snapshotted.
 */
const allocateBay = async ({ lotId, bayId, demandLevel = null, remarks = null, userId }) => {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockLot(tx, lotId);
      const lot = await tx.materialLot.findUnique({ where: { id: lotId }, include: { material: true } });
      if (!lot) throw new AppError(`Material Lot with ID "${lotId}" was not found.`, 404);
      if (lot.status === 'DISPATCHED') {
        throw new AppError(`Lot "${lot.lotCode}" has been dispatched and cannot be allotted.`, 409);
      }
      if (!lot.arrivalMode) {
        throw new AppError(`Record whether lot "${lot.lotCode}" arrived by rail or road before allotting a bay.`, 409);
      }

      const placed = await tx.materialBayMapping.findFirst({ where: { lotId, status: 'ACTIVE' }, include: { bay: true } });
      if (placed) {
        throw new AppError(`Lot "${lot.lotCode}" is already placed in bay "${placed.bay.bayCode}".`, 409);
      }
      const open = await tx.bayAllocation.findFirst({ where: { lotId, status: 'ALLOCATED' }, include: { bay: true } });
      if (open) {
        throw new AppError(
          `Lot "${lot.lotCode}" is already allotted to bay "${open.bay.bayCode}". Cancel that allocation first.`,
          409
        );
      }

      const bay = await loadTargetBay(tx, bayId);
      const result = runEngine(lot, await loadLayout(tx), demandLevel);

      const excluded = result.excluded.find((e) => e.bay.id === bayId);
      if (excluded) {
        throw new AppError(`Bay "${bay.bayCode}" is not eligible: ${excluded.reasons.join(' ')}`, 409);
      }
      const candidate = result.candidates.find((c) => c.bay.id === bayId) || null;

      const allocation = await tx.bayAllocation.create({
        data: {
          lotId,
          bayId,
          loadingDockId: candidate?.dock?.id ?? null,
          arrivalMode: lot.arrivalMode,
          recommendationRank: candidate?.rank ?? null,
          straightLineDistanceM: candidate?.distanceM ?? null,
          demandLevel: result.demand.level,
          demandSource: result.demand.source,
          method: result.method.id,
          remarks,
          allocatedBy: userId,
        },
        include: ALLOCATION_INCLUDE,
      });

      await writeAudit(tx, {
        action: 'BAY_ALLOCATED',
        entityId: allocation.id,
        userId,
        metadata: {
          allocationId: allocation.id,
          lotId,
          lotCode: lot.lotCode,
          bayId,
          bayCode: bay.bayCode,
          arrivalMode: lot.arrivalMode,
          recommendationRank: allocation.recommendationRank,
          wasRecommended: Boolean(candidate?.recommended),
          straightLineDistanceM: allocation.straightLineDistanceM,
          loadingDockCode: candidate?.dock?.dockCode ?? null,
          demandLevel: result.demand.level,
          demandSource: result.demand.source,
          method: result.method.id,
          remarks,
        },
      });

      return allocation;
    });
  } catch (err) {
    throw asConflict(err, 'This lot was just allotted by another user. Refresh to see the current allocation.');
  }
};

/** Lock the lot behind an allocation and return the allocation's fresh state. */
const loadOpenAllocationLocked = async (tx, allocationId) => {
  const found = await tx.bayAllocation.findUnique({ where: { id: allocationId } });
  if (!found) throw new AppError(`Allocation with ID "${allocationId}" was not found.`, 404);
  await lockLot(tx, found.lotId);

  const allocation = await tx.bayAllocation.findUnique({
    where: { id: allocationId },
    include: { bay: true, lot: true },
  });
  if (allocation.status !== 'ALLOCATED') {
    throw new AppError(`This allocation is already ${allocation.status.toLowerCase()}.`, 409);
  }
  return allocation;
};

/** Operator confirms the lot is physically in the allotted bay. */
const confirmPlacement = async ({ allocationId, remarks = null, userId }) =>
  prisma.$transaction(async (tx) => {
    const allocation = await loadOpenAllocationLocked(tx, allocationId);

    const mapping = await createMappingInTx(tx, {
      lotId: allocation.lotId,
      bayId: allocation.bayId,
      remarks,
      mappedBy: userId,
    });

    await writeAudit(tx, {
      action: 'ALLOCATION_PLACED',
      entityId: allocation.id,
      userId,
      metadata: {
        allocationId: allocation.id,
        mappingId: mapping.id,
        lotCode: allocation.lot.lotCode,
        bayCode: allocation.bay.bayCode,
        remarks,
      },
    });
    return mapping;
  });

/** Supervisor withdraws an allotment before placement. */
const cancelAllocation = async ({ allocationId, reason = null, userId }) =>
  prisma.$transaction(async (tx) => {
    const allocation = await loadOpenAllocationLocked(tx, allocationId);

    const cancelled = await tx.bayAllocation.update({
      where: { id: allocationId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: userId },
      include: ALLOCATION_INCLUDE,
    });

    await writeAudit(tx, {
      action: 'ALLOCATION_CANCELLED',
      entityId: allocationId,
      userId,
      metadata: {
        allocationId,
        lotCode: allocation.lot.lotCode,
        bayCode: allocation.bay.bayCode,
        reason,
      },
    });
    return cancelled;
  });

module.exports = {
  STAGES,
  getConfig,
  listLots,
  getRecommendations,
  recordArrivalMode,
  allocateBay,
  confirmPlacement,
  cancelAllocation,
  setDemandProvider,
};
