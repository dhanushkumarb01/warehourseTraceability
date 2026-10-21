/**
 * Stream Validators (Phase 12)
 */

'use strict';

const { body, param, query } = require('express-validator');

const STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
const HEALTH = ['ONLINE', 'OFFLINE', 'UNKNOWN'];
const STREAM_TYPES = ['RTSP', 'RTMP', 'HTTP', 'LOCAL_WEBCAM', 'UPLOADED_VIDEO'];

const validateCameraId = [param('id').isUUID().withMessage('Camera ID must be a valid UUID.')];

const validateViewer = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('viewerId').optional().isString().isLength({ max: 120 }).withMessage('viewerId must be a short string.'),
];

const validateLogsQuery = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200.'),
];

const validateLiveQuery = [
  query('status').optional().isIn(STATUSES),
  query('health').optional().isIn(HEALTH),
  query('streamType').optional().isIn(STREAM_TYPES),
];

const validateVideoUpload = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  query('filename').optional().isString().isLength({ max: 200 }),
];

module.exports = {
  validateCameraId,
  validateViewer,
  validateLogsQuery,
  validateLiveQuery,
  validateVideoUpload,
};
