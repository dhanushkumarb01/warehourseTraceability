/**
 * Mock SAP Controller
 *
 * HTTP surface of the simulated ERP, mounted at /sap. Returns RAW SAP-shaped
 * payloads (not the warehouse API envelope) so it behaves like an external
 * system and the httpConnector can target it interchangeably with a real SAP.
 *
 * A simulated outage (SAP_SIMULATE_DOWN) surfaces here as HTTP 503 — exactly
 * the transient failure the retry handler is built to absorb.
 */

'use strict';

const sap = require('./sapMockService');

// Wrap each handler so a simulated outage becomes a 503 (Service Unavailable).
const guard = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.sapUnavailable) {
      return res.status(503).json({ error: 'SAP_UNAVAILABLE', message: err.message });
    }
    return res.status(500).json({ error: 'SAP_ERROR', message: err.message });
  }
};

const health = guard(async (req, res) => res.json(await sap.ping()));

const listMaterials = guard(async (req, res) => res.json(await sap.listMaterials()));
const getMaterial = guard(async (req, res) => res.json(await sap.getMaterial(req.params.id)));

const listLots = guard(async (req, res) => res.json(await sap.listLots()));
const getLot = guard(async (req, res) => res.json(await sap.getLot(req.params.id, req.query.materialNumber)));

const listInventory = guard(async (req, res) => res.json(await sap.listInventory()));
const getInventory = guard(async (req, res) => res.json(await sap.getInventory(req.params.materialId)));

const listDispatches = guard(async (req, res) => res.json(await sap.listDeliveries()));
const getDispatch = guard(async (req, res) => {
  const d = await sap.getDelivery(req.params.id);
  if (!d) return res.status(404).json({ error: 'NOT_FOUND', message: `Delivery ${req.params.id} not found in SAP.` });
  return res.json(d);
});
const createDispatch = guard(async (req, res) => res.status(201).json(await sap.createDelivery(req.body)));

const validateMaterial = guard(async (req, res) => res.json(await sap.validateMaterial(req.body)));
const validateInventory = guard(async (req, res) => res.json(await sap.validateInventory(req.body)));
const validateDispatch = guard(async (req, res) => res.json(await sap.validateDispatch(req.body)));

module.exports = {
  health,
  listMaterials, getMaterial,
  listLots, getLot,
  listInventory, getInventory,
  listDispatches, getDispatch, createDispatch,
  validateMaterial, validateInventory, validateDispatch,
};
