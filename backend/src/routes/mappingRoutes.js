/**
 * Mapping Routes
 *
 * Registers all Material-to-Bay Mapping endpoints under /api/mappings.
 * Route files contain only validation chains, the validation-result middleware
 * and the controller handler — no business logic.
 *
 * Endpoint map:
 *   POST   /api/mappings                       Create (place) a mapping
 *   POST   /api/mappings/move                  Move a lot to another bay
 *   POST   /api/mappings/remove                Remove a lot from its bay
 *   POST   /api/mappings/scan/resolve          Dual-QR: identify entities (no commit)
 *   POST   /api/mappings/scan                  Dual-QR: place/relocate via scan
 *   GET    /api/mappings/inventory             All active inventory
 *   GET    /api/mappings/inventory/summary     Per-bay active inventory summary
 *   GET    /api/mappings/bay/:bayId/inventory  Inventory for one bay
 *   GET    /api/mappings/lot/:lotId/location   Current location of a lot
 *   GET    /api/mappings/lot/:lotId/history    Full movement history of a lot
 *   GET    /api/mappings/lot/:lotId/active     Current active mapping of a lot
 */

'use strict';

const { Router } = require('express');
const mappingController = require('../controllers/mappingController');
const {
  validateCreateMapping,
  validateMoveMaterial,
  validateRemoveMaterial,
  validateScanCommit,
  validateScanResolve,
  validateBayIdParam,
  validateLotIdParam,
} = require('../validators/mappingValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

// All mapping endpoints require authentication. Writes require the operations
// group (ADMIN, SUPERVISOR, OPERATOR); reads are open to any authenticated role.
router.use(authenticate);

// ── Writes ──────────────────────────────────────────────────────────────────
router.post('/', authorize(GROUPS.OPERATIONS), validateCreateMapping, handleValidationErrors, mappingController.createMapping);
router.post('/move', authorize(GROUPS.OPERATIONS), validateMoveMaterial, handleValidationErrors, mappingController.moveMaterial);
router.post('/remove', authorize(GROUPS.OPERATIONS), validateRemoveMaterial, handleValidationErrors, mappingController.removeMaterial);

// ── Dual-QR scan ─────────────────────────────────────────────────────────────
router.post('/scan/resolve', authorize(GROUPS.OPERATIONS), validateScanResolve, handleValidationErrors, mappingController.resolveScan);
router.post('/scan', authorize(GROUPS.OPERATIONS), validateScanCommit, handleValidationErrors, mappingController.commitScan);

// ── Reads ───────────────────────────────────────────────────────────────────
// NOTE: '/inventory/summary' is declared before '/inventory' is irrelevant here
// (distinct paths), but '/bay/:bayId/...' and '/lot/:lotId/...' are namespaced
// to avoid any collision with the literal '/inventory' route.
router.get('/inventory', mappingController.getAllActiveInventory);
router.get('/inventory/summary', mappingController.getInventorySummary);
router.get('/bay/:bayId/inventory', validateBayIdParam, handleValidationErrors, mappingController.getBayInventory);
router.get('/lot/:lotId/location', validateLotIdParam, handleValidationErrors, mappingController.getMaterialLocation);
router.get('/lot/:lotId/history', validateLotIdParam, handleValidationErrors, mappingController.getMappingHistory);
router.get('/lot/:lotId/active', validateLotIdParam, handleValidationErrors, mappingController.getActiveMapping);

module.exports = router;
