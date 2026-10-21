/**
 * Camera Validators (Phase 11)
 */

'use strict';

const { body, param, query } = require('express-validator');

const STREAM_TYPES = ['RTSP', 'RTMP', 'HTTP', 'LOCAL_WEBCAM', 'UPLOADED_VIDEO'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
const HEALTH = ['ONLINE', 'OFFLINE', 'UNKNOWN'];

const validateCreateCamera = [
  body('cameraCode').trim().notEmpty().withMessage('Camera code is required.').isLength({ max: 50 }),
  body('cameraName').trim().notEmpty().withMessage('Camera name is required.').isLength({ max: 120 }),
  body('location').trim().notEmpty().withMessage('Location is required.').isLength({ max: 160 }),
  body('cameraType').trim().notEmpty().withMessage('Camera type is required.').isLength({ max: 60 }),
  body('cameraPurpose').trim().notEmpty().withMessage('Camera purpose is required.').isLength({ max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('streamType').isIn(STREAM_TYPES).withMessage(`Stream type must be one of: ${STREAM_TYPES.join(', ')}.`),
  body('streamUrl').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('username').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('password').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('zone').trim().notEmpty().withMessage('Warehouse zone is required.').isLength({ max: 80 }),
  body('site').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('status').optional().isIn(STATUSES),
  body('installationDate').optional({ nullable: true }).isISO8601().withMessage('installationDate must be ISO-8601.'),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 1000 }),
];

const validateUpdateCamera = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('cameraCode').optional().trim().notEmpty().isLength({ max: 50 }),
  body('cameraName').optional().trim().notEmpty().isLength({ max: 120 }),
  body('location').optional().trim().notEmpty().isLength({ max: 160 }),
  body('cameraType').optional().trim().notEmpty().isLength({ max: 60 }),
  body('cameraPurpose').optional().trim().notEmpty().isLength({ max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('streamType').optional().isIn(STREAM_TYPES),
  body('streamUrl').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('username').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('password').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('zone').optional().trim().notEmpty().isLength({ max: 80 }),
  body('site').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('status').optional().isIn(STATUSES),
  body('health').optional().isIn(HEALTH),
  body('installationDate').optional({ nullable: true }).isISO8601(),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 1000 }),
];

const validateCameraId = [param('id').isUUID().withMessage('Camera ID must be a valid UUID.')];

const validateTestAdhoc = [
  body('streamType').isIn(STREAM_TYPES).withMessage(`Stream type must be one of: ${STREAM_TYPES.join(', ')}.`),
  body('streamUrl').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('username').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('password').optional({ nullable: true }).isString().isLength({ max: 200 }),
];

const validateListQuery = [
  query('status').optional().isIn(STATUSES),
  query('health').optional().isIn(HEALTH),
  query('streamType').optional().isIn(STREAM_TYPES),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

module.exports = {
  validateCreateCamera,
  validateUpdateCamera,
  validateCameraId,
  validateTestAdhoc,
  validateListQuery,
};
