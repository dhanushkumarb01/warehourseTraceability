/**
 * Face Registry Validators (Phase 14)
 */

'use strict';

const { body, param, query } = require('express-validator');

const STATUSES = ['ACTIVE', 'INACTIVE'];

const validateEmployeeId = [param('id').isUUID().withMessage('Employee ID must be a valid UUID.')];

const validateListQuery = [
  query('status').optional().isIn(STATUSES),
  query('search').optional().isString().isLength({ max: 120 }),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

const validateCreateEmployee = [
  body('employeeCode').isString().trim().isLength({ min: 1, max: 64 }).withMessage('Employee ID is required (max 64 chars).'),
  body('name').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Employee name is required (max 120 chars).'),
  body('department').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('designation').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('status').optional().isIn(STATUSES),
];

const validateUpdateEmployee = [
  param('id').isUUID().withMessage('Employee ID must be a valid UUID.'),
  body('employeeCode').optional().isString().trim().isLength({ min: 1, max: 64 }),
  body('name').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('department').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('designation').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('status').optional().isIn(STATUSES),
];

const validateAddFace = [
  param('id').isUUID().withMessage('Employee ID must be a valid UUID.'),
  body('imageBase64').isString().isLength({ min: 32 }).withMessage('A face image (base64) is required.'),
];

const validateDeleteFace = [
  param('id').isUUID().withMessage('Employee ID must be a valid UUID.'),
  param('faceId').isUUID().withMessage('Face ID must be a valid UUID.'),
];

module.exports = {
  validateEmployeeId, validateListQuery, validateCreateEmployee,
  validateUpdateEmployee, validateAddFace, validateDeleteFace,
};
