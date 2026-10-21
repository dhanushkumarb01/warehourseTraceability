/**
 * QR Controller
 *
 * Exposes reusable QR logic. Routes generally look like:
 * /api/qr/:entityType/:entityId
 */

const qrService = require('../services/qrService');
const { sendSuccess } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');

/**
 * POST /api/qr/:entityType/:entityId/generate
 */
const generateQR = async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const { isRegenerate } = req.body;

  let updatedEntity;
  if (entityType.toUpperCase() === 'BAY') {
    updatedEntity = await qrService.generateBayQR(entityId, isRegenerate);
  } else if (entityType.toUpperCase() === 'MATERIAL_LOT') {
    updatedEntity = await qrService.generateMaterialLotQR(entityId, isRegenerate);
  } else {
    throw new AppError(`Generation for ${entityType} is not implemented.`, 501);
  }

  sendSuccess(res, 200, 'QR Code generated successfully.', updatedEntity);
};

/**
 * GET /api/qr/:entityType/:entityId/status
 */
const getStatus = async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const statusInfo = await qrService.getQRStatus(entityType.toUpperCase(), entityId);
  sendSuccess(res, 200, 'QR status retrieved successfully.', statusInfo);
};

/**
 * GET /api/qr/:entityType/:entityId/download
 * Sends the PNG as an attachment (rendered on request from the stored payload)
 */
const downloadQR = async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const upperType = entityType.toUpperCase();

  const png = await qrService.getQRImageBuffer(upperType, entityId);

  res.attachment(`QR_${upperType}_${entityId}.png`);
  res.type('png').send(png);
};

/**
 * GET /api/qr/:entityType/:entityId/image
 * Sends the PNG inline for UI preview
 */
const getQRImage = async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const upperType = entityType.toUpperCase();

  const png = await qrService.getQRImageBuffer(upperType, entityId);

  res.type('png').send(png);
};

module.exports = {
  generateQR,
  getStatus,
  downloadQR,
  getQRImage,
};

