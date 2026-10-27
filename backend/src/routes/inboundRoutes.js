/**
 * Inbound Routes — /api/inbound
 *
 *   GET   /pending   Rail consignments in FOIS / SAP not yet received  (inbound view)
 *   POST  /import    Receive one consignment as a rail lot              (supervisor)
 */

'use strict';

const { Router } = require('express');
const inboundController = require('../controllers/inboundController');
const { validateListPending, validateImport } = require('../validators/inboundValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

router.use(authenticate);

router.get('/pending', authorize(GROUPS.INBOUND_VIEW), validateListPending, handleValidationErrors, inboundController.listPending);
router.post('/import', authorize(GROUPS.ALLOCATION_MANAGE), validateImport, handleValidationErrors, inboundController.importConsignment);

module.exports = router;
