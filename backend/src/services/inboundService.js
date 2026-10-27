/**
 * Inbound Service — rail consignments already recorded in FOIS / SAP.
 *
 * FOIS and SAP are the authoritative records for material arriving by rail, so
 * the warehouse never asks a user to re-key those lots. A supervisor picks the
 * matching consignment and it is imported as a MaterialLot (arrivalMode RAIL).
 * Importing does NOT allot a bay — the lot then follows the normal
 * placementService allocate → confirm workflow.
 *
 * Records come through the SAP connector factory (mock today; the http
 * connector reports "not configured" until the source format is confirmed).
 *
 * Double import is impossible: (source, externalRef) is unique on MaterialLot.
 * Two concurrent imports both reach the INSERT; the loser's P2002 is turned
 * into a 409 naming the lot the winner created.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { getConnector, getMode } = require('../sap/connectors');
const {
  UNCLASSIFIED_TYPE, normaliseConsignment, lotCodeFor,
} = require('../inbound/consignment');

const AUDIT_MODULE = 'INBOUND';

// Test hook: an injected connector replaces the factory's (null = factory).
let connectorOverride = null;
const setConnector = (connector) => { connectorOverride = connector; };
const connector = () => connectorOverride || getConnector();

/** Plain-language reason a source could not be read. */
const unreachableReason = (err) => {
  if (err?.code === 'INBOUND_NOT_CONFIGURED') return err.message;
  if (err?.sapUnavailable || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED') {
    return 'The FOIS / SAP source did not respond. Pending consignments cannot be shown until it is reachable.';
  }
  return `The FOIS / SAP source returned an error: ${err?.message || 'unknown error'}.`;
};

const sourceInfo = () => {
  const mode = connectorOverride?.mode || getMode();
  return { mode, isDemo: mode === 'mock' };
};

/** Lots already imported for these consignments, keyed "SOURCE|ref". */
const findImported = async (db, consignments) => {
  const bySource = {};
  for (const c of consignments) {
    if (!c.source || !c.externalRef) continue;
    (bySource[c.source] ||= []).push(c.externalRef);
  }
  const or = Object.entries(bySource).map(([source, refs]) => ({ source, externalRef: { in: refs } }));
  if (!or.length) return new Map();
  const lots = await db.materialLot.findMany({
    where: { OR: or },
    select: { id: true, lotCode: true, source: true, externalRef: true },
  });
  return new Map(lots.map((l) => [`${l.source}|${l.externalRef}`, l]));
};

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * Consignments waiting to be received: everything the source lists minus what
 * is already imported. When the source cannot be read the result says so
 * (`available: false` + `reason`) instead of returning an empty list.
 *
 * @param {{ source?: 'FOIS'|'SAP', search?: string }} filters
 */
const listPending = async ({ source, search } = {}) => {
  const info = sourceInfo();

  let raw;
  try {
    raw = await connector().getInboundConsignments({ source });
  } catch (err) {
    return { ...info, available: false, reason: unreachableReason(err), consignments: [], importedCount: 0 };
  }

  const all = (raw || []).map(normaliseConsignment);
  const imported = await findImported(prisma, all);

  const codes = [...new Set(all.map((c) => c.materialCode).filter(Boolean))];
  const catalogue = await prisma.material.findMany({
    where: { materialCode: { in: codes } },
    select: { id: true, materialCode: true, materialName: true, materialType: true },
  });
  const byCode = new Map(catalogue.map((m) => [m.materialCode, m]));

  const term = search?.trim().toLowerCase();
  const pending = all
    .filter((c) => !imported.has(`${c.source}|${c.externalRef}`))
    .map((c) => {
      const catalogueMaterial = byCode.get(c.materialCode) || null;
      const problems = [...c.problems];
      if (!catalogueMaterial && !c.materialName) {
        problems.push('Material is not in the catalogue and the record has no material name.');
      }
      return { ...c, problems, importable: problems.length === 0, catalogueMaterial, lotCode: lotCodeFor(c) };
    })
    .filter((c) => !term || [c.externalRef, c.materialCode, c.materialName, ...Object.values(c.meta || {}).flat()]
      .some((v) => typeof v === 'string' && v.toLowerCase().includes(term)));

  return { ...info, available: true, reason: null, consignments: pending, importedCount: imported.size };
};

// ─── Writes ───────────────────────────────────────────────────────────────────

const importInTx = (consignment, userId) =>
  prisma.$transaction(async (tx) => {
    const lotCode = lotCodeFor(consignment);

    const already = await tx.materialLot.findUnique({
      where: { source_externalRef: { source: consignment.source, externalRef: consignment.externalRef } },
      select: { lotCode: true },
    });
    if (already) {
      throw new AppError(`${consignment.source} consignment ${consignment.externalRef} was already received as lot ${already.lotCode}.`, 409);
    }
    const codeTaken = await tx.materialLot.findUnique({ where: { lotCode }, select: { id: true } });
    if (codeTaken) {
      throw new AppError(`Lot code "${lotCode}" is already used by another lot. Rename that lot before importing this consignment.`, 409);
    }

    let material = await tx.material.findUnique({ where: { materialCode: consignment.materialCode } });
    let materialCreated = false;
    if (!material) {
      if (!consignment.materialName) {
        throw new AppError(
          `Material ${consignment.materialCode} is not in the catalogue and the ${consignment.source} record has no material name. Add the material first.`,
          422
        );
      }
      material = await tx.material.create({
        data: {
          materialCode: consignment.materialCode,
          materialName: consignment.materialName,
          materialType: consignment.materialType || UNCLASSIFIED_TYPE,
          description: `Created from ${consignment.source} consignment ${consignment.externalRef}.`,
        },
      });
      materialCreated = true;
    }

    const now = new Date();
    const lot = await tx.materialLot.create({
      data: {
        lotCode,
        materialId: material.id,
        quantity: consignment.quantity,
        unit: consignment.unit,
        receivedDate: now,
        status: 'AVAILABLE',
        arrivalMode: 'RAIL',
        arrivalRecordedAt: now,
        source: consignment.source,
        externalRef: consignment.externalRef,
        externalMeta: { expectedOrArrivedAt: consignment.expectedOrArrivedAt, ...(consignment.meta || {}) },
      },
      include: { material: true },
    });

    await tx.auditLog.create({
      data: {
        userId,
        module: AUDIT_MODULE,
        action: 'LOT_IMPORTED',
        entityId: lot.id,
        remarks: JSON.stringify({
          lotId: lot.id,
          lotCode,
          source: consignment.source,
          externalRef: consignment.externalRef,
          materialCode: material.materialCode,
          materialCreated,
          materialUnclassified: material.materialType === UNCLASSIFIED_TYPE,
          quantity: consignment.quantity,
          unit: consignment.unit,
        }),
      },
    });

    return { lot, materialCreated };
  });

/**
 * Import one consignment as a rail lot. Re-reads the record from the source so
 * the lot reflects the system of record, not what the browser sent.
 *
 * @param {{ source: 'FOIS'|'SAP', externalRef: string, userId: string }} input
 */
const importConsignment = async ({ source, externalRef, userId }) => {
  let raw;
  try {
    raw = await connector().getInboundConsignment(source, externalRef);
  } catch (err) {
    throw new AppError(unreachableReason(err), 503);
  }
  if (!raw) throw new AppError(`${source} consignment ${externalRef} was not found in the source records.`, 404);

  const consignment = normaliseConsignment(raw);
  if (consignment.problems.length) {
    throw new AppError(`Cannot import ${source} consignment ${externalRef}: ${consignment.problems.join(' ')}`, 422);
  }

  // A concurrent import of a consignment for the same new material can lose
  // the material insert race; one retry then finds the winner's material.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await importInTx(consignment, userId);
    } catch (err) {
      if (err?.code !== 'P2002') throw err;
      const target = [].concat(err.meta?.target || []).join(',');
      if (target.includes('materialCode') && attempt === 0) continue;

      const winner = await prisma.materialLot.findUnique({
        where: { source_externalRef: { source, externalRef } },
        select: { lotCode: true },
      });
      if (winner) {
        throw new AppError(`${source} consignment ${externalRef} was just received as lot ${winner.lotCode} by another user.`, 409);
      }
      throw new AppError('This consignment conflicts with an existing record. Refresh and try again.', 409);
    }
  }
};

module.exports = { listPending, importConsignment, setConnector };
