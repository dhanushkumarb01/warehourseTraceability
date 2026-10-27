'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { recommendBays } = require('../../src/placement/recommendationEngine');

// Layout: dock D-A at the origin of zone A; bays A1..A5 step north ~11 m each.
const BASE_LAT = 28.4595;
const LNG = 77.0266;
const step = 0.0001; // ≈ 11.1 m

const zone = (id, extra = {}) => ({ id, name: `Zone ${id}`, railConnected: null, roadConnected: null, ...extra });
const bay = (code, zoneId, i, extra = {}) => ({
  id: `bay-${code}`, bayCode: code, bayName: code, zone: `Zone ${zoneId}`, zoneId,
  latitude: BASE_LAT + step * i, longitude: LNG, status: 'AVAILABLE', ...extra,
});
const dock = (code, zoneId, extra = {}) => ({
  id: `dock-${code}`, dockCode: code, dockName: code, zoneId,
  latitude: BASE_LAT, longitude: LNG, arrivalModes: ['RAIL', 'ROAD'], status: 'ACTIVE', ...extra,
});
const demand = (level) => ({ level, source: 'STATIC_CONFIG', isPlaceholder: true, explanation: 'test' });
const lot = (arrivalMode = 'ROAD') => ({ id: 'lot-1', lotCode: 'LOT-1', arrivalMode });

const layoutA = () => ({
  zones: [zone('A')],
  docks: [dock('D-A', 'A')],
  bays: [1, 2, 3, 4, 5].map((i) => bay(`A${i}`, 'A', i)),
});

const codes = (list) => list.map((c) => c.bay.bayCode);

test('requires an arrival mode before ranking anything', () => {
  const r = recommendBays({ lot: lot(null), demand: demand('HIGH'), ...layoutA() });
  assert.equal(r.status, 'ARRIVAL_MODE_REQUIRED');
  assert.equal(r.candidates.length, 0);
});

test('HIGH demand → nearest bays first; LOW → farthest; MEDIUM → middle', () => {
  const high = recommendBays({ lot: lot(), demand: demand('HIGH'), ...layoutA() });
  assert.deepEqual(codes(high.recommendations), ['A1', 'A2', 'A3']);

  const low = recommendBays({ lot: lot(), demand: demand('LOW'), ...layoutA() });
  assert.deepEqual(codes(low.recommendations), ['A5', 'A4', 'A3']);

  const med = recommendBays({ lot: lot(), demand: demand('MEDIUM'), ...layoutA() });
  assert.equal(med.recommendations[0].bay.bayCode, 'A3');
});

test('is deterministic regardless of input order', () => {
  const l = layoutA();
  const a = recommendBays({ lot: lot(), demand: demand('HIGH'), ...l });
  const b = recommendBays({ lot: lot(), demand: demand('HIGH'), ...l, bays: [...l.bays].reverse(), docks: [...l.docks].reverse() });
  assert.deepEqual(a, b);
});

test('distances are straight-line metres to the relevant dock and labelled', () => {
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), ...layoutA() });
  const top = r.candidates[0];
  assert.equal(r.distanceBasis, 'STRAIGHT_LINE');
  assert.equal(top.dock.dockCode, 'D-A');
  assert.ok(Math.abs(top.distanceM - 11.1) < 0.2, `got ${top.distanceM}`);
  assert.equal(top.distanceLabel, '11 m');
  assert.ok(top.reasons.some((x) => /straight-line/.test(x)));
});

test('empty bays outrank occupied ones when preferEmptyBays is on (default)', () => {
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), ...layoutA(), occupancy: { 'bay-A1': { lotCount: 2 } } });
  assert.deepEqual(codes(r.recommendations), ['A2', 'A3', 'A4']);
  const a1 = r.candidates.find((c) => c.bay.bayCode === 'A1');
  assert.equal(a1.isEmpty, false);
  assert.ok(a1.reasons.some((x) => /2 lots/.test(x)));

  const off = recommendBays({
    lot: lot(), demand: demand('HIGH'), ...layoutA(),
    occupancy: { 'bay-A1': { lotCount: 2 } }, options: { preferEmptyBays: false },
  });
  assert.equal(off.recommendations[0].bay.bayCode, 'A1');
});

test('recommendationCount controls how many are flagged recommended', () => {
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), ...layoutA(), options: { recommendationCount: 1 } });
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.candidates.length, 5);
});

test('inactive bays are excluded with a reason', () => {
  const l = layoutA();
  l.bays[0].status = 'INACTIVE';
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), ...l });
  assert.ok(!codes(r.candidates).includes('A1'));
  assert.match(r.excluded[0].reasons[0], /inactive/i);
});

test('RAIL arrival: zone with railConnected=false is excluded; null is allowed with a note', () => {
  const zones = [zone('A', { railConnected: false }), zone('B')];
  const docks = [dock('D-A', 'A'), dock('D-B', 'B')];
  const bays = [bay('A1', 'A', 1), bay('B1', 'B', 2)];

  const rail = recommendBays({ lot: lot('RAIL'), demand: demand('HIGH'), zones, docks, bays });
  assert.deepEqual(codes(rail.candidates), ['B1']);
  assert.match(rail.excluded[0].reasons[0], /not reachable by rail/);
  assert.ok(rail.candidates[0].notes.some((n) => /Rail connectivity is not configured/.test(n)));

  // Same zone rule does not restrict ROAD arrivals.
  const road = recommendBays({ lot: lot('ROAD'), demand: demand('HIGH'), zones, docks, bays });
  assert.equal(road.candidates.length, 2);
});

test('ROAD arrival respects roadConnected=false', () => {
  const zones = [zone('A', { roadConnected: false })];
  const r = recommendBays({ lot: lot('ROAD'), demand: demand('HIGH'), zones, docks: [dock('D-A', 'A')], bays: [bay('A1', 'A', 1)] });
  assert.equal(r.candidates.length, 0);
  assert.equal(r.excluded.length, 1);
  assert.equal(r.status, 'NO_RANKED_BAYS');
});

test('dock selection: zone docks first, never another zone\'s dock, shared docks as fallback', () => {
  const zones = [zone('A'), zone('B'), zone('C')];
  const docks = [
    dock('D-A', 'A', { latitude: BASE_LAT + 0.01 }), // far, but it is zone A's own dock
    dock('D-B', 'B'),                                  // near, but belongs to zone B
    dock('SHARED', null, { latitude: BASE_LAT + 0.0002 }),
  ];
  const bays = [bay('A1', 'A', 1), bay('C1', 'C', 1)];
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), zones, docks, bays });

  const a1 = r.candidates.find((c) => c.bay.bayCode === 'A1');
  const c1 = r.candidates.find((c) => c.bay.bayCode === 'C1');
  assert.equal(a1.dock.dockCode, 'D-A');
  assert.equal(c1.dock.dockCode, 'SHARED');
  assert.ok(c1.notes.some((n) => /shared dock/.test(n)));
});

test('dock arrival modes: a ROAD-only dock is not used for RAIL lots', () => {
  const zones = [zone('A')];
  const docks = [dock('ROAD-DOCK', 'A', { arrivalModes: ['ROAD'] }), dock('RAIL-DOCK', 'A', { arrivalModes: ['RAIL'], latitude: BASE_LAT + 0.001 })];
  const r = recommendBays({ lot: lot('RAIL'), demand: demand('HIGH'), zones, docks, bays: [bay('A1', 'A', 1)] });
  assert.equal(r.candidates[0].dock.dockCode, 'RAIL-DOCK');
});

test('a dock with no configured modes is accepted with a note', () => {
  const r = recommendBays({
    lot: lot('RAIL'), demand: demand('HIGH'), zones: [zone('A')],
    docks: [dock('D-A', 'A', { arrivalModes: [] })], bays: [bay('A1', 'A', 1)],
  });
  assert.equal(r.candidates.length, 1);
  assert.ok(r.candidates[0].notes.some((n) => /Arrival modes are not configured/.test(n)));
});

test('missing dock coordinates → bay is unranked with a reason, never given a distance', () => {
  const r = recommendBays({
    lot: lot(), demand: demand('HIGH'), zones: [zone('A')],
    docks: [dock('D-A', 'A', { latitude: null, longitude: null })], bays: [bay('A1', 'A', 1)],
  });
  assert.equal(r.candidates.length, 0);
  assert.equal(r.unranked.length, 1);
  assert.equal(r.unranked[0].distanceM, null);
  assert.match(r.unranked[0].reasons[0], /Coordinates are not set/);
});

test('no docks at all → every bay unranked plus a global warning', () => {
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), zones: [zone('A')], docks: [], bays: [bay('A1', 'A', 1)] });
  assert.equal(r.unranked.length, 1);
  assert.ok(r.warnings.some((w) => /No loading docks/.test(w)));
});

test('inactive docks are ignored', () => {
  const r = recommendBays({
    lot: lot(), demand: demand('HIGH'), zones: [zone('A')],
    docks: [dock('D-A', 'A', { status: 'INACTIVE' })], bays: [bay('A1', 'A', 1)],
  });
  assert.equal(r.candidates.length, 0);
  assert.match(r.unranked[0].reasons[0], /No active loading dock/);
});

test('bay without a configured zone is still handled, with a note', () => {
  const r = recommendBays({
    lot: lot(), demand: demand('HIGH'), zones: [],
    docks: [dock('SHARED', null)], bays: [bay('X1', null, 1)],
  });
  assert.equal(r.candidates.length, 1);
  assert.ok(r.candidates[0].notes.some((n) => /Zone is not configured/.test(n)));
});

test('method is labelled as a static placeholder, not analytics', () => {
  const r = recommendBays({ lot: lot(), demand: demand('HIGH'), ...layoutA() });
  assert.equal(r.method.id, 'STATIC_DISTANCE_DEMAND_V1');
  assert.match(r.method.description, /does not use dispatch history/);
  assert.doesNotMatch(JSON.stringify(r), /\bAI\b|machine learning/i);
});
