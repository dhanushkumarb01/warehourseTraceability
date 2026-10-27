/**
 * InboundConsignment — the warehouse's normalised contract for material that
 * arrives by rail and is already recorded in FOIS or SAP.
 *
 *   {
 *     source:              'FOIS' | 'SAP',
 *     externalRef:         string,      // stable unique id in the source system
 *     materialCode:        string,
 *     materialName:        string,
 *     materialType:        string|null, // null = source did not say
 *     quantity:            number|null,
 *     unit:                string|null,
 *     expectedOrArrivedAt: string|null, // ISO timestamp from the source
 *     meta:                object|null, // rake no., RR no., wagons… verbatim
 *     problems:            string[],    // non-empty = cannot be imported
 *   }
 *
 * Connectors return records in (roughly) this shape; normaliseConsignment is
 * the single place that trims, coerces and validates them. Nothing is guessed:
 * an unusable value becomes a problem, never a default.
 */

'use strict';

const SOURCES = Object.freeze(['FOIS', 'SAP']);

// Same limits as the manual lot / material validators.
const MAX_CODE = 50;
const MAX_UNIT = 20;

/** Material type stored when the source gives none; flagged for review. */
const UNCLASSIFIED_TYPE = 'UNCLASSIFIED';

const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

const toNumber = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
};

/**
 * @param {object} raw record from a connector
 * @returns {object} InboundConsignment (with `problems`)
 */
const normaliseConsignment = (raw = {}) => {
  const problems = [];

  const source = text(raw.source).toUpperCase();
  if (!SOURCES.includes(source)) problems.push(`Unknown source "${text(raw.source) || '(none)'}".`);

  const externalRef = text(raw.externalRef);
  if (!externalRef) problems.push('The record has no reference number.');
  else if (externalRef.length > MAX_CODE) problems.push(`Reference exceeds ${MAX_CODE} characters.`);

  const materialCode = text(raw.materialCode);
  if (!materialCode) problems.push('The record has no material code.');
  else if (materialCode.length > MAX_CODE) problems.push(`Material code exceeds ${MAX_CODE} characters.`);

  const materialName = text(raw.materialName);
  const materialType = text(raw.materialType) || null;

  const qty = toNumber(raw.quantity);
  const quantityValid = Number.isFinite(qty) && qty > 0;
  if (!quantityValid) {
    const shown = raw.quantity === undefined || raw.quantity === null || raw.quantity === '' ? 'nothing' : `"${raw.quantity}"`;
    problems.push(`Quantity must be a number greater than 0 (source sent ${shown}).`);
  }

  const unit = text(raw.unit).toUpperCase();
  if (!unit) problems.push('The record has no unit of measure.');
  else if (unit.length > MAX_UNIT) problems.push(`Unit exceeds ${MAX_UNIT} characters.`);

  let expectedOrArrivedAt = null;
  if (raw.expectedOrArrivedAt) {
    const d = new Date(raw.expectedOrArrivedAt);
    if (!Number.isNaN(d.getTime())) expectedOrArrivedAt = d.toISOString();
  }

  const meta = raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta : null;

  return {
    source,
    externalRef,
    materialCode,
    materialName,
    materialType,
    quantity: quantityValid ? qty : null,
    unit: unit || null,
    expectedOrArrivedAt,
    meta,
    problems,
  };
};

/** Lot code for an imported consignment, e.g. FOIS-RR-2610-0451. */
const lotCodeFor = ({ source, externalRef }) => `${source}-${externalRef}`;

module.exports = { SOURCES, UNCLASSIFIED_TYPE, normaliseConsignment, lotCodeFor };
