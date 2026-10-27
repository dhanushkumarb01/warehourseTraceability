'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStaticDemandProvider } = require('../../src/placement/demandProvider');
const { parseMockDemand } = require('../../src/config/placement');

const provider = createStaticDemandProvider(parseMockDemand(JSON.stringify({
  defaultLevel: 'low',
  byMaterialType: { Coil: 'HIGH' },
  byMaterialCode: { 'MAT-9': 'medium' },
})));

test('material code beats material type beats default', () => {
  assert.equal(provider.getDemand({ material: { materialCode: 'MAT-9', materialType: 'Coil' } }).level, 'MEDIUM');
  assert.equal(provider.getDemand({ material: { materialCode: 'MAT-1', materialType: 'coil' } }).level, 'HIGH');
  assert.equal(provider.getDemand({ material: { materialCode: 'MAT-1', materialType: 'Plate' } }).level, 'LOW');
});

test('every result is labelled as a placeholder with its source', () => {
  const d = provider.getDemand({ material: { materialCode: 'X', materialType: 'Y' } });
  assert.equal(d.isPlaceholder, true);
  assert.equal(d.source, 'STATIC_CONFIG');
  assert.ok(d.explanation.length > 0);
});

test('a valid override wins and is marked MANUAL_OVERRIDE; an invalid one is ignored', () => {
  const material = { materialCode: 'MAT-9', materialType: 'Coil' };
  const o = provider.getDemand({ material, override: 'high' });
  assert.deepEqual([o.level, o.source], ['HIGH', 'MANUAL_OVERRIDE']);
  assert.equal(provider.getDemand({ material, override: 'EXTREME' }).level, 'MEDIUM');
});

test('invalid JSON config falls back to MEDIUM defaults', (t) => {
  t.mock.method(console, 'warn', () => {});
  const cfg = parseMockDemand('{not json');
  assert.equal(cfg.defaultLevel, 'MEDIUM');
  assert.deepEqual(cfg.byMaterialType, {});
});

test('unknown levels in config are dropped', () => {
  const cfg = parseMockDemand(JSON.stringify({ defaultLevel: 'HUGE', byMaterialType: { a: 'HIGH', b: 'NOPE' } }));
  assert.equal(cfg.defaultLevel, 'MEDIUM');
  assert.deepEqual(cfg.byMaterialType, { a: 'HIGH' });
});
