/**
 * Truck Routes — mounted at /api/trucks  (authenticated)
 *
 *   GET  /api/trucks/dashboard              Operations dashboard        [ANY]
 *   GET  /api/trucks/visits                 Visit list (?status,risk)   [ANY]
 *   GET  /api/trucks/visits/:id/journey     Full journey               [ANY]
 *   GET  /api/trucks                         Truck master list          [ANY]
 *   POST /api/trucks                         Create truck               [ADMIN, SUPERVISOR]
 *   GET  /api/trucks/:id                      Single truck              [ANY]
 *   PUT  /api/trucks/:id                      Update truck              [ADMIN, SUPERVISOR]
 */

'use strict';

const { Router } = require('express');
const truckController = require('../controllers/truckController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');
const {
  validateCreateTruck, validateUpdateTruck, validateTruckId, validateVisitId, validateVisitQuery,
} = require('../validators/truckValidators');
const handleValidationErrors = require('../middleware/validate');

const router = Router();
router.use(authenticate);

// Literal/derived paths before the '/:id' param route.
router.get('/dashboard', truckController.getDashboard);
router.get('/visits', validateVisitQuery, handleValidationErrors, truckController.listVisits);
router.get('/visits/:id/journey', validateVisitId, handleValidationErrors, truckController.getJourney);

router.get('/', truckController.listTrucks);
router.post('/', authorize(GROUPS.TRUCK_MANAGE), validateCreateTruck, handleValidationErrors, truckController.createTruck);
router.get('/:id', validateTruckId, handleValidationErrors, truckController.getTruck);
router.put('/:id', authorize(GROUPS.TRUCK_MANAGE), validateUpdateTruck, handleValidationErrors, truckController.updateTruck);

module.exports = router;
