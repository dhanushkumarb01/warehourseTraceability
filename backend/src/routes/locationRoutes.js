/**
 * Location Routes — warehouse zones and loading docks.
 *
 * Mounted twice in app.js:
 *   /api/zones           zone registry
 *   /api/loading-docks   loading-dock registry
 *
 * Reads are open to any authenticated role; writes use the same group as bay
 * master data (ADMIN, SUPERVISOR).
 */

'use strict';

const { Router } = require('express');
const locationController = require('../controllers/locationController');
const {
  validateCreateZone,
  validateUpdateZone,
  validateZoneId,
  validateCreateDock,
  validateUpdateDock,
  validateDockId,
} = require('../validators/locationValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const write = authorize(GROUPS.BAY_WRITE);

const zoneRouter = Router();
zoneRouter.use(authenticate);
zoneRouter.get('/', locationController.getAllZones);
zoneRouter.get('/:id', validateZoneId, handleValidationErrors, locationController.getZoneById);
zoneRouter.post('/', write, validateCreateZone, handleValidationErrors, locationController.createZone);
zoneRouter.put('/:id', write, validateUpdateZone, handleValidationErrors, locationController.updateZone);
zoneRouter.delete('/:id', write, validateZoneId, handleValidationErrors, locationController.deleteZone);

const dockRouter = Router();
dockRouter.use(authenticate);
dockRouter.get('/', locationController.getAllDocks);
dockRouter.get('/:id', validateDockId, handleValidationErrors, locationController.getDockById);
dockRouter.post('/', write, validateCreateDock, handleValidationErrors, locationController.createDock);
dockRouter.put('/:id', write, validateUpdateDock, handleValidationErrors, locationController.updateDock);
dockRouter.delete('/:id', write, validateDockId, handleValidationErrors, locationController.deleteDock);

module.exports = { zoneRouter, dockRouter };
