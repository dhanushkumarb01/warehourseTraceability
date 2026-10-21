/**
 * Truck Validators (Phase 10)
 */

'use strict';

const { body, param, query } = require('express-validator');

const TRUCK_STATUSES = ['ACTIVE', 'INACTIVE'];
const VISIT_STATUSES = ['ACTIVE', 'PARKED', 'EXITED'];
const RISK = ['NORMAL', 'DELAYED', 'FLAGGED'];

const validateCreateTruck = [
  body('truckNumber').trim().notEmpty().withMessage('Truck number is required.').isLength({ max: 32 }),
  body('driverName').trim().notEmpty().withMessage('Driver name is required.').isLength({ max: 100 }),
  body('driverContact').optional({ nullable: true }).isString().isLength({ max: 32 }),
  body('transporter').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('vehicleType').optional({ nullable: true }).isString().isLength({ max: 60 }),
  body('rfidTag').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('status').optional().isIn(TRUCK_STATUSES).withMessage(`Status must be one of: ${TRUCK_STATUSES.join(', ')}.`),
];

const validateUpdateTruck = [
  param('id').isUUID().withMessage('Truck ID must be a valid UUID.'),
  body('truckNumber').optional().trim().notEmpty().isLength({ max: 32 }),
  body('driverName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('driverContact').optional({ nullable: true }).isString().isLength({ max: 32 }),
  body('transporter').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('vehicleType').optional({ nullable: true }).isString().isLength({ max: 60 }),
  body('rfidTag').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('status').optional().isIn(TRUCK_STATUSES),
];

const validateTruckId = [param('id').isUUID().withMessage('Truck ID must be a valid UUID.')];
const validateVisitId = [param('id').isUUID().withMessage('Visit ID must be a valid UUID.')];

const validateVisitQuery = [
  query('status').optional().isIn(VISIT_STATUSES).withMessage(`status must be one of: ${VISIT_STATUSES.join(', ')}.`),
  query('risk').optional().isIn(RISK).withMessage(`risk must be one of: ${RISK.join(', ')}.`),
  query('truckId').optional().isUUID(),
];

module.exports = { validateCreateTruck, validateUpdateTruck, validateTruckId, validateVisitId, validateVisitQuery };
