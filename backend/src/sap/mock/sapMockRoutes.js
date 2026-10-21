/**
 * Mock SAP Routes — mounted at /sap
 *
 * The simulated ERP's public REST surface. Intentionally NOT behind the
 * warehouse JWT auth: it stands in for an EXTERNAL system the warehouse calls
 * out to. In production this entire router is removed and SAP_BASE_URL points
 * at the client's real SAP gateway.
 *
 *   GET  /sap/health
 *   GET  /sap/materials            GET /sap/materials/:id
 *   GET  /sap/lots                 GET /sap/lots/:id
 *   GET  /sap/inventory            GET /sap/inventory/:materialId
 *   GET  /sap/dispatches           GET /sap/dispatches/:id     POST /sap/dispatches
 *   POST /sap/validate/material    POST /sap/validate/inventory  POST /sap/validate/dispatch
 */

'use strict';

const { Router } = require('express');
const c = require('./sapMockController');

const router = Router();

router.get('/health', c.health);

router.get('/materials', c.listMaterials);
router.get('/materials/:id', c.getMaterial);

router.get('/lots', c.listLots);
router.get('/lots/:id', c.getLot);

router.get('/inventory', c.listInventory);
router.get('/inventory/:materialId', c.getInventory);

router.get('/dispatches', c.listDispatches);
router.post('/dispatches', c.createDispatch);
router.get('/dispatches/:id', c.getDispatch);

router.post('/validate/material', c.validateMaterial);
router.post('/validate/inventory', c.validateInventory);
router.post('/validate/dispatch', c.validateDispatch);

module.exports = router;
