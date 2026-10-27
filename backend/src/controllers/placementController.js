/**
 * Placement Controller — HTTP layer for arrival mode, recommendations and bay
 * allocation. Attribution always comes from the authenticated user.
 */

'use strict';

const placementService = require('../services/placementService');
const { sendSuccess } = require('../utils/responseHelper');

/** GET /api/placement/config */
const getConfig = async (req, res) => {
  sendSuccess(res, 200, 'Placement configuration retrieved successfully.', placementService.getConfig());
};

/** GET /api/placement/lots */
const listLots = async (req, res) => {
  const { arrivalMode, stage, search } = req.query;
  const result = await placementService.listLots({ arrivalMode, stage, search });
  sendSuccess(res, 200, 'Lots retrieved successfully.', result);
};

/** GET /api/placement/lots/:lotId/recommendations */
const getRecommendations = async (req, res) => {
  const result = await placementService.getRecommendations(req.params.lotId, { demandLevel: req.query.demandLevel });
  sendSuccess(res, 200, 'Recommendations retrieved successfully.', result);
};

/** PUT /api/placement/lots/:lotId/arrival-mode */
const recordArrivalMode = async (req, res) => {
  const lot = await placementService.recordArrivalMode({
    lotId: req.params.lotId,
    arrivalMode: req.body.arrivalMode,
    userId: req.user.id,
  });
  sendSuccess(res, 200, 'Arrival mode recorded.', lot);
};

/** POST /api/placement/allocations */
const allocateBay = async (req, res) => {
  const { lotId, bayId, demandLevel, remarks } = req.body;
  const allocation = await placementService.allocateBay({ lotId, bayId, demandLevel, remarks, userId: req.user.id });
  sendSuccess(res, 201, `Bay ${allocation.bay.bayCode} allotted.`, allocation);
};

/** POST /api/placement/allocations/:id/confirm */
const confirmPlacement = async (req, res) => {
  const mapping = await placementService.confirmPlacement({
    allocationId: req.params.id,
    remarks: req.body.remarks,
    userId: req.user.id,
  });
  sendSuccess(res, 200, 'Placement confirmed.', mapping);
};

/** POST /api/placement/allocations/:id/cancel */
const cancelAllocation = async (req, res) => {
  const allocation = await placementService.cancelAllocation({
    allocationId: req.params.id,
    reason: req.body.reason,
    userId: req.user.id,
  });
  sendSuccess(res, 200, 'Allocation cancelled.', allocation);
};

module.exports = {
  getConfig,
  listLots,
  getRecommendations,
  recordArrivalMode,
  allocateBay,
  confirmPlacement,
  cancelAllocation,
};
