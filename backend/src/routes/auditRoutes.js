/**
 * Audit Routes — mounted at /api/audit-logs  (ADMIN / MANAGER)
 *
 *   GET /api/audit-logs   Read the audit trail (?module= &action= &limit=)
 */

'use strict';

const { Router } = require('express');
const auditController = require('../controllers/auditController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

router.get('/', authenticate, authorize(GROUPS.AUDIT_VIEW), auditController.getLogs);

module.exports = router;
