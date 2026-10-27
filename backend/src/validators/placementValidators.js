/**
 * Placement Validators — arrival mode, recommendations and bay allocation.
 */

'use strict';

const { body, param, query } = require('express-validator');
const { DEMAND_LEVELS } = require('../config/placement');

const STAGES = ['AWAITING_ARRIVAL_MODE', 'PENDING_ALLOCATION', 'ALLOCATED', 'PLACED'];

const optionalText = (field, label, max = 500) =>
  body(field)
    .optional({ values: 'null' })
    .isString().withMessage(`${label} must be text.`)
    .trim()
    .isLength({ max }).withMessage(`${label} must not exceed ${max} characters.`);

const lotIdParam = param('lotId').isUUID().withMessage('Lot ID must be a valid UUID.');
const allocationIdParam = param('id').isUUID().withMessage('Allocation ID must be a valid UUID.');

const validateListLots = [
  query('arrivalMode')
    .optional({ values: 'falsy' })
    .isIn(['RAIL', 'ROAD', 'UNRECORDED']).withMessage('arrivalMode must be RAIL, ROAD or UNRECORDED.'),
  query('stage')
    .optional({ values: 'falsy' })
    .isIn(STAGES).withMessage(`stage must be one of: ${STAGES.join(', ')}.`),
  query('search').optional().isString().isLength({ max: 100 }),
];

const validateRecommendations = [
  lotIdParam,
  query('demandLevel')
    .optional({ values: 'falsy' })
    .isIn(DEMAND_LEVELS).withMessage(`demandLevel must be one of: ${DEMAND_LEVELS.join(', ')}.`),
];

const validateArrivalMode = [
  lotIdParam,
  body('arrivalMode').isIn(['RAIL', 'ROAD']).withMessage('Choose how the lot arrived: RAIL or ROAD.'),
];

const validateAllocate = [
  body('lotId').isUUID().withMessage('lotId must be a valid UUID.'),
  body('bayId').isUUID().withMessage('Select a bay to allot.'),
  body('demandLevel')
    .optional({ values: 'falsy' })
    .isIn(DEMAND_LEVELS).withMessage(`demandLevel must be one of: ${DEMAND_LEVELS.join(', ')}.`),
  optionalText('remarks', 'Remarks'),
];

const validateConfirmPlacement = [allocationIdParam, optionalText('remarks', 'Remarks')];
const validateCancelAllocation = [allocationIdParam, optionalText('reason', 'Reason')];

module.exports = {
  validateListLots,
  validateRecommendations,
  validateArrivalMode,
  validateAllocate,
  validateConfirmPlacement,
  validateCancelAllocation,
};
