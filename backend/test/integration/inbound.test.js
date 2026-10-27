/**
 * Inbound (FOIS / SAP rail consignments) + road receipt integration tests —
 * real HTTP against a real database.
 *
 * Runs ONLY when TEST_DATABASE_URL is set. Use a disposable database with all
 * migrations applied — never a dev or production one. A fake connector with
 * tagged references is injected, so the suite can be re-run against the same
 * database without tripping the (source, externalRef) uniqueness.
 *
 *   TEST_DATABASE_URL=postgresql://... npm run test:integration
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB = process.env.TEST_DATABASE_URL;

if (!TEST_DB) {
  test('inbound integration (skipped: TEST_DATABASE_URL not set)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = TEST_DB;

  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');
  const inboundService = require('../../src/services/inboundService');
  const { signToken } = require('../../src/utils/jwt');

  const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ref = (n) => `IT-RR-${tag}-${n}`;

  const records = [
    { source: 'FOIS', externalRef: ref(1), materialCode: `IT-IN-MAT-${tag}`, materialName: 'IT Coil', materialType: 'Coil', quantity: 100, unit: 'KG', meta: { rakeNo: `DEMO-RK-${tag}` } },
    { source: 'FOIS', externalRef: ref(2), materialCode: `IT-NEW-${tag}`, materialName: 'IT Pig Iron', quantity: 50, unit: 'kg' },
    { source: 'SAP', externalRef: ref(3), materialCode: `IT-IN-MAT-${tag}`, materialName: 'IT Coil', quantity: 0, unit: '' },
    { source: 'FOIS', externalRef: ref(4), materialCode: `IT-IN-MAT-${tag}`, materialName: 'IT Coil', quantity: 7, unit: 'KG' },
  ];
  let down = false;
  const fakeConnector = {
    mode: 'mock',
    getInboundConsignments: async () => {
      if (down) { const e = new Error('down'); e.sapUnavailable = true; throw e; }
      return records.map((r) => ({ ...r }));
    },
    getInboundConsignment: async (source, externalRef) =>
      records.find((r) => r.source === source && r.externalRef === externalRef) || null,
  };

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

  test.before(async () => {
    inboundService.setConnector(fakeConnector);
    for (const role of ['ADMIN', 'SUPERVISOR', 'OPERATOR', 'MANAGER']) {
      const user = await prisma.user.create({
        data: {
          username: `itin_${role.toLowerCase()}_${tag}`,
          email: `itin_${role.toLowerCase()}_${tag}@example.test`,
          password: 'not-a-real-hash',
          role,
        },
      });
      tokens[role] = signToken(user);
    }
    const material = await prisma.material.create({
      data: { materialCode: `IT-IN-MAT-${tag}`, materialName: 'IT Coil', materialType: 'Coil' },
    });
    ids.materialId = material.id;
    const bay = await prisma.bay.create({
      data: { bayCode: `IT-IN-B-${tag}`, bayName: 'IT inbound bay', zone: `IT Inbound ${tag}`, latitude: 12.97, longitude: 77.59 },
    });
    ids.bayId = bay.id;

    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test.after(async () => {
    inboundService.setConnector(null);
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  // ── Rail: FOIS / SAP consignments ───────────────────────────────────────

  test('pending: operators and supervisors may view, managers may not; problems are flagged', async () => {
    assert.equal((await api('GET', '/inbound/pending', 'MANAGER')).status, 403);

    const res = await api('GET', '/inbound/pending', 'OPERATOR');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.available, true);
    assert.equal(res.body.data.isDemo, true);
    const mine = res.body.data.consignments.filter((c) => c.externalRef.includes(tag));
    assert.equal(mine.length, 4);

    const known = mine.find((c) => c.externalRef === ref(1));
    assert.equal(known.importable, true);
    assert.equal(known.catalogueMaterial.id, ids.materialId);
    assert.equal(known.lotCode, `FOIS-${ref(1)}`);

    assert.equal(mine.find((c) => c.externalRef === ref(2)).catalogueMaterial, null);
    const broken = mine.find((c) => c.externalRef === ref(3));
    assert.equal(broken.importable, false);
    assert.ok(broken.problems.length >= 2);
  });

  test('pending: an unreachable source is reported, never an empty "nothing to receive"', async () => {
    down = true;
    try {
      const res = await api('GET', '/inbound/pending', 'SUPERVISOR');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.available, false);
      assert.match(res.body.data.reason, /did not respond/);
    } finally {
      down = false;
    }
  });

  test('import: operators and managers cannot import', async () => {
    for (const role of ['OPERATOR', 'MANAGER']) {
      const res = await api('POST', '/inbound/import', role, { source: 'FOIS', externalRef: ref(1) });
      assert.equal(res.status, 403, role);
    }
  });

  test('import: validation, unknown consignment, and quantity/unit problems (422)', async () => {
    assert.equal((await api('POST', '/inbound/import', 'SUPERVISOR', { source: 'EMAIL', externalRef: ref(1) })).status, 400);
    assert.equal((await api('POST', '/inbound/import', 'SUPERVISOR', { source: 'FOIS', externalRef: `NOPE-${tag}` })).status, 404);

    const bad = await api('POST', '/inbound/import', 'SUPERVISOR', { source: 'SAP', externalRef: ref(3) });
    assert.equal(bad.status, 422);
    assert.match(bad.body.message, /Quantity/);
    assert.equal(await prisma.materialLot.count({ where: { source: 'SAP', externalRef: ref(3) } }), 0);
  });

  test('import: two concurrent imports of one consignment → exactly one lot, one 409', async () => {
    const results = await Promise.all([
      api('POST', '/inbound/import', 'SUPERVISOR', { source: 'FOIS', externalRef: ref(1) }),
      api('POST', '/inbound/import', 'ADMIN', { source: 'FOIS', externalRef: ref(1) }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await prisma.materialLot.count({ where: { source: 'FOIS', externalRef: ref(1) } }), 1);

    const won = results.find((r) => r.status === 201).body.data.lot;
    assert.equal(won.lotCode, `FOIS-${ref(1)}`);
    assert.equal(won.arrivalMode, 'RAIL');
    assert.equal(won.materialId, ids.materialId);
    assert.equal(won.externalMeta.rakeNo, `DEMO-RK-${tag}`);
    ids.railLotId = won.id;

    const again = await api('POST', '/inbound/import', 'SUPERVISOR', { source: 'FOIS', externalRef: ref(1) });
    assert.equal(again.status, 409);
    assert.match(again.body.message, /already received/);

    const audit = await prisma.auditLog.findFirst({ where: { module: 'INBOUND', action: 'LOT_IMPORTED', entityId: won.id } });
    assert.ok(audit);

    const pending = await api('GET', '/inbound/pending', 'SUPERVISOR');
    assert.ok(!pending.body.data.consignments.some((c) => c.externalRef === ref(1)), 'imported consignment leaves the pending list');
  });

  test('import: a missing material is created from the source record and flagged UNCLASSIFIED', async () => {
    const res = await api('POST', '/inbound/import', 'SUPERVISOR', { source: 'FOIS', externalRef: ref(2) });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.materialCreated, true);
    assert.equal(res.body.data.lot.material.materialCode, `IT-NEW-${tag}`);
    assert.equal(res.body.data.lot.material.materialType, 'UNCLASSIFIED');
    assert.equal(res.body.data.lot.unit, 'KG');
  });

  test('rail lot: allocate → confirm → placed through the existing workflow', async () => {
    assert.equal((await api('POST', '/placement/allocations', 'OPERATOR', { lotId: ids.railLotId, bayId: ids.bayId })).status, 403);

    const alloc = await api('POST', '/placement/allocations', 'SUPERVISOR', { lotId: ids.railLotId, bayId: ids.bayId });
    assert.equal(alloc.status, 201);
    assert.equal(alloc.body.data.arrivalMode, 'RAIL');

    const confirm = await api('POST', `/placement/allocations/${alloc.body.data.id}/confirm`, 'OPERATOR', {});
    assert.equal(confirm.status, 200);

    const list = await api('GET', `/placement/lots?search=${encodeURIComponent(`FOIS-${ref(1)}`)}`, 'OPERATOR');
    assert.equal(list.body.data.lots[0].stage, 'PLACED');
    assert.equal(list.body.data.lots[0].activeMapping.bayId, ids.bayId);
  });

  // ── Road: lot with an inline new material ──────────────────────────────

  const roadLot = (suffix, extra = {}) => ({
    lotCode: `IT-ROAD-${tag}-${suffix}`, quantity: 5, unit: 'KG', receivedDate: new Date().toISOString(), ...extra,
  });

  test('road: lot + new material in one request; arrival mode required; no half-created records', async () => {
    const material = { materialCode: `IT-ROADMAT-${tag}`, materialName: 'IT Plate', materialType: 'Plate' };

    const noMode = await api('POST', '/lots', 'OPERATOR', roadLot(1, { material }));
    assert.equal(noMode.status, 400);

    const both = await api('POST', '/lots', 'OPERATOR', roadLot(1, { material, materialId: ids.materialId, arrivalMode: 'ROAD' }));
    assert.equal(both.status, 400);

    const ok = await api('POST', '/lots', 'OPERATOR', roadLot(1, { material, arrivalMode: 'ROAD' }));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.arrivalMode, 'ROAD');
    assert.equal(ok.body.data.source, 'MANUAL');
    const created = await prisma.material.findUnique({ where: { materialCode: material.materialCode } });
    assert.equal(ok.body.data.materialId, created.id);

    const dupMaterial = await api('POST', '/lots', 'OPERATOR', roadLot(2, { material, arrivalMode: 'ROAD' }));
    assert.equal(dupMaterial.status, 409);
    assert.equal(await prisma.materialLot.count({ where: { lotCode: `IT-ROAD-${tag}-2` } }), 0);

    const dupLot = await api('POST', '/lots', 'OPERATOR', roadLot(1, {
      material: { ...material, materialCode: `IT-ROADMAT2-${tag}` }, arrivalMode: 'ROAD',
    }));
    assert.equal(dupLot.status, 409);
    assert.equal(await prisma.material.count({ where: { materialCode: `IT-ROADMAT2-${tag}` } }), 0);

    assert.equal((await api('POST', '/lots', 'MANAGER', roadLot(3, { material, arrivalMode: 'ROAD' }))).status, 403);
  });

  // ── Backward compatibility ─────────────────────────────────────────────

  test('regression: existing lot / material / placement endpoints keep their behaviour', async () => {
    const legacy = await api('POST', '/lots', 'OPERATOR', roadLot('L1', { materialId: ids.materialId }));
    assert.equal(legacy.status, 201);
    assert.equal(legacy.body.data.arrivalMode, null);
    assert.equal(legacy.body.data.source, 'MANUAL');
    assert.equal(legacy.body.data.externalRef, null);

    // Many manual lots with a null externalRef are allowed.
    assert.equal((await api('POST', '/lots', 'OPERATOR', roadLot('L2', { materialId: ids.materialId }))).status, 201);

    const update = await api('PUT', `/lots/${legacy.body.data.id}`, 'OPERATOR', roadLot('L1', { materialId: ids.materialId, quantity: 9 }));
    assert.equal(update.status, 200);
    assert.equal(update.body.data.quantity, 9);

    const missingMaterial = await api('PUT', `/lots/${legacy.body.data.id}`, 'OPERATOR', roadLot('L1'));
    assert.equal(missingMaterial.status, 400, 'update still requires materialId');

    assert.equal((await api('GET', '/lots', 'MANAGER')).status, 200);
    assert.equal((await api('GET', `/materials/${ids.materialId}`, 'MANAGER')).status, 200);
    const placement = await api('GET', '/placement/lots?arrivalMode=UNRECORDED', 'MANAGER');
    assert.equal(placement.status, 200);
    assert.ok(placement.body.data.lots.some((l) => l.id === legacy.body.data.id));
  });

  test('unauthenticated inbound requests are rejected', async () => {
    assert.equal((await api('GET', '/inbound/pending')).status, 401);
    assert.equal((await api('POST', '/inbound/import', null, { source: 'FOIS', externalRef: ref(4) })).status, 401);
  });
}
