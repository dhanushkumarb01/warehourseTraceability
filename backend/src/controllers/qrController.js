/**
 * QR Controller
 *
 * Exposes reusable QR logic. Routes generally look like:
 * /api/qr/:entityType/:entityId
 */

const qrService = require('../services/qrService');
const { sendSuccess } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');
const fs = require('fs');

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
 * Sends the actual PNG file
 */
const downloadQR = async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const upperType = entityType.toUpperCase();

  // First verify entity exists and status
  const statusInfo = await qrService.getQRStatus(upperType, entityId);
  
  if (statusInfo.qrStatus !== 'GENERATED') {
    throw new AppError('QR Code has not been generated for this entity yet.', 404);
  }

  const filePath = qrService.getQRFilePath(upperType, entityId);

  if (!fs.existsSync(filePath)) {
    throw new AppError('QR Code file is missing from storage.', 500);
  }

  res.download(filePath, `QR_${upperType}_${entityId}.png`, (err) => {
    if (err) {
      if (err.code === 'ECONNABORTED' && res.headersSent) {
        // Ignored, client disconnected
      } else {
        next(err);
      }
    }
  });
};

/**
 * GET /api/qr/:entityType/:entityId/image
 * Sends the actual PNG file inline for UI preview
 */
const getQRImage = async (req, res, next) => {
  const { entityType, entityId } = req.params;
  const upperType = entityType.toUpperCase();

  const statusInfo = await qrService.getQRStatus(upperType, entityId);
  
  if (statusInfo.qrStatus !== 'GENERATED') {
    throw new AppError('QR Code has not been generated for this entity yet.', 404);
  }

  const filePath = qrService.getQRFilePath(upperType, entityId);

  if (!fs.existsSync(filePath)) {
    throw new AppError('QR Code file is missing from storage.', 500);
  }

  res.sendFile(filePath, (err) => {
    if (err && err.code !== 'ECONNABORTED') next(err);
  });
};

module.exports = {
  generateQR,
  getStatus,
  downloadQR,
  getQRImage,
};

