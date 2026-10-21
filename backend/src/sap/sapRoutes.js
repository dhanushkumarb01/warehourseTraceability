/**
 * SAP Integration Routes — mounted at /api/sap  (authenticated)
 *
 *   GET  /api/sap/status                       Connection status      [ADMIN, MANAGER]
 *   GET  /api/sap/dashboard                    Dashboard summary       [ADMIN, MANAGER]
 *   GET  /api/sap/sync-logs                    Sync logs               [ADMIN, MANAGER]
 *   GET  /api/sap/validation-logs              Validation logs         [ADMIN, MANAGER]
 *   POST /api/sap/sync/material/:materialId    Manual material sync    [ADMIN]
 *   POST /api/sap/sync/inventory/:materialId   Manual inventory sync   [ADMIN]
 *   POST /api/sap/sync/dispatch/:dispatchId    Manual dispatch sync    [ADMIN]
 *   POST /api/sap/sync-logs/:id/retry          Retry a failed sync     [ADMIN]
 *   GET  /api/sap/validate/dispatch/:id        Validation preview      [ADMIN, SUPERVISOR]
 *   GET  /api/sap/validate/gate/:id            Validation preview      [ADMIN, SUPERVISOR, OPERATOR]
 */

'use strict';

const { Router } = require('express');
const c = require('./sapController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

router.use(authenticate);

// Reads / dashboard — ADMIN + MANAGER
router.get('/status', authorize(GROUPS.AUDIT_VIEW), c.getStatus);
router.get('/dashboard', authorize(GROUPS.AUDIT_VIEW), c.getDashboard);
router.get('/sync-logs', authorize(GROUPS.AUDIT_VIEW), c.getSyncLogs);
router.get('/validation-logs', authorize(GROUPS.AUDIT_VIEW), c.getValidationLogs);

// Manual sync + retry — ADMIN only
router.post('/sync/material/:materialId', authorize(GROUPS.USER_ADMIN), c.syncMaterial);
router.post('/sync/inventory/:materialId', authorize(GROUPS.USER_ADMIN), c.syncInventory);
router.post('/sync/dispatch/:dispatchId', authorize(GROUPS.USER_ADMIN), c.syncDispatch);
router.post('/sync-logs/:id/retry', authorize(GROUPS.USER_ADMIN), c.retrySync);

// Validation previews — aligned with who performs the action
router.get('/validate/dispatch/:id', authorize(GROUPS.DISPATCH_APPROVE), c.previewDispatchValidation);
router.get('/validate/gate/:id', authorize(GROUPS.GATE), c.previewGateValidation);

module.exports = router;
