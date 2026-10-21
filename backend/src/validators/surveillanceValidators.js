/**
 * Surveillance Validators (Phase 13)
 */

'use strict';

const { body, param, query } = require('express-validator');

const ALERT_TYPES = ['MOTION', 'INTRUSION', 'WALL_INTRUSION', 'MAN_INSIDE_WAGON', 'OVER_SPEED', 'CANCELLED_VEHICLE', 'FACE_DETECTION', 'FACE', 'GEOFENCE', 'VEHICLE', 'OVERSPEED', 'DRIVER_MONITORING', 'OTHER'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['NEW', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'];

const validateAlertId = [param('id').isUUID().withMessage('Alert ID must be a valid UUID.')];
const validateCameraId = [param('id').isUUID().withMessage('Camera ID must be a valid UUID.')];

const validateListQuery = [
  query('status').optional().isIn(STATUSES),
  query('severity').optional().isIn(SEVERITIES),
  query('alertType').optional().isIn(ALERT_TYPES),
  query('cameraId').optional().isUUID(),
  query('active').optional().isIn(['true', 'false']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

const validateMotionConfig = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('enabled').optional().isBoolean(),
  body('sensitivity').optional().isIn(['low', 'medium', 'high']),
  body('minAreaPercent').optional().isFloat({ min: 0, max: 100 }),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
  body('armed').optional().isIn(['always', 'non_operational']),
  body('severity').optional().isIn(SEVERITIES),
  body('operationalHours').optional().isObject(),
  body('operationalHours.start').optional().matches(/^\d{2}:\d{2}$/).withMessage('start must be HH:MM.'),
  body('operationalHours.end').optional().matches(/^\d{2}:\d{2}$/).withMessage('end must be HH:MM.'),
  body('operationalHours.days').optional().isArray(),
];

const validateWallConfig = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('enabled').optional().isBoolean(),
  body('minConfidence').optional().isFloat({ min: 0, max: 1 }),
  body('severity').optional().isIn(SEVERITIES),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
  body('modelPath').optional().isString().isLength({ max: 200 }),
  body('zoneIds').optional().isArray(),
];

const validateWagonConfig = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('enabled').optional().isBoolean(),
  body('minConfidence').optional().isFloat({ min: 0, max: 1 }),
  body('minDurationSec').optional().isFloat({ min: 0, max: 120 }),
  body('severity').optional().isIn(SEVERITIES),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
  body('modelPath').optional().isString().isLength({ max: 200 }),
  body('zoneIds').optional().isArray(),
];

const validateOverSpeedConfig = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('enabled').optional().isBoolean(),
  body('speedLimit').optional().isFloat({ min: 1, max: 300 }),
  body('pixelsPerMeter').optional().isFloat({ min: 0.1, max: 10000 }),
  body('minConfidence').optional().isFloat({ min: 0, max: 1 }),
  body('severity').optional().isIn(SEVERITIES),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
  body('modelPath').optional().isString().isLength({ max: 200 }),
];

const validateCancelledConfig = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('enabled').optional().isBoolean(),
  body('minConfidence').optional().isFloat({ min: 0, max: 1 }),
  body('severity').optional().isIn(SEVERITIES),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
  body('modelPath').optional().isString().isLength({ max: 200 }),
];

const validateFaceConfig = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('enabled').optional().isBoolean(),
  body('threshold').optional().isFloat({ min: 0, max: 1 }),
  body('minConfidence').optional().isFloat({ min: 0, max: 1 }),
  body('severity').optional().isIn(SEVERITIES),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
];

const validateZones = [
  param('id').isUUID().withMessage('Camera ID must be a valid UUID.'),
  body('zones').isArray().withMessage('zones must be an array.'),
  body('zones.*.name').optional().isString().isLength({ max: 80 }),
  body('zones.*.type').optional().isString().isLength({ max: 40 }),
  body('zones.*.polygon').optional().isArray(),
];

// Internal (AI worker) — alert ingest.
const validateIngest = [
  body('cameraId').isUUID().withMessage('cameraId must be a valid UUID.'),
  body('alertType').optional().isIn(ALERT_TYPES),
  body('detectorType').optional().isString().isLength({ max: 60 }),
  body('severity').optional().isIn(SEVERITIES),
  body('message').optional().isString().isLength({ max: 500 }),
  body('detectionDetails').optional(),
  body('snapshotBase64').optional().isString(),
  body('detectedAt').optional().isISO8601(),
  body('cooldownSec').optional().isInt({ min: 0, max: 3600 }),
];

const validateHeartbeat = [
  body('worker').optional(),
  body('cameras').optional().isArray(),
];

module.exports = {
  validateAlertId,
  validateCameraId,
  validateListQuery,
  validateMotionConfig,
  validateWallConfig,
  validateWagonConfig,
  validateOverSpeedConfig,
  validateCancelledConfig,
  validateFaceConfig,
  validateZones,
  validateIngest,
  validateHeartbeat,
};
