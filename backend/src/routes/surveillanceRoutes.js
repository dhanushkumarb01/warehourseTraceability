/**
 * Surveillance Routes — mounted at /api/surveillance  (Phase 13)
 *
 * User-facing (Bearer JWT):
 *   GET    /alerts                       List alerts (filter/paginate)        [ANY]
 *   GET    /alerts/summary               Dashboard counts                     [ANY]
 *   GET    /alerts/:id                   Single alert                         [ANY]
 *   GET    /alerts/:id/snapshot          Evidence image (token via header/qs) [ANY]
 *   POST   /alerts/:id/acknowledge       Acknowledge                          [ADMIN, SUPERVISOR]
 *   POST   /alerts/:id/resolve           Resolve                              [ADMIN, SUPERVISOR]
 *   POST   /alerts/:id/dismiss           Dismiss                              [ADMIN, SUPERVISOR]
 *   GET    /status                       AI service + live motion status      [ANY]
 *   GET    /cameras/:id/alerts           Recent alerts for a camera           [ANY]
 *   GET    /cameras/:id/motion           Live motion state for a camera       [ANY]
 *   GET    /cameras/:id/motion-config    Detector (motion) configuration      [ANY]
 *   PUT    /cameras/:id/motion-config    Update motion configuration          [ADMIN, SUPERVISOR]
 *
 * Internal (AI worker, X-Service-Token):
 *   GET    /ai/cameras                   Camera jobs (capture + config)
 *   GET    /ai/cameras/:id/video         Download a camera's uploaded demo video
 *   POST   /ai/alerts                    Ingest a detected alert (+ snapshot)
 *   POST   /ai/heartbeat                 Liveness + live per-camera motion state
 *
 * Viewing is open to any authenticated user; alert management and motion config
 * require the surveillance-management / camera-management groups. The AI worker
 * authenticates with a service token, never a user identity.
 */

'use strict';

const express = require('express');
const { Router } = express;
const surveillanceController = require('../controllers/surveillanceController');
const authenticate = require('../middleware/authenticate');
const streamAuthenticate = require('../middleware/streamAuthenticate');
const authenticateService = require('../middleware/authenticateService');
const authorize = require('../middleware/authorize');
const handleValidationErrors = require('../middleware/validate');
const env = require('../config/env');
const { GROUPS } = require('../config/roles');
const {
  validateAlertId, validateCameraId, validateListQuery, validateMotionConfig,
  validateWallConfig, validateWagonConfig, validateOverSpeedConfig, validateCancelledConfig, validateFaceConfig, validateZones, validateIngest, validateHeartbeat,
} = require('../validators/surveillanceValidators');

const router = Router();

// ── Evidence image — token may arrive via ?access_token (for <img>) ──────────
router.get('/alerts/:id/snapshot', streamAuthenticate, validateAlertId, handleValidationErrors, surveillanceController.snapshot);

// ── Internal AI-worker endpoints (service token; own JSON parser for snapshots)
const ingestParser = express.json({ limit: env.SURVEILLANCE_INGEST_LIMIT });
router.get('/ai/cameras', authenticateService, surveillanceController.workerCameras);
router.get('/ai/cameras/:id/video', authenticateService, surveillanceController.workerVideo);
router.get('/ai/faces', authenticateService, surveillanceController.workerFaces);
router.post('/ai/alerts', authenticateService, ingestParser, validateIngest, handleValidationErrors, surveillanceController.ingest);
router.post('/ai/heartbeat', authenticateService, ingestParser, validateHeartbeat, handleValidationErrors, surveillanceController.heartbeat);

// ── Everything else: authenticated users ─────────────────────────────────────
router.use(authenticate);

router.get('/status', surveillanceController.serviceStatus);

router.get('/alerts', validateListQuery, handleValidationErrors, surveillanceController.list);
router.get('/alerts/summary', surveillanceController.summary);
router.get('/alerts/:id', validateAlertId, handleValidationErrors, surveillanceController.getById);
router.post('/alerts/:id/acknowledge', authorize(GROUPS.SURVEILLANCE_MANAGE), validateAlertId, handleValidationErrors, surveillanceController.acknowledge);
router.post('/alerts/:id/resolve', authorize(GROUPS.SURVEILLANCE_MANAGE), validateAlertId, handleValidationErrors, surveillanceController.resolve);
router.post('/alerts/:id/dismiss', authorize(GROUPS.SURVEILLANCE_MANAGE), validateAlertId, handleValidationErrors, surveillanceController.dismiss);

router.get('/cameras/:id/alerts', validateCameraId, handleValidationErrors, surveillanceController.cameraAlerts);
router.get('/cameras/:id/motion', validateCameraId, handleValidationErrors, surveillanceController.cameraMotion);
router.get('/cameras/:id/motion-config', validateCameraId, handleValidationErrors, surveillanceController.getMotionConfig);
router.put('/cameras/:id/motion-config', authorize(GROUPS.CAMERA_MANAGE), validateMotionConfig, handleValidationErrors, surveillanceController.setMotionConfig);

router.get('/cameras/:id/wall-config', validateCameraId, handleValidationErrors, surveillanceController.getWallConfig);
router.put('/cameras/:id/wall-config', authorize(GROUPS.CAMERA_MANAGE), validateWallConfig, handleValidationErrors, surveillanceController.setWallConfig);

router.get('/cameras/:id/wagon-config', validateCameraId, handleValidationErrors, surveillanceController.getWagonConfig);
router.put('/cameras/:id/wagon-config', authorize(GROUPS.CAMERA_MANAGE), validateWagonConfig, handleValidationErrors, surveillanceController.setWagonConfig);

router.get('/cameras/:id/overspeed-config', validateCameraId, handleValidationErrors, surveillanceController.getOverSpeedConfig);
router.put('/cameras/:id/overspeed-config', authorize(GROUPS.CAMERA_MANAGE), validateOverSpeedConfig, handleValidationErrors, surveillanceController.setOverSpeedConfig);

router.get('/cameras/:id/cancelled-config', validateCameraId, handleValidationErrors, surveillanceController.getCancelledConfig);
router.put('/cameras/:id/cancelled-config', authorize(GROUPS.CAMERA_MANAGE), validateCancelledConfig, handleValidationErrors, surveillanceController.setCancelledConfig);

router.get('/cameras/:id/face-config', validateCameraId, handleValidationErrors, surveillanceController.getFaceConfig);
router.put('/cameras/:id/face-config', authorize(GROUPS.CAMERA_MANAGE), validateFaceConfig, handleValidationErrors, surveillanceController.setFaceConfig);

router.get('/cameras/:id/zones', validateCameraId, handleValidationErrors, surveillanceController.getZones);
router.put('/cameras/:id/zones', authorize(GROUPS.CAMERA_MANAGE), validateZones, handleValidationErrors, surveillanceController.setZones);

module.exports = router;
