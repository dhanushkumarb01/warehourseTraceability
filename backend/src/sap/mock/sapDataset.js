/**
 * Mock SAP Dataset
 *
 * A realistic, enterprise-shaped seed of SAP master and transactional data used
 * by the simulated ERP. Payload shapes intentionally mirror common SAP S/4HANA
 * concepts (material master, batch, stock, outbound delivery) so the contract
 * the warehouse codes against matches what a real SAP gateway would expose.
 *
 * Two behaviours combine to make the mock production-realistic:
 *   1. Explicit seeded records — curated enterprise scenarios (released,
 *      blocked, quality-hold, inventory mismatch, rejected delivery) that drive
 *      demos and tests deterministically.
 *   2. Synthetic fallback (see sapMockService) — any code not explicitly seeded
 *      resolves to a deterministic RELEASED record so user-created warehouse
 *      materials are not blocked by the mock simply "not knowing" them. Codes
 *      containing BLOCK/BLK → BLOCKED, HOLD/QA → QUALITY_HOLD.
 */

'use strict';

// SAP material statuses (cross-plant material status).
const MATERIAL_STATUS = { RELEASED: 'RELEASED', BLOCKED: 'BLOCKED', QUALITY_HOLD: 'QUALITY_HOLD' };
// SAP batch (lot) statuses.
const BATCH_STATUS = { UNRESTRICTED: 'UNRESTRICTED', BLOCKED: 'BLOCKED', QUALITY_INSPECTION: 'QUALITY_INSPECTION' };
// SAP outbound delivery statuses.
const DELIVERY_STATUS = { CREATED: 'CREATED', APPROVED: 'APPROVED', COMPLETED: 'COMPLETED', REJECTED: 'REJECTED' };

const PLANT = '1000';

// ─── Materials (material master) ──────────────────────────────────────────────
const materials = [
  { materialNumber: 'MAT-1001', description: 'Cold Rolled Steel Coil', materialType: 'RAW', status: MATERIAL_STATUS.RELEASED, baseUnit: 'KG', plant: PLANT },
  { materialNumber: 'MAT-1002', description: 'Copper Wire Spool', materialType: 'RAW', status: MATERIAL_STATUS.RELEASED, baseUnit: 'KG', plant: PLANT },
  { materialNumber: 'MAT-2002', description: 'Recalled Polymer Resin', materialType: 'RAW', status: MATERIAL_STATUS.BLOCKED, baseUnit: 'KG', plant: PLANT },
  { materialNumber: 'MAT-3003', description: 'Pharma-grade Excipient', materialType: 'RAW', status: MATERIAL_STATUS.QUALITY_HOLD, baseUnit: 'KG', plant: PLANT },
];

// ─── Batches (lots) ───────────────────────────────────────────────────────────
const batches = [
  { batchNumber: 'LOT-1001-A', materialNumber: 'MAT-1001', quantity: 5000, unit: 'KG', status: BATCH_STATUS.UNRESTRICTED },
  { batchNumber: 'LOT-1002-A', materialNumber: 'MAT-1002', quantity: 1200, unit: 'KG', status: BATCH_STATUS.UNRESTRICTED },
  { batchNumber: 'LOT-2002-A', materialNumber: 'MAT-2002', quantity: 800, unit: 'KG', status: BATCH_STATUS.BLOCKED },
  { batchNumber: 'LOT-3003-A', materialNumber: 'MAT-3003', quantity: 300, unit: 'KG', status: BATCH_STATUS.QUALITY_INSPECTION },
];

// ─── Inventory (stock) ────────────────────────────────────────────────────────
const inventory = [
  { materialNumber: 'MAT-1001', plant: PLANT, unrestrictedQty: 5000, blockedQty: 0, unit: 'KG' },
  { materialNumber: 'MAT-1002', plant: PLANT, unrestrictedQty: 50, blockedQty: 0, unit: 'KG' }, // intentional low/mismatch scenario
  { materialNumber: 'MAT-2002', plant: PLANT, unrestrictedQty: 0, blockedQty: 800, unit: 'KG' },
  { materialNumber: 'MAT-3003', plant: PLANT, unrestrictedQty: 0, blockedQty: 0, unit: 'KG' },
];

// ─── Outbound deliveries (dispatch records) ───────────────────────────────────
const deliveries = [
  { deliveryNumber: 'OBD-9001', materialNumber: 'MAT-1001', batchNumber: 'LOT-1001-A', quantity: 1000, unit: 'KG', status: DELIVERY_STATUS.APPROVED },
  { deliveryNumber: 'OBD-9002', materialNumber: 'MAT-1002', batchNumber: 'LOT-1002-A', quantity: 200, unit: 'KG', status: DELIVERY_STATUS.REJECTED },
  { deliveryNumber: 'OBD-9003', materialNumber: 'MAT-1001', batchNumber: 'LOT-1001-A', quantity: 500, unit: 'KG', status: DELIVERY_STATUS.COMPLETED },
];

module.exports = {
  MATERIAL_STATUS,
  BATCH_STATUS,
  DELIVERY_STATUS,
  PLANT,
  materials,
  batches,
  inventory,
  deliveries,
};
