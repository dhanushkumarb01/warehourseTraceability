const { Router } = require('express');
const qrController = require('../controllers/qrController');
const { validateEntityType, validateGenerateQR } = require('../validators/qrValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

/**
 * POST /api/qr/:entityType/:entityId/generate
 * Write action — authenticated, restricted to the material-management group
 * (ADMIN, SUPERVISOR, OPERATOR).
 */
router.post(
  '/:entityType/:entityId/generate',
  authenticate,
  authorize(GROUPS.MATERIAL_WRITE),
  validateGenerateQR,
  handleValidationErrors,
  qrController.generateQR
);

/**
 * GET /api/qr/:entityType/:entityId/status
 */
router.get(
  '/:entityType/:entityId/status',
  authenticate,
  validateEntityType,
  handleValidationErrors,
  qrController.getStatus
);

/**
 * GET /api/qr/:entityType/:entityId/download
 * GET /api/qr/:entityType/:entityId/image
 *
 * These are loaded directly by the browser via <a download> / <img src>, which
 * cannot attach an Authorization header — so they remain unauthenticated. They
 * expose only a non-sensitive QR PNG that encodes the public entity payload.
 */
router.get(
  '/:entityType/:entityId/download',
  validateEntityType,
  handleValidationErrors,
  qrController.downloadQR
);

router.get(
  '/:entityType/:entityId/image',
  validateEntityType,
  handleValidationErrors,
  qrController.getQRImage
);

module.exports = router;
