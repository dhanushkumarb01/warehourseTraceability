const { body, param } = require('express-validator');

const validateLotId = [
  param('id')
    .isUUID()
    .withMessage('Lot ID must be a valid UUID.'),
];

const materialIdRule = body('materialId')
  .isUUID()
  .withMessage('Valid Material ID is required.');

// Lot fields shared by create and update.
const lotFieldRules = [
  body('lotCode')
    .trim()
    .notEmpty()
    .withMessage('Lot code is required.')
    .isLength({ max: 50 })
    .withMessage('Lot code cannot exceed 50 characters.'),
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
  // Optional at receipt. Only createLot stores it; later changes go through
  // /api/placement so they stay locked once a bay is allotted.
  body('arrivalMode')
    .optional({ values: 'null' })
    .isIn(['RAIL', 'ROAD'])
    .withMessage('Arrival mode must be RAIL or ROAD.'),
];

const hasInlineMaterial = body('material').exists({ values: 'null' });

// Create accepts EITHER an existing materialId OR a minimal new material
// ({ materialCode, materialName, materialType, … }) created in the same
// transaction. The inline path is the guided "receive by road" flow, so it
// must also say how the lot arrived.
const validateCreateLot = [
  body('materialId')
    .if(body('material').not().exists({ values: 'null' }))
    .isUUID()
    .withMessage('Choose a material, or describe a new one.'),
  body('material')
    .if(hasInlineMaterial)
    .isObject()
    .withMessage('New material must be an object.')
    .custom((value, { req }) => !req.body.materialId)
    .withMessage('Send either an existing material or a new one, not both.'),
  body('material.materialCode')
    .if(hasInlineMaterial)
    .trim()
    .notEmpty()
    .withMessage('Material code is required.')
    .isLength({ max: 50 })
    .withMessage('Material code cannot exceed 50 characters.'),
  body('material.materialName')
    .if(hasInlineMaterial)
    .trim()
    .notEmpty()
    .withMessage('Material name is required.'),
  body('material.materialType')
    .if(hasInlineMaterial)
    .trim()
    .notEmpty()
    .withMessage('Material type is required.'),
  body(['material.manufacturer', 'material.supplier', 'material.description'])
    .optional()
    .trim(),
  body('arrivalMode')
    .if(hasInlineMaterial)
    .isIn(['RAIL', 'ROAD'])
    .withMessage('Choose how the lot arrived: RAIL or ROAD.'),
  ...lotFieldRules,
];

const validateUpdateLot = [
  ...validateLotId,
  materialIdRule,
  ...lotFieldRules,
];

module.exports = {
  validateLotId,
  validateCreateLot,
  validateUpdateLot,
};
