/**
 * Stream Routes — mounted at /api/streams  (Phase 12, authenticated)
 *
 *   GET    /api/streams/live              Live wall: all cameras + stream state [ANY]
 *   POST   /api/streams/:id/open          Open / join a camera's live session   [ANY]
 *   POST   /api/streams/:id/close         Leave a camera's live session         [ANY]
 *   POST   /api/streams/:id/refresh       Force a reconnect ("Refresh Stream")  [ANY]
 *   GET    /api/streams/:id/status        Merged live + persisted stream status [ANY]
 *   GET    /api/streams/:id/logs          Connection-log history                [ANY]
 *   GET    /api/streams/:id/playback      Media proxy (file range / HTTP proxy) [ANY, token in header or ?access_token]
 *   GET    /api/streams/:id/manifest.m3u8 HLS manifest seam (RTSP/RTMP gateway)  [ANY, token in header or ?access_token]
 *   POST   /api/streams/:id/video         Associate a demo video                [ADMIN, SUPERVISOR]
 *   DELETE /api/streams/:id/video         Remove a demo video                   [ADMIN, SUPERVISOR]
 *
 * Streaming is open to any authenticated role; only stream management (video
 * association) requires the surveillance-management group. Credentials are never
 * exposed and the frontend never connects to a camera directly — all media is
 * proxied through these endpoints, leaving room for future auth, recording,
 * frame capture and AI processing without any frontend change.
 */

'use strict';

const { Router } = require('express');
const streamController = require('../controllers/streamController');
const authenticate = require('../middleware/authenticate');
const streamAuthenticate = require('../middleware/streamAuthenticate');
const authorize = require('../middleware/authorize');
const collectRawBody = require('../middleware/collectRawBody');
const handleValidationErrors = require('../middleware/validate');
const { GROUPS } = require('../config/roles');
const {
  validateCameraId, validateViewer, validateLogsQuery, validateLiveQuery, validateVideoUpload,
} = require('../validators/streamValidators');

const router = Router();

// ── Media endpoints (token may arrive via ?access_token for <video>/<img>) ──
// Registered before the blanket authenticate so they use their own auth.
router.get('/:id/playback', streamAuthenticate, validateCameraId, handleValidationErrors, streamController.playback);
router.get('/:id/manifest.m3u8', streamAuthenticate, validateCameraId, handleValidationErrors, streamController.manifest);

// ── Everything else requires the standard Bearer header ──
router.use(authenticate);

router.get('/live', validateLiveQuery, handleValidationErrors, streamController.live);

router.post('/:id/open', validateViewer, handleValidationErrors, streamController.open);
router.post('/:id/close', validateViewer, handleValidationErrors, streamController.close);
router.post('/:id/refresh', validateCameraId, handleValidationErrors, streamController.refresh);
router.get('/:id/status', validateCameraId, handleValidationErrors, streamController.status);
router.get('/:id/logs', validateLogsQuery, handleValidationErrors, streamController.logs);

router.post('/:id/video', authorize(GROUPS.CAMERA_MANAGE), validateVideoUpload, handleValidationErrors, collectRawBody, streamController.uploadVideo);
router.delete('/:id/video', authorize(GROUPS.CAMERA_MANAGE), validateCameraId, handleValidationErrors, streamController.clearVideo);

module.exports = router;
