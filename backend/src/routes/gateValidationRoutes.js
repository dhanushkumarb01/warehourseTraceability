/**
 * Gate Validation Routes — mounted at /api/gate-validations
 *
 *   POST  /api/gate-validations/scan/resolve   Identify lot + eligibility (no commit)
 *   POST  /api/gate-validations/exit           Validate scan and authorise/deny exit
 *   GET   /api/gate-validations                 All records (optional ?status=)
 *   GET   /api/gate-validations/pending         Approved dispatches awaiting exit
 *   GET   /api/gate-validations/summary         Dashboard counts + inventory impact
 *   GET   /api/gate-validations/:id             Single record
 */

'use strict';

const { Router } = require('express');
const gateController = require('../controllers/gateValidationController');
const {
  validateScan,
  validateExit,
  validateGateId,
  validateListQuery,
} = require('../validators/gateValidationValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

// Authenticated for all. Scan/exit require the gate group (ADMIN, SUPERVISOR,
// OPERATOR); reads are open to any authenticated role.
router.use(authenticate);

router.post('/scan/resolve', authorize(GROUPS.GATE), validateScan, handleValidationErrors, gateController.resolveScan);
router.post('/exit', authorize(GROUPS.GATE), validateExit, handleValidationErrors, gateController.processExit);

router.get('/pending', gateController.getPending);
router.get('/summary', gateController.getSummary);
router.get('/', validateListQuery, handleValidationErrors, gateController.getAll);
router.get('/:id', validateGateId, handleValidationErrors, gateController.getById);

module.exports = router;
