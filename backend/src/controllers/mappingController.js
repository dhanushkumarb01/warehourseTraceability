/**
 * Mapping Controller
 *
 * HTTP layer for the Material-to-Bay Mapping module. Extracts request data,
 * delegates to mappingService, and shapes the response. No business logic and
 * no Prisma access here.
 *
 * Express 5 auto-propagates async rejections to the global error handler, so
 * no try/catch boilerplate is required.
 */

'use strict';

const mappingService = require('../services/mappingService');
const { sendSuccess } = require('../utils/responseHelper');

// ─── Writes ───────────────────────────────────────────────────────────────────

/** POST /api/mappings */
const createMapping = async (req, res) => {
  // Attribution always comes from the authenticated user, never the request body.
  const mapping = await mappingService.createMapping({ ...req.body, mappedBy: req.user.id });
  sendSuccess(res, 201, 'Material mapped to bay successfully.', mapping);
};

/** POST /api/mappings/move */
const moveMaterial = async (req, res) => {
  const mapping = await mappingService.moveMaterial({ ...req.body, mappedBy: req.user.id });
  sendSuccess(res, 200, 'Material moved successfully.', mapping);
};

/** POST /api/mappings/remove */
const removeMaterial = async (req, res) => {
  const mapping = await mappingService.removeMaterialFromBay({ ...req.body, mappedBy: req.user.id });
  sendSuccess(res, 200, 'Material removed from bay successfully.', mapping);
};

// ─── Dual-QR scan ───────────────────────────────────────────────────────────

/** POST /api/mappings/scan/resolve */
const resolveScan = async (req, res) => {
  const result = await mappingService.resolveScan(req.body);
  sendSuccess(res, 200, 'Scan resolved successfully.', result);
};

/** POST /api/mappings/scan */
const commitScan = async (req, res) => {
  const result = await mappingService.commitScan({ ...req.body, mappedBy: req.user.id });
  const message = result.action === 'MOVED'
    ? 'Material relocated via scan successfully.'
    : 'Material mapped via scan successfully.';
  sendSuccess(res, 200, message, result);
};

// ─── Reads ────────────────────────────────────────────────────────────────────

/** GET /api/mappings/inventory */
const getAllActiveInventory = async (req, res) => {
  const inventory = await mappingService.getAllActiveInventory();
  sendSuccess(res, 200, 'Active inventory retrieved successfully.', inventory);
};

/** GET /api/mappings/inventory/summary */
const getInventorySummary = async (req, res) => {
  const summary = await mappingService.getInventorySummary();
  sendSuccess(res, 200, 'Inventory summary retrieved successfully.', summary);
};

/** GET /api/mappings/bay/:bayId/inventory */
const getBayInventory = async (req, res) => {
  const inventory = await mappingService.getBayInventory(req.params.bayId);
  sendSuccess(res, 200, 'Bay inventory retrieved successfully.', inventory);
};

/** GET /api/mappings/lot/:lotId/location */
const getMaterialLocation = async (req, res) => {
  const location = await mappingService.getMaterialLocation(req.params.lotId);
  sendSuccess(res, 200, 'Material location retrieved successfully.', location);
};

/** GET /api/mappings/lot/:lotId/history */
const getMappingHistory = async (req, res) => {
  const history = await mappingService.getMappingHistory(req.params.lotId);
  sendSuccess(res, 200, 'Mapping history retrieved successfully.', history);
};

/** GET /api/mappings/lot/:lotId/active */
const getActiveMapping = async (req, res) => {
  const mapping = await mappingService.getActiveMapping(req.params.lotId);
  sendSuccess(res, 200, 'Active mapping retrieved successfully.', mapping);
};

module.exports = {
  createMapping,
  moveMaterial,
  removeMaterial,
  resolveScan,
  commitScan,
  getAllActiveInventory,
  getInventorySummary,
  getBayInventory,
  getMaterialLocation,
  getMappingHistory,
  getActiveMapping,
};
