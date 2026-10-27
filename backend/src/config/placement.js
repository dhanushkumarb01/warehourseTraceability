/**
 * Placement / bay-recommendation configuration.
 *
 * The demand values here are a STATIC PLACEHOLDER used until the real demand
 * model (derived from dispatch history) exists. They are configuration, not
 * analytics, and the API labels them as such.
 *
 * Override without a code change through env:
 *
 *   PLACEMENT_MOCK_DEMAND='{"defaultLevel":"MEDIUM",
 *                           "byMaterialType":{"Coil":"HIGH"},
 *                           "byMaterialCode":{"MAT-005":"LOW"}}'
 *   PLACEMENT_RECOMMENDATION_COUNT=3
 *   PLACEMENT_PREFER_EMPTY_BAYS=true
 *
 * Precedence: byMaterialCode → byMaterialType → defaultLevel.
 */

'use strict';

const DEMAND_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);

const DEFAULT_MOCK_DEMAND = Object.freeze({
  defaultLevel: 'MEDIUM',
  byMaterialType: {},
  byMaterialCode: {},
});

const normaliseLevel = (v) => {
  const level = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return DEMAND_LEVELS.includes(level) ? level : null;
};

const normaliseMap = (obj) => {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    const level = normaliseLevel(value);
    if (level) out[key.trim().toLowerCase()] = level;
  }
  return out;
};

/**
 * Parse a mock-demand JSON string. Invalid input falls back to defaults with a
 * warning — a typo in an env var must not take the API down.
 * @param {string|undefined} raw
 */
const parseMockDemand = (raw) => {
  if (!raw) return { ...DEFAULT_MOCK_DEMAND, byMaterialType: {}, byMaterialCode: {} };
  try {
    const parsed = JSON.parse(raw);
    return {
      defaultLevel: normaliseLevel(parsed.defaultLevel) || DEFAULT_MOCK_DEMAND.defaultLevel,
      byMaterialType: normaliseMap(parsed.byMaterialType),
      byMaterialCode: normaliseMap(parsed.byMaterialCode),
    };
  } catch {
    console.warn('[placement] PLACEMENT_MOCK_DEMAND is not valid JSON — using defaults.');
    return { ...DEFAULT_MOCK_DEMAND, byMaterialType: {}, byMaterialCode: {} };
  }
};

const parsePositiveInt = (raw, fallback) => {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : fallback;
};

const placementConfig = Object.freeze({
  recommendationCount: parsePositiveInt(process.env.PLACEMENT_RECOMMENDATION_COUNT, 3),
  preferEmptyBays: process.env.PLACEMENT_PREFER_EMPTY_BAYS !== 'false',
  mockDemand: parseMockDemand(process.env.PLACEMENT_MOCK_DEMAND),
});

module.exports = { DEMAND_LEVELS, placementConfig, parseMockDemand, normaliseLevel };
