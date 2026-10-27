/**
 * Bay recommendation engine — STATIC PLACEHOLDER METHOD.
 *
 * Pure and deterministic: same inputs → same output, no I/O, no randomness.
 * The service layer loads the data; this module only ranks it, so the ranking
 * can be replaced by the real demand model without touching the API or UI.
 *
 * Method (STATIC_DISTANCE_DEMAND_V1):
 *
 *   1. Eligibility (hard rules, applied only where configured):
 *      - INACTIVE bays are excluded.
 *      - RAIL arrivals: bays in a zone with railConnected === false are excluded.
 *      - ROAD arrivals: bays in a zone with roadConnected === false are excluded.
 *      - null connectivity = "not configured" → allowed, with a note.
 *
 *   2. Relevant loading dock for each eligible bay:
 *      - ACTIVE docks that receive the lot's arrival mode (a dock with no
 *        configured modes is accepted, with a note).
 *      - Docks assigned to the bay's zone are preferred; if the zone has none,
 *        shared docks (no zone) are used. Other zones' docks are never used.
 *      - The nearest such dock with coordinates is the relevant dock.
 *
 *   3. Straight-line (Haversine) distance bay → relevant dock. A bay without a
 *      computable distance is still selectable but is NOT ranked ("unranked").
 *
 *   4. Ranking of bays that have a distance:
 *      - Position p ∈ [0,1] in the distance ordering (0 = nearest).
 *      - Demand target t: HIGH → 0 (nearest), MEDIUM → 0.5, LOW → 1 (farthest),
 *        so fast movers sit near the dock and slow movers keep it free.
 *      - Sort by: empty bays first (configurable), then |p − t|, then distance,
 *        then bay code.
 *      - The first `recommendationCount` are the recommendations.
 */

'use strict';

const { haversineDistanceM, hasCoordinates, formatDistance } = require('./geo');

const METHOD = Object.freeze({
  id: 'STATIC_DISTANCE_DEMAND_V1',
  label: 'Static placeholder rule',
  description:
    'Ranks bays by straight-line distance to the relevant loading dock and a configured ' +
    'placeholder demand level. It does not use dispatch history or any demand analytics yet.',
});

const DEMAND_TARGET = Object.freeze({ HIGH: 0, MEDIUM: 0.5, LOW: 1 });

const MODE_LABEL = Object.freeze({ RAIL: 'Rail', ROAD: 'Road' });

const byCode = (a, b) => String(a).localeCompare(String(b));

/**
 * Pick the relevant loading dock for a bay.
 * @returns {{ dock: object|null, distanceM: number|null, notes: string[], reason: string|null }}
 */
const resolveDock = (bay, zone, arrivalMode, docks) => {
  const notes = [];
  const modeOk = (d) => !d.arrivalModes?.length || d.arrivalModes.includes(arrivalMode);
  const active = docks.filter((d) => d.status !== 'INACTIVE' && modeOk(d));

  const zoneDocks = bay.zoneId ? active.filter((d) => d.zoneId === bay.zoneId) : [];
  const sharedDocks = active.filter((d) => !d.zoneId);
  const pool = zoneDocks.length ? zoneDocks : sharedDocks;
  const scope = zoneDocks.length ? 'zone' : 'shared';

  if (!pool.length) {
    return {
      dock: null,
      distanceM: null,
      notes,
      reason: `No active loading dock receiving ${MODE_LABEL[arrivalMode]} arrivals is configured for ` +
        `${zone ? `zone "${zone.name}"` : 'this bay\'s zone'} or as a shared dock.`,
    };
  }

  if (!hasCoordinates(bay)) {
    return { dock: null, distanceM: null, notes, reason: 'Bay coordinates are missing.' };
  }

  const measured = pool
    .filter(hasCoordinates)
    .map((d) => ({ dock: d, distanceM: haversineDistanceM(bay, d) }))
    .sort((a, b) => a.distanceM - b.distanceM || byCode(a.dock.dockCode, b.dock.dockCode));

  if (!measured.length) {
    return {
      dock: null,
      distanceM: null,
      notes,
      reason: `Coordinates are not set for the ${scope === 'zone' ? 'zone\'s' : 'shared'} loading dock(s): ` +
        `${pool.map((d) => d.dockCode).sort(byCode).join(', ')}.`,
    };
  }

  const best = measured[0];
  if (!best.dock.arrivalModes?.length) {
    notes.push(`Arrival modes are not configured for dock ${best.dock.dockCode}.`);
  }
  if (scope === 'shared') {
    notes.push(`Zone has no dock of its own — shared dock ${best.dock.dockCode} used.`);
  }
  return { dock: best.dock, distanceM: best.distanceM, notes, reason: null };
};

const describeDock = (dock) =>
  dock ? { id: dock.id, dockCode: dock.dockCode, dockName: dock.dockName, zoneId: dock.zoneId ?? null } : null;

const describeBay = (bay, zone) => ({
  id: bay.id,
  bayCode: bay.bayCode,
  bayName: bay.bayName,
  zone: bay.zone,
  zoneId: bay.zoneId ?? null,
  zoneConfigured: Boolean(zone),
  status: bay.status,
  latitude: bay.latitude ?? null,
  longitude: bay.longitude ?? null,
});

/**
 * Rank bays for one lot.
 *
 * @param {object} input
 * @param {{ id: string, lotCode: string, arrivalMode: 'RAIL'|'ROAD'|null }} input.lot
 * @param {{ level: 'HIGH'|'MEDIUM'|'LOW', source: string, isPlaceholder: boolean, explanation: string }} input.demand
 * @param {object[]} input.bays
 * @param {object[]} input.zones
 * @param {object[]} input.docks
 * @param {Object<string, { lotCount: number }>} [input.occupancy] keyed by bayId
 * @param {{ recommendationCount?: number, preferEmptyBays?: boolean }} [input.options]
 */
const recommendBays = ({ lot, demand, bays, zones, docks, occupancy = {}, options = {} }) => {
  const recommendationCount = options.recommendationCount ?? 3;
  const preferEmptyBays = options.preferEmptyBays ?? true;

  const base = {
    lotId: lot.id,
    lotCode: lot.lotCode,
    arrivalMode: lot.arrivalMode ?? null,
    demand,
    method: METHOD,
    distanceBasis: 'STRAIGHT_LINE',
    recommendations: [],
    candidates: [],
    unranked: [],
    excluded: [],
    warnings: [],
  };

  if (!lot.arrivalMode) {
    return { ...base, status: 'ARRIVAL_MODE_REQUIRED', warnings: ['Record whether the lot arrived by rail or road first.'] };
  }

  const zonesById = new Map(zones.map((z) => [z.id, z]));
  const mode = lot.arrivalMode;
  const connectivityKey = mode === 'RAIL' ? 'railConnected' : 'roadConnected';

  const measured = [];

  for (const bay of [...bays].sort((a, b) => byCode(a.bayCode, b.bayCode))) {
    const zone = bay.zoneId ? zonesById.get(bay.zoneId) : null;
    const lotCount = occupancy[bay.id]?.lotCount ?? 0;
    const entry = { bay: describeBay(bay, zone), lotCount, isEmpty: lotCount === 0 };

    if (bay.status === 'INACTIVE') {
      base.excluded.push({ ...entry, reasons: ['Bay is inactive.'] });
      continue;
    }
    if (zone && zone[connectivityKey] === false) {
      base.excluded.push({
        ...entry,
        reasons: [`Zone "${zone.name}" is configured as not reachable by ${MODE_LABEL[mode].toLowerCase()}.`],
      });
      continue;
    }

    const notes = [];
    if (!zone) notes.push('Zone is not configured — no zone rules applied.');
    else if (zone[connectivityKey] == null) {
      notes.push(`${MODE_LABEL[mode]} connectivity is not configured for zone "${zone.name}".`);
    }

    const { dock, distanceM, notes: dockNotes, reason } = resolveDock(bay, zone, mode, docks);
    notes.push(...dockNotes);

    if (distanceM == null) {
      base.unranked.push({ ...entry, dock: describeDock(dock), distanceM: null, distanceLabel: null, reasons: [reason], notes });
      continue;
    }
    measured.push({ ...entry, dock: describeDock(dock), distanceM, distanceLabel: formatDistance(distanceM), notes });
  }

  // Distance position: 0 = nearest eligible bay, 1 = farthest.
  measured.sort((a, b) => a.distanceM - b.distanceM || byCode(a.bay.bayCode, b.bay.bayCode));
  const n = measured.length;
  const target = DEMAND_TARGET[demand.level] ?? DEMAND_TARGET.MEDIUM;

  measured.forEach((m, i) => {
    m.distancePosition = n > 1 ? i / (n - 1) : 0;
    m.distanceOrder = i + 1;
    m.demandFit = Number((1 - Math.abs(m.distancePosition - target)).toFixed(4));
  });

  measured.sort((a, b) =>
    (preferEmptyBays ? Number(!a.isEmpty) - Number(!b.isEmpty) : 0) ||
    b.demandFit - a.demandFit ||
    a.distanceM - b.distanceM ||
    byCode(a.bay.bayCode, b.bay.bayCode));

  const demandWord = demand.level.charAt(0) + demand.level.slice(1).toLowerCase();
  const preference = { HIGH: 'bays nearest the dock', MEDIUM: 'mid-distance bays', LOW: 'bays farther from the dock' }[demand.level];

  base.candidates = measured.map((m, i) => {
    const reasons = [
      `${m.distanceLabel} straight-line to dock ${m.dock.dockCode}.`,
      `${m.distanceOrder} of ${n} eligible bays by distance; ${demandWord.toLowerCase()} demand (placeholder) prefers ${preference}.`,
      m.isEmpty ? 'Bay is empty.' : `Bay already holds ${m.lotCount} lot${m.lotCount === 1 ? '' : 's'} — shared placement.`,
    ];
    return {
      rank: i + 1,
      recommended: i < recommendationCount,
      bay: m.bay,
      dock: m.dock,
      distanceM: Number(m.distanceM.toFixed(1)),
      distanceLabel: m.distanceLabel,
      lotCount: m.lotCount,
      isEmpty: m.isEmpty,
      demandFit: m.demandFit,
      reasons,
      notes: m.notes,
    };
  });
  base.recommendations = base.candidates.filter((c) => c.recommended);

  if (!docks.length) {
    base.warnings.push('No loading docks are configured, so distances cannot be calculated.');
  }
  if (!base.candidates.length) {
    base.warnings.push('No bay could be ranked. Check loading-dock coordinates and zone rules.');
  }

  return { ...base, status: base.candidates.length ? 'OK' : 'NO_RANKED_BAYS' };
};

module.exports = { recommendBays, METHOD, DEMAND_TARGET };
