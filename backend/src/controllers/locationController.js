/**
 * Location Controller — HTTP layer for zones and loading docks.
 */

'use strict';

const zoneService = require('../services/zoneService');
const loadingDockService = require('../services/loadingDockService');
const { sendSuccess } = require('../utils/responseHelper');

// ─── Zones ────────────────────────────────────────────────────────────────────

const getAllZones = async (req, res) => {
  sendSuccess(res, 200, 'Zones retrieved successfully.', await zoneService.getAllZones());
};

const getZoneById = async (req, res) => {
  sendSuccess(res, 200, 'Zone retrieved successfully.', await zoneService.getZoneById(req.params.id));
};

const createZone = async (req, res) => {
  sendSuccess(res, 201, 'Zone created successfully.', await zoneService.createZone(req.body));
};

const updateZone = async (req, res) => {
  sendSuccess(res, 200, 'Zone updated successfully.', await zoneService.updateZone(req.params.id, req.body));
};

const deleteZone = async (req, res) => {
  await zoneService.deleteZone(req.params.id);
  sendSuccess(res, 200, 'Zone deleted successfully.');
};

// ─── Loading docks ──────────────────────────────────────────────────────────

const getAllDocks = async (req, res) => {
  sendSuccess(res, 200, 'Loading docks retrieved successfully.', await loadingDockService.getAllDocks());
};

const getDockById = async (req, res) => {
  sendSuccess(res, 200, 'Loading dock retrieved successfully.', await loadingDockService.getDockById(req.params.id));
};

const createDock = async (req, res) => {
  sendSuccess(res, 201, 'Loading dock created successfully.', await loadingDockService.createDock(req.body));
};

const updateDock = async (req, res) => {
  sendSuccess(res, 200, 'Loading dock updated successfully.', await loadingDockService.updateDock(req.params.id, req.body));
};

const deleteDock = async (req, res) => {
  await loadingDockService.deleteDock(req.params.id);
  sendSuccess(res, 200, 'Loading dock deleted successfully.');
};

module.exports = {
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  getAllDocks,
  getDockById,
  createDock,
  updateDock,
  deleteDock,
};
