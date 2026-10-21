const { body, param } = require('express-validator');

const validateMaterialId = [
  param('id')
    .isUUID()
    .withMessage('Material ID must be a valid UUID.'),
];

const validateCreateMaterial = [
  body('materialCode')
    .trim()
    .notEmpty()
    .withMessage('Material code is required.')
    .isLength({ max: 50 })
    .withMessage('Material code cannot exceed 50 characters.'),
  body('materialName')
    .trim()
    .notEmpty()
    .withMessage('Material name is required.'),
  body('materialType')
    .trim()
    .notEmpty()
    .withMessage('Material type is required.'),
  body('manufacturer')
    .optional()
    .trim(),
  body('supplier')
    .optional()
    .trim(),
  body('description')
    .optional()
    .trim(),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE'])
    .withMessage('Status must be either ACTIVE or INACTIVE.'),
];

const validateUpdateMaterial = [
  ...validateMaterialId,
  ...validateCreateMaterial,
];

module.exports = {
  validateMaterialId,
  validateCreateMaterial,
  validateUpdateMaterial,
};
