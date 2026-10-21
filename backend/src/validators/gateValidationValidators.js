/**
 * Gate Validation Validators
 */

'use strict';

const { body, param, query } = require('express-validator');

const GATE_STATUSES = ['PENDING', 'VALIDATED', 'DENIED', 'EXITED'];

const qrPayloadRule = body('materialQr')
  .notEmpty().withMessage('materialQr is required.')
  .custom((value) => {
    if (typeof value === 'object') return true;
    if (typeof value === 'string' && value.trim() !== '') return true;
    throw new Error('materialQr must be a QR payload string or object.');
  });

const validateScan = [qrPayloadRule];

const validateExit = [
  qrPayloadRule,
  body('dispatchId').optional({ nullable: true }).isUUID().withMessage('dispatchId must be a valid UUID.'),
  body('validatedBy').optional({ nullable: true }).isUUID().withMessage('validatedBy must be a valid user UUID.'),
  body('remarks')
    .optional({ nullable: true })
    .isString().withMessage('Remarks must be a string.')
    .isLength({ max: 500 }).withMessage('Remarks must not exceed 500 characters.'),
];

const validateGateId = [
  param('id').isUUID().withMessage('Gate validation ID must be a valid UUID.'),
];

const validateListQuery = [
  query('status').optional().isIn(GATE_STATUSES)
    .withMessage(`status must be one of: ${GATE_STATUSES.join(', ')}.`),
];

module.exports = {
  validateScan,
  validateExit,
  validateGateId,
  validateListQuery,
};
