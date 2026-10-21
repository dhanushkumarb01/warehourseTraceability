/**
 * Truck Stage Configuration (Phase 10)
 *
 * Single source of truth for the yard checkpoint sequence and the business
 * thresholds that drive the lifecycle rule engine. Centralised here so the
 * sequence/delay rules are configurable in ONE place rather than scattered or
 * hardcoded across services.
 *
 * Stage values mirror the TruckStage enum in schema.prisma. The numeric order
 * defines the expected forward sequence used for sequence-violation detection.
 */

'use strict';

const STAGE_ORDER = Object.freeze({
  ENTRY_GATE: 1,
  WEIGH_BRIDGE_1: 2,
  LOADING_DOCK: 3,
  WEIGH_BRIDGE_2: 4,
  INVOICE: 5,
  PARKING: 6,
  EXIT_GATE: 7,
});

const STAGES = Object.freeze(Object.keys(STAGE_ORDER));

/** After INVOICE, only these stages are legitimate (Rule 1). */
const POST_INVOICE_ALLOWED = Object.freeze(['PARKING', 'EXIT_GATE']);

const minutes = (m) => m * 60 * 1000;
const hours = (h) => h * 60 * 60 * 1000;

/**
 * Maximum dwell time per stage before a DELAY alert is raised (Rule 3).
 * Tunable in this one place. LOADING_DOCK is the operationally sensitive one.
 */
const DELAY_THRESHOLD_MS = Object.freeze({
  ENTRY_GATE: minutes(30),
  WEIGH_BRIDGE_1: minutes(30),
  LOADING_DOCK: hours(4),
  WEIGH_BRIDGE_2: minutes(30),
  INVOICE: hours(1),
  PARKING: hours(24),
  EXIT_GATE: minutes(15),
});

const DEFAULT_DELAY_MS = hours(2);

const isValidStage = (s) => Object.prototype.hasOwnProperty.call(STAGE_ORDER, s);
const order = (s) => STAGE_ORDER[s] || 0;
const delayThreshold = (s) => DELAY_THRESHOLD_MS[s] ?? DEFAULT_DELAY_MS;

const STAGE_LABEL = Object.freeze({
  ENTRY_GATE: 'Entry Gate',
  WEIGH_BRIDGE_1: 'Weigh Bridge 1',
  LOADING_DOCK: 'Loading Dock',
  WEIGH_BRIDGE_2: 'Weigh Bridge 2',
  INVOICE: 'Invoice',
  PARKING: 'Parking',
  EXIT_GATE: 'Exit Gate',
});

module.exports = {
  STAGE_ORDER,
  STAGES,
  STAGE_LABEL,
  POST_INVOICE_ALLOWED,
  DELAY_THRESHOLD_MS,
  DEFAULT_DELAY_MS,
  isValidStage,
  order,
  delayThreshold,
};
