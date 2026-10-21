const { body, param } = require('express-validator');

const validateLotId = [
  param('id')
    .isUUID()
    .withMessage('Lot ID must be a valid UUID.'),
];

const validateCreateLot = [
  body('lotCode')
    .trim()
    .notEmpty()
    .withMessage('Lot code is required.')
    .isLength({ max: 50 })
    .withMessage('Lot code cannot exceed 50 characters.'),
  body('materialId')
    .isUUID()
    .withMessage('Valid Material ID is required.'),
  body('quantity')
    .isFloat({ gt: 0 })
    .withMessage('Quantity must be greater than 0.'),
  body('unit')
    .trim()
    .notEmpty()
    .withMessage('Unit is required.'),
  body('receivedDate')
    .isISO8601()
    .withMessage('Valid received date (ISO8601) is required.')
    .toDate(),
  body('status')
    .optional()
    .isIn(['AVAILABLE', 'MAPPED', 'DISPATCHED'])
    .withMessage('Status must be a valid LotStatus.'),
];

const validateUpdateLot = [
  ...validateLotId,
  ...validateCreateLot,
];

module.exports = {
  validateLotId,
  validateCreateLot,
  validateUpdateLot,
};
