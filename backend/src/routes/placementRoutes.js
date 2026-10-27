/**
 * Placement Routes — /api/placement
 *
 *   GET    /config                              Recommendation method + config
 *   GET    /lots                                Lots with arrival/allocation stage
 *   GET    /lots/:lotId/recommendations         Ranked bays for one lot
 *   PUT    /lots/:lotId/arrival-mode            Record RAIL / ROAD   (operations)
 *   POST   /allocations                         Allot a bay          (supervisor)
 *   POST   /allocations/:id/confirm             Confirm placement    (operations)
 *   POST   /allocations/:id/cancel              Cancel allotment     (supervisor)
 */

'use strict';

const { Router } = require('express');
const placementController = require('../controllers/placementController');
const {
  validateListLots,
  validateRecommendations,
  validateArrivalMode,
  validateAllocate,
  validateConfirmPlacement,
  validateCancelAllocation,
} = require('../validators/placementValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

router.use(authenticate);

// ── Reads (any authenticated role) ──────────────────────────────────────────
router.get('/config', placementController.getConfig);
router.get('/lots', validateListLots, handleValidationErrors, placementController.listLots);
router.get('/lots/:lotId/recommendations', validateRecommendations, handleValidationErrors, placementController.getRecommendations);

// ── Writes ──────────────────────────────────────────────────────────────────
router.put('/lots/:lotId/arrival-mode', authorize(GROUPS.OPERATIONS), validateArrivalMode, handleValidationErrors, placementController.recordArrivalMode);
router.post('/allocations', authorize(GROUPS.ALLOCATION_MANAGE), validateAllocate, handleValidationErrors, placementController.allocateBay);
router.post('/allocations/:id/confirm', authorize(GROUPS.OPERATIONS), validateConfirmPlacement, handleValidationErrors, placementController.confirmPlacement);
router.post('/allocations/:id/cancel', authorize(GROUPS.ALLOCATION_MANAGE), validateCancelAllocation, handleValidationErrors, placementController.cancelAllocation);

module.exports = router;
