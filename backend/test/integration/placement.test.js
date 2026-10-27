/**
 * Placement / allocation integration tests — real HTTP against a real database.
 *
 * Runs ONLY when TEST_DATABASE_URL is set, and points the app at that database.
 * Use a disposable database with all migrations applied — never a dev or
 * production one. Every record created here carries a random suffix, so the
 * suite can be re-run against the same database.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:integration
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB = process.env.TEST_DATABASE_URL;

if (!TEST_DB) {
  test('placement integration (skipped: TEST_DATABASE_URL not set)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = TEST_DB;

  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');
  const { signToken } = require('../../src/utils/jwt');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const LAT = 12.9716;
  const LNG = 77.5946;
  const STEP = 0.0001; // ≈ 11 m

  let server;
  let baseUrl;
  const tokens = {};
  const ids = {};

  const api = async (method, path, role, body) => {
    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  };

  const makeLot = async (suffix, extra = {}) => prisma.materialLot.create({
    data: {
      lotCode: `IT-LOT-${tag}-${suffix}`,
      materialId: ids.materialId,
      quantity: 10,
      unit: 'MT',
      receivedDate: new Date(),
      ...extra,
    },
  });

  test.before(async () => {
    for (const role of ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MANAGER']) {
      const user = await prisma.user.create({
        data: {
          username: `it_${role.toLowerCase()}_${tag}`,
          email: `it_${role.toLowerCase()}_${tag}@example.test`,
          password: 'not-a-real-hash',
          role,
        },
      });
      tokens[role] = signToken(user);
    }
    const material = await prisma.material.create({
      data: { materialCode: `IT-MAT-${tag}`, materialName: 'Integration Coil', materialType: 'Coil' },
    });
    ids.materialId = material.id;

    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  // ── Location management ─────────────────────────────────────────────────

  test('zones: coordinate validation, permissions, creation', async () => {
    const half = await api('POST', '/zones', 'SUPERVISOR', { name: `IT Zone ${tag}`, latitude: LAT });
    assert.equal(half.status, 400);
    assert.match(JSON.stringify(half.body.errors), /both latitude and longitude/i);

    const range = await api('POST', '/zones', 'SUPERVISOR', { name: `IT Zone ${tag}`, latitude: 95, longitude: LNG });
    assert.equal(range.status, 400);

    const forbidden = await api('POST', '/zones', 'OPERATOR', { name: `IT Zone ${tag}` });
    assert.equal(forbidden.status, 403);

    const ok = await api('POST', '/zones', 'SUPERVISOR', {
      name: `IT Zone ${tag}`, latitude: LAT, longitude: LNG, railConnected: true, roadConnected: null,
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.railConnected, true);
    assert.equal(ok.body.data.roadConnected, null);
    ids.zoneId = ok.body.data.id;

    const noRail = await api('POST', '/zones', 'ADMIN', { name: `IT NoRail ${tag}`, railConnected: false });
    assert.equal(noRail.status, 201);
    assert.equal(noRail.body.data.latitude, null);
    ids.noRailZoneId = noRail.body.data.id;
  });

  test('loading docks: zone-scoped dock with coordinates and arrival modes', async () => {
    const bad = await api('POST', '/loading-docks', 'SUPERVISOR', {
      dockCode: `IT-D-${tag}`, dockName: 'Bad', arrivalModes: ['AIR'],
    });
    assert.equal(bad.status, 400);

    const dock = await api('POST', '/loading-docks', 'SUPERVISOR', {
      dockCode: `IT-D-${tag}`, dockName: 'Rail siding dock', zoneId: ids.zoneId,
      latitude: LAT, longitude: LNG, arrivalModes: ['RAIL', 'ROAD'],
    });
    assert.equal(dock.status, 201);
    assert.deepEqual(dock.body.data.arrivalModes, ['RAIL', 'ROAD']);
    ids.dockId = dock.body.data.id;

    const dock2 = await api('POST', '/loading-docks', 'SUPERVISOR', {
      dockCode: `IT-D2-${tag}`, dockName: 'No-rail zone dock', zoneId: ids.noRailZoneId,
      latitude: LAT, longitude: LNG + 0.01,
    });
    assert.equal(dock2.status, 201);
  });

  test('bays: zone label links to the Zone row; renaming a zone renames bay labels', async () => {
    for (let i = 1; i <= 4; i += 1) {
      const res = await api('POST', '/bays', 'SUPERVISOR', {
        bayCode: `IT-B${i}-${tag}`, bayName: `IT Bay ${i}`, zone: `IT Zone ${tag}`,
        latitude: LAT + STEP * i, longitude: LNG, status: 'AVAILABLE',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.zoneId, ids.zoneId);
      ids[`bay${i}`] = res.body.data.id;
    }
    const nr = await api('POST', '/bays', 'SUPERVISOR', {
      bayCode: `IT-NR-${tag}`, bayName: 'No-rail bay', zone: `IT NoRail ${tag}`,
      latitude: LAT, longitude: LNG + 0.0101, status: 'AVAILABLE',
    });
    assert.equal(nr.status, 201);
    ids.noRailBay = nr.body.data.id;

    const renamed = await api('PUT', `/zones/${ids.zoneId}`, 'SUPERVISOR', {
      name: `IT Zone ${tag} (renamed)`, latitude: LAT, longitude: LNG, railConnected: true,
    });
    assert.equal(renamed.status, 200);
    const bay = await prisma.bay.findUnique({ where: { id: ids.bay1 } });
    assert.equal(bay.zone, `IT Zone ${tag} (renamed)`);

    const del = await api('DELETE', `/zones/${ids.zoneId}`, 'ADMIN');
    assert.equal(del.status, 409, 'zone with bays cannot be deleted');
  });

  // ── Arrival mode + recommendations ──────────────────────────────────────

  test('arrival mode: required before recommendation; operators may record, managers may not', async () => {
    const lot = await makeLot('A');
    ids.lotA = lot.id;

    const before = await api('GET', `/placement/lots/${lot.id}/recommendations`, 'MANAGER');
    assert.equal(before.status, 200);
    assert.equal(before.body.data.status, 'ARRIVAL_MODE_REQUIRED');

    const mgr = await api('PUT', `/placement/lots/${lot.id}/arrival-mode`, 'MANAGER', { arrivalMode: 'RAIL' });
    assert.equal(mgr.status, 403);
    const bad = await api('PUT', `/placement/lots/${lot.id}/arrival-mode`, 'OPERATOR', { arrivalMode: 'BUS' });
    assert.equal(bad.status, 400);
    const ok = await api('PUT', `/placement/lots/${lot.id}/arrival-mode`, 'OPERATOR', { arrivalMode: 'RAIL' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.arrivalMode, 'RAIL');
    assert.ok(ok.body.data.arrivalRecordedAt);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: lot.id, action: 'ARRIVAL_MODE_RECORDED' } });
    assert.ok(audit);
  });

  test('recommendations: zone dock, straight-line distance, rail rule, demand override', async () => {
    const res = await api('GET', `/placement/lots/${ids.lotA}/recommendations?demandLevel=HIGH`, 'OPERATOR');
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data.demand.source, 'MANUAL_OVERRIDE');
    assert.equal(data.distanceBasis, 'STRAIGHT_LINE');

    const mine = data.candidates.filter((c) => c.bay.bayCode.endsWith(tag));
    assert.deepEqual(mine.map((c) => c.bay.bayCode), [1, 2, 3, 4].map((i) => `IT-B${i}-${tag}`));
    assert.equal(mine[0].dock.dockCode, `IT-D-${tag}`);
    assert.ok(Math.abs(mine[0].distanceM - 11.1) < 0.3);

    const excluded = data.excluded.find((e) => e.bay.id === ids.noRailBay);
    assert.ok(excluded, 'bay in a non-rail zone is excluded for a RAIL lot');

    const bad = await api('GET', `/placement/lots/${ids.lotA}/recommendations?demandLevel=EXTREME`, 'OPERATOR');
    assert.equal(bad.status, 400);
  });

  // ── Allocation workflow ─────────────────────────────────────────────────

  test('allocation: permissions and eligibility', async () => {
    const op = await api('POST', '/placement/allocations', 'OPERATOR', { lotId: ids.lotA, bayId: ids.bay2 });
    assert.equal(op.status, 403);

    const ineligible = await api('POST', '/placement/allocations', 'SUPERVISOR', { lotId: ids.lotA, bayId: ids.noRailBay });
    assert.equal(ineligible.status, 409);
    assert.match(ineligible.body.message, /not reachable by rail/);

    const noMode = await makeLot('NOMODE');
    const r = await api('POST', '/placement/allocations', 'SUPERVISOR', { lotId: noMode.id, bayId: ids.bay1 });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /rail or road/);
  });

  test('allocation: concurrent allotments of the same lot — exactly one wins', async () => {
    const [a, b] = await Promise.all([
      api('POST', '/placement/allocations', 'SUPERVISOR', { lotId: ids.lotA, bayId: ids.bay2, demandLevel: 'HIGH' }),
      api('POST', '/placement/allocations', 'ADMIN', { lotId: ids.lotA, bayId: ids.bay3 }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const winner = a.status === 201 ? a : b;
    ids.allocationA = winner.body.data.id;
    ids.allocatedBayA = winner.body.data.bayId;

    const open = await prisma.bayAllocation.count({ where: { lotId: ids.lotA, status: 'ALLOCATED' } });
    assert.equal(open, 1);
    assert.ok(winner.body.data.straightLineDistanceM > 0);
    assert.ok(winner.body.data.recommendationRank >= 1);
    assert.ok(winner.body.data.loadingDockId);
  });

  test('allocated lot: legacy mapping elsewhere and arrival changes are blocked', async () => {
    const other = ids.allocatedBayA === ids.bay4 ? ids.bay1 : ids.bay4;
    const map = await api('POST', '/mappings', 'OPERATOR', { lotId: ids.lotA, bayId: other });
    assert.equal(map.status, 409);
    assert.match(map.body.message, /allotted to bay/);

    const mode = await api('PUT', `/placement/lots/${ids.lotA}/arrival-mode`, 'OPERATOR', { arrivalMode: 'ROAD' });
    assert.equal(mode.status, 409);
  });

  test('confirm placement: creates the mapping, updates occupancy, closes the allocation', async () => {
    const mgr = await api('POST', `/placement/allocations/${ids.allocationA}/confirm`, 'MANAGER', {});
    assert.equal(mgr.status, 403);

    const ok = await api('POST', `/placement/allocations/${ids.allocationA}/confirm`, 'OPERATOR', { remarks: 'Placed' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.bayId, ids.allocatedBayA);
    assert.equal(ok.body.data.status, 'ACTIVE');

    const [alloc, lot, bay] = await Promise.all([
      prisma.bayAllocation.findUnique({ where: { id: ids.allocationA } }),
      prisma.materialLot.findUnique({ where: { id: ids.lotA } }),
      prisma.bay.findUnique({ where: { id: ids.allocatedBayA } }),
    ]);
    assert.equal(alloc.status, 'PLACED');
    assert.equal(alloc.placedMappingId, ok.body.data.id);
    assert.equal(lot.status, 'MAPPED');
    assert.equal(bay.status, 'OCCUPIED');

    const again = await api('POST', `/placement/allocations/${ids.allocationA}/confirm`, 'OPERATOR', {});
    assert.equal(again.status, 409);

    const changeMode = await api('PUT', `/placement/lots/${ids.lotA}/arrival-mode`, 'OPERATOR', { arrivalMode: 'ROAD' });
    assert.equal(changeMode.status, 409, 'arrival mode is locked once placed');
  });

  test('cancel allocation: supervisor only; lot returns to pending and can be mapped normally', async () => {
    const lot = await makeLot('B', { arrivalMode: 'ROAD' });
    const alloc = await api('POST', '/placement/allocations', 'SUPERVISOR', { lotId: lot.id, bayId: ids.bay4 });
    assert.equal(alloc.status, 201);

    const op = await api('POST', `/placement/allocations/${alloc.body.data.id}/cancel`, 'OPERATOR', {});
    assert.equal(op.status, 403);
    const ok = await api('POST', `/placement/allocations/${alloc.body.data.id}/cancel`, 'SUPERVISOR', { reason: 'Changed plan' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, 'CANCELLED');

    const list = await api('GET', `/placement/lots?search=${encodeURIComponent(lot.lotCode)}`, 'MANAGER');
    assert.equal(list.body.data.lots[0].stage, 'PENDING_ALLOCATION');

    // Regression: the original direct mapping path still works.
    const map = await api('POST', '/mappings', 'OPERATOR', { lotId: lot.id, bayId: ids.bay1 });
    assert.equal(map.status, 201);
  });

  test('concurrent allotment vs direct mapping of one lot — exactly one succeeds', async () => {
    const lot = await makeLot('C', { arrivalMode: 'ROAD' });
    const [alloc, map] = await Promise.all([
      api('POST', '/placement/allocations', 'SUPERVISOR', { lotId: lot.id, bayId: ids.bay3 }),
      api('POST', '/mappings', 'OPERATOR', { lotId: lot.id, bayId: ids.bay2 }),
    ]);
    assert.deepEqual([alloc.status, map.status].filter((s) => s < 300).length, 1, `${alloc.status}/${map.status}`);
    const active = await prisma.materialBayMapping.count({ where: { lotId: lot.id, status: 'ACTIVE' } });
    const open = await prisma.bayAllocation.count({ where: { lotId: lot.id, status: 'ALLOCATED' } });
    assert.equal(active + open, 1);
  });

  test('regression: move and remove still work on an allocation-placed lot', async () => {
    const target = ids.allocatedBayA === ids.bay4 ? ids.bay3 : ids.bay4;
    const move = await api('POST', '/mappings/move', 'OPERATOR', { lotId: ids.lotA, toBayId: target });
    assert.equal(move.status, 200);
    const remove = await api('POST', '/mappings/remove', 'OPERATOR', { lotId: ids.lotA });
    assert.equal(remove.status, 200);
    const lot = await prisma.materialLot.findUnique({ where: { id: ids.lotA } });
    assert.equal(lot.status, 'AVAILABLE');
  });

  test('list: stage counts and arrival-mode filter', async () => {
    const rail = await api('GET', '/placement/lots?arrivalMode=RAIL', 'MANAGER');
    assert.equal(rail.status, 200);
    assert.ok(rail.body.data.lots.every((l) => l.arrivalMode === 'RAIL'));
    const unrec = await api('GET', '/placement/lots?arrivalMode=UNRECORDED', 'MANAGER');
    assert.ok(unrec.body.data.lots.every((l) => l.arrivalMode === null));
    assert.ok(unrec.body.data.lots.every((l) => l.stage === 'AWAITING_ARRIVAL_MODE' || l.stage === 'PLACED'));
    const s = rail.body.data.summary;
    assert.ok(s.byArrivalMode.RAIL >= 1 && s.byArrivalMode.ROAD >= 2);

    const bad = await api('GET', '/placement/lots?arrivalMode=BUS', 'MANAGER');
    assert.equal(bad.status, 400);
  });

  test('integrity: referenced dock and allocated lot cannot be deleted', async () => {
    const dock = await api('DELETE', `/loading-docks/${ids.dockId}`, 'ADMIN');
    assert.equal(dock.status, 409);
    assert.match(dock.body.message, /Inactive/);

    const lot = await api('DELETE', `/lots/${ids.lotA}`, 'ADMIN');
    assert.equal(lot.status, 400);
  });

  test('unauthenticated requests are rejected', async () => {
    const res = await api('GET', '/placement/lots');
    assert.equal(res.status, 401);
  });
}
