/**
 * Dispatch Validators
 *
 * express-validator chains for the Dispatch endpoints.
 */

'use strict';

const { body, param, query } = require('express-validator');

const DISPATCH_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

const optionalRemarks = body('remarks')
  .optional({ nullable: true })
  .isString().withMessage('Remarks must be a string.')
  .isLength({ max: 500 }).withMessage('Remarks must not exceed 500 characters.');

const optionalUser = (field) =>
  body(field).optional({ nullable: true }).isUUID().withMessage(`${field} must be a valid user UUID.`);

const validateCreateDispatch = [
  body('lotId').isUUID().withMessage('lotId must be a valid UUID.'),
  body('requestedQuantity')
    .isFloat({ gt: 0 }).withMessage('requestedQuantity must be greater than 0.'),
  body('vehicleNumber')
    .optional({ nullable: true })
    .isString().withMessage('vehicleNumber must be a string.')
    .isLength({ max: 50 }).withMessage('vehicleNumber must not exceed 50 characters.'),
  optionalRemarks,
  optionalUser('requestedBy'),
];

const validateApprove = [
  param('id').isUUID().withMessage('Dispatch ID must be a valid UUID.'),
  body('approvedQuantity')
    .optional({ nullable: true })
    .isFloat({ gt: 0 }).withMessage('approvedQuantity must be greater than 0.'),
  optionalRemarks,
  optionalUser('approvedBy'),
];

const validateReject = [
  param('id').isUUID().withMessage('Dispatch ID must be a valid UUID.'),
  optionalRemarks,
  optionalUser('approvedBy'),
];

const validateCancel = [
  param('id').isUUID().withMessage('Dispatch ID must be a valid UUID.'),
  optionalRemarks,
  optionalUser('requestedBy'),
];

const validateDispatchId = [
  param('id').isUUID().withMessage('Dispatch ID must be a valid UUID.'),
];

const validateLotIdParam = [
  param('lotId').isUUID().withMessage('Lot ID must be a valid UUID.'),
];

const validateListQuery = [
  query('status')
    .optional()
    .isIn(DISPATCH_STATUSES)
    .withMessage(`status must be one of: ${DISPATCH_STATUSES.join(', ')}.`),
];

module.exports = {
  validateCreateDispatch,
  validateApprove,
  validateReject,
  validateCancel,
  validateDispatchId,
  validateLotIdParam,
  validateListQuery,
};
