const { body, param } = require('express-validator');

const validateEntityType = [
  param('entityType')
    .toUpperCase()
    .isIn(['BAY', 'MATERIAL_LOT'])
    .withMessage('Invalid or unsupported entity type. Currently supported: BAY, MATERIAL_LOT.'),
  param('entityId')
    .isUUID()
    .withMessage('Entity ID must be a valid UUID.')
];

const validateGenerateQR = [
  ...validateEntityType,
  body('isRegenerate')
    .optional()
    .isBoolean()
    .withMessage('isRegenerate must be a boolean.')
];

module.exports = {
  validateEntityType,
  validateGenerateQR,
};
