'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  haversineDistanceM,
  validateCoordinatePair,
  hasCoordinates,
  formatDistance,
} = require('../../src/placement/geo');

test('haversine: identical points are 0 m apart', () => {
  const p = { latitude: 28.4595, longitude: 77.0266 };
  assert.equal(haversineDistanceM(p, p), 0);
});

test('haversine: London → Paris ≈ 343.6 km', () => {
  const london = { latitude: 51.5074, longitude: -0.1278 };
  const paris = { latitude: 48.8566, longitude: 2.3522 };
  const km = haversineDistanceM(london, paris) / 1000;
  assert.ok(Math.abs(km - 343.6) < 1, `got ${km}`);
});

test('haversine: 0.001° of latitude ≈ 111.2 m (warehouse scale)', () => {
  const a = { latitude: 28.4595, longitude: 77.0266 };
  const b = { latitude: 28.4605, longitude: 77.0266 };
  const m = haversineDistanceM(a, b);
  assert.ok(Math.abs(m - 111.2) < 0.5, `got ${m}`);
});

test('haversine: symmetric and antimeridian-safe', () => {
  const a = { latitude: 0, longitude: 179.9995 };
  const b = { latitude: 0, longitude: -179.9995 };
  assert.ok(haversineDistanceM(a, b) < 200);
  assert.equal(haversineDistanceM(a, b), haversineDistanceM(b, a));
});

test('haversine: missing or invalid coordinates return null, never 0', () => {
  const ok = { latitude: 10, longitude: 10 };
  assert.equal(haversineDistanceM(ok, { latitude: null, longitude: 10 }), null);
  assert.equal(haversineDistanceM(ok, { latitude: 10 }), null);
  assert.equal(haversineDistanceM(ok, null), null);
  assert.equal(haversineDistanceM(ok, { latitude: 91, longitude: 0 }), null);
  assert.equal(haversineDistanceM(ok, { latitude: '10', longitude: '10' }), null);
});

test('hasCoordinates requires both finite in-range numbers', () => {
  assert.equal(hasCoordinates({ latitude: 0, longitude: 0 }), true);
  assert.equal(hasCoordinates({ latitude: 0, longitude: null }), false);
  assert.equal(hasCoordinates({ latitude: NaN, longitude: 0 }), false);
  assert.equal(hasCoordinates(undefined), false);
});

test('validateCoordinatePair: blank pair is valid unless required', () => {
  assert.deepEqual(validateCoordinatePair(null, ''), { valid: true, value: { latitude: null, longitude: null } });
  assert.equal(validateCoordinatePair(undefined, undefined, { required: true }).valid, false);
});

test('validateCoordinatePair: half-filled pair is rejected', () => {
  const r = validateCoordinatePair(12.5, null);
  assert.equal(r.valid, false);
  assert.match(r.message, /both/i);
});

test('validateCoordinatePair: range checks and string coercion', () => {
  assert.equal(validateCoordinatePair(-90.0001, 0).valid, false);
  assert.equal(validateCoordinatePair(0, 180.5).valid, false);
  assert.equal(validateCoordinatePair('abc', 1).valid, false);
  assert.deepEqual(validateCoordinatePair(' 28.5 ', '77.1').value, { latitude: 28.5, longitude: 77.1 });
  assert.deepEqual(validateCoordinatePair(90, -180).value, { latitude: 90, longitude: -180 });
});

test('formatDistance', () => {
  assert.equal(formatDistance(42.4), '42 m');
  assert.equal(formatDistance(1234), '1.23 km');
  assert.equal(formatDistance(null), null);
});
