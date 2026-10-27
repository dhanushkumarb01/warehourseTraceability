'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normaliseConsignment, lotCodeFor, SOURCES } = require('../../src/inbound/consignment');
const { consignments } = require('../../src/sap/mock/inboundDataset');

const valid = {
  source: 'fois',
  externalRef: '  RR-1  ',
  materialCode: 'MAT-1',
  materialName: 'Coil',
  quantity: '12.5',
  unit: 'kg',
  expectedOrArrivedAt: '2026-10-26T06:30:00Z',
  meta: { rakeNo: 'RK-1' },
};

test('a valid record is trimmed and coerced into the contract with no problems', () => {
  const c = normaliseConsignment(valid);
  assert.deepEqual(c.problems, []);
  assert.equal(c.source, 'FOIS');
  assert.equal(c.externalRef, 'RR-1');
  assert.equal(c.quantity, 12.5);
  assert.equal(c.unit, 'KG');
  assert.equal(c.materialType, null);
  assert.equal(c.expectedOrArrivedAt, '2026-10-26T06:30:00.000Z');
  assert.deepEqual(c.meta, { rakeNo: 'RK-1' });
});

test('quantity and unit problems are reported, never defaulted', () => {
  for (const quantity of [0, -3, 'abc', '', null, undefined]) {
    const c = normaliseConsignment({ ...valid, quantity });
    assert.equal(c.quantity, null, `quantity ${quantity}`);
    assert.ok(c.problems.some((p) => /Quantity/.test(p)), `quantity ${quantity}`);
  }
  const noUnit = normaliseConsignment({ ...valid, unit: '  ' });
  assert.equal(noUnit.unit, null);
  assert.ok(noUnit.problems.some((p) => /unit/.test(p)));
});

test('unknown source, missing reference or material code are problems', () => {
  assert.ok(normaliseConsignment({ ...valid, source: 'EMAIL' }).problems.some((p) => /source/.test(p)));
  assert.ok(normaliseConsignment({ ...valid, externalRef: '' }).problems.some((p) => /reference/.test(p)));
  assert.ok(normaliseConsignment({ ...valid, materialCode: null }).problems.some((p) => /material code/.test(p)));
});

test('an unparseable date becomes null; non-object meta is dropped', () => {
  const c = normaliseConsignment({ ...valid, expectedOrArrivedAt: 'yesterday', meta: ['x'] });
  assert.equal(c.expectedOrArrivedAt, null);
  assert.equal(c.meta, null);
  assert.deepEqual(c.problems, []);
});

test('lot code is SOURCE-externalRef', () => {
  assert.equal(lotCodeFor({ source: 'FOIS', externalRef: 'RR-2610-0451' }), 'FOIS-RR-2610-0451');
});

test('mock dataset: unique refs, known sources, and the four documented scenarios', () => {
  const keys = consignments.map((c) => `${c.source}|${c.externalRef}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const c of consignments) assert.ok(SOURCES.includes(c.source));

  const byRef = Object.fromEntries(consignments.map((c) => [c.externalRef, normaliseConsignment(c)]));
  assert.deepEqual(byRef['RR-2610-0451'].problems, []);
  assert.equal(byRef['RR-2610-0467'].materialType, null, 'new material arrives without a type');
  assert.deepEqual(byRef['RR-2610-0398'].problems, []);
  assert.ok(byRef['IBD-5000012345'].problems.length >= 2, 'quantity and unit both rejected');
});

test('mock dataset is visibly labelled as demo data', () => {
  for (const c of consignments) {
    for (const v of Object.values(c.meta || {}).flat()) {
      if (/^(RK|W)-/.test(v)) assert.fail(`meta value ${v} looks real; prefix with DEMO-`);
    }
  }
});
