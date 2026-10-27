/**
 * Mock SAP Service — the simulated ERP "system of record".
 *
 * Encapsulates all behaviour of the fake SAP backend. Both the mock connector
 * (in-process) and the public /sap HTTP routes call THIS module, so there is a
 * single source of simulated-ERP truth — no duplicated logic.
 *
 * Realism features:
 *   - SAP-shaped payloads (material master, batch, stock, outbound delivery).
 *   - Deterministic synthetic fallback for unseeded codes so the warehouse is
 *     never blocked simply because the mock hasn't been pre-loaded with a
 *     user-created material.
 *   - Simulated latency and a toggleable outage (SAP_SIMULATE_DOWN) to exercise
 *     retry/fail-safe paths.
 */

'use strict';

const env = require('../../config/env');
const ds = require('./sapDataset');
const inboundDs = require('./inboundDataset');

// In-memory, mutable working copies (createDelivery appends here).
const state = {
  materials: ds.materials.map((m) => ({ ...m })),
  batches: ds.batches.map((b) => ({ ...b })),
  inventory: ds.inventory.map((i) => ({ ...i })),
  deliveries: ds.deliveries.map((d) => ({ ...d })),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Simulate transport behaviour: small latency, optional outage. */
const transport = async () => {
  await sleep(15);
  if (env.SAP_SIMULATE_DOWN) {
    const err = new Error('SAP gateway unavailable (simulated outage).');
    err.sapUnavailable = true;
    throw err;
  }
};

// ─── Synthetic fallback (deterministic from the code) ─────────────────────────
const syntheticStatus = (code) => {
  if (/BLOCK|BLK/i.test(code)) return ds.MATERIAL_STATUS.BLOCKED;
  if (/HOLD|QA/i.test(code)) return ds.MATERIAL_STATUS.QUALITY_HOLD;
  return ds.MATERIAL_STATUS.RELEASED;
};

const syntheticMaterial = (code) => ({
  materialNumber: code,
  description: `Auto-resolved material ${code}`,
  materialType: 'RAW',
  status: syntheticStatus(code),
  baseUnit: 'KG',
  plant: ds.PLANT,
  synthetic: true,
});

const syntheticInventory = (code) => {
  const released = syntheticStatus(code) === ds.MATERIAL_STATUS.RELEASED;
  return {
    materialNumber: code,
    plant: ds.PLANT,
    unrestrictedQty: released ? 1_000_000 : 0,
    blockedQty: released ? 0 : 1_000_000,
    unit: 'KG',
    synthetic: true,
  };
};

// ─── Reads ────────────────────────────────────────────────────────────────────
const getMaterial = async (materialNumber) => {
  await transport();
  return state.materials.find((m) => m.materialNumber === materialNumber) || syntheticMaterial(materialNumber);
};

const listMaterials = async () => { await transport(); return state.materials.map((m) => ({ ...m })); };

const getBatch = async (batchNumber, materialNumber = null) => {
  await transport();
  const found = state.batches.find((b) => b.batchNumber === batchNumber);
  if (found) return { ...found };
  // Synthetic batch inherits the material's status.
  const matCode = materialNumber || batchNumber;
  const matStatus = syntheticStatus(matCode);
  return {
    batchNumber,
    materialNumber: materialNumber || 'UNKNOWN',
    quantity: matStatus === ds.MATERIAL_STATUS.RELEASED ? 1_000_000 : 0,
    unit: 'KG',
    status: matStatus === ds.MATERIAL_STATUS.RELEASED ? ds.BATCH_STATUS.UNRESTRICTED : ds.BATCH_STATUS.BLOCKED,
    synthetic: true,
  };
};

const listBatches = async () => { await transport(); return state.batches.map((b) => ({ ...b })); };

const getInventory = async (materialNumber) => {
  await transport();
  return state.inventory.find((i) => i.materialNumber === materialNumber) || syntheticInventory(materialNumber);
};

const listInventory = async () => { await transport(); return state.inventory.map((i) => ({ ...i })); };

const getDelivery = async (deliveryNumber) => {
  await transport();
  const d = state.deliveries.find((x) => x.deliveryNumber === deliveryNumber);
  return d ? { ...d } : null;
};

const listDeliveries = async () => { await transport(); return state.deliveries.map((d) => ({ ...d })); };

const createDelivery = async (payload) => {
  await transport();
  const deliveryNumber = payload.deliveryNumber || `OBD-${Date.now().toString().slice(-6)}`;
  const record = {
    deliveryNumber,
    materialNumber: payload.materialNumber,
    batchNumber: payload.batchNumber || null,
    quantity: payload.quantity,
    unit: payload.unit || 'KG',
    status: ds.DELIVERY_STATUS.CREATED,
  };
  state.deliveries.push(record);
  return { ...record };
};

// ─── Validation endpoints ─────────────────────────────────────────────────────
const validateMaterial = async ({ materialNumber }) => {
  const mat = await getMaterial(materialNumber);
  const reasons = [];
  if (mat.status === ds.MATERIAL_STATUS.BLOCKED) reasons.push(`Material ${materialNumber} is BLOCKED in SAP.`);
  if (mat.status === ds.MATERIAL_STATUS.QUALITY_HOLD) reasons.push(`Material ${materialNumber} is on QUALITY HOLD in SAP.`);
  return { valid: reasons.length === 0, status: mat.status, material: mat, reasons };
};

const validateInventory = async ({ materialNumber, quantity }) => {
  const inv = await getInventory(materialNumber);
  const reasons = [];
  if (inv.unrestrictedQty < quantity) {
    reasons.push(`SAP unrestricted stock (${inv.unrestrictedQty} ${inv.unit}) is below requested ${quantity}.`);
  }
  return { valid: reasons.length === 0, available: inv.unrestrictedQty, inventory: inv, reasons };
};

const validateDispatch = async ({ deliveryNumber = null, materialNumber, batchNumber, quantity }) => {
  const reasons = [];

  const matRes = await validateMaterial({ materialNumber });
  if (!matRes.valid) reasons.push(...matRes.reasons);

  if (batchNumber) {
    const batch = await getBatch(batchNumber, materialNumber);
    if (batch.status === ds.BATCH_STATUS.BLOCKED) reasons.push(`Batch ${batchNumber} is BLOCKED in SAP.`);
    if (batch.status === ds.BATCH_STATUS.QUALITY_INSPECTION) reasons.push(`Batch ${batchNumber} is under QUALITY INSPECTION in SAP.`);
  }

  if (quantity) {
    const invRes = await validateInventory({ materialNumber, quantity });
    if (!invRes.valid) reasons.push(...invRes.reasons);
  }

  let deliveryStatus = null;
  if (deliveryNumber) {
    const delivery = await getDelivery(deliveryNumber);
    if (delivery) {
      deliveryStatus = delivery.status;
      if (delivery.status === ds.DELIVERY_STATUS.REJECTED) reasons.push(`SAP delivery ${deliveryNumber} is REJECTED.`);
      if (delivery.status === ds.DELIVERY_STATUS.COMPLETED) reasons.push(`SAP delivery ${deliveryNumber} is already COMPLETED.`);
    }
  }

  return {
    valid: reasons.length === 0,
    materialStatus: matRes.status,
    deliveryStatus,
    reasons,
  };
};

// ─── Inbound consignments (MOCK FOIS / SAP rail records) ─────────────────────
const listInboundConsignments = async ({ source } = {}) => {
  await transport();
  return inboundDs.consignments
    .filter((c) => !source || c.source === source)
    .map((c) => ({ ...c, meta: c.meta ? { ...c.meta } : null }));
};

const getInboundConsignment = async (source, externalRef) => {
  await transport();
  const found = inboundDs.consignments.find((c) => c.source === source && c.externalRef === externalRef);
  return found ? { ...found, meta: found.meta ? { ...found.meta } : null } : null;
};

const ping = async () => { await transport(); return { connected: true, system: 'MOCK-SAP-S4', plant: ds.PLANT, time: new Date().toISOString() }; };

module.exports = {
  ping,
  getMaterial, listMaterials,
  getBatch, listBatches,
  getInventory, listInventory,
  getDelivery, listDeliveries, createDelivery,
  validateMaterial, validateInventory, validateDispatch,
  listInboundConsignments, getInboundConsignment,
};
