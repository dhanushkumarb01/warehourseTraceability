/**
 * QR Service
 *
 * Handles generating, retrieving, and regenerating QR codes for entities.
 * Currently supports 'BAY' entity type, designed to be easily extensible
 * for Material, Dispatch, etc.
 */

const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const AppError = require('../utils/AppError');

/**
 * Generate a standard JSON payload for an entity.
 */
const generatePayload = (entityType, entityData, version = 1) => {
  switch (entityType) {
    case 'BAY':
      return JSON.stringify({
        entityType: 'BAY',
        bayId: entityData.id,
        code: entityData.bayCode,
        zone: entityData.zone,
        version,
      });
    case 'MATERIAL_LOT':
      return JSON.stringify({
        entityType: 'MATERIAL_LOT',
        lotId: entityData.id,
        code: entityData.lotCode,
        version,
      });
    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }
};

/**
 * Render a QR payload to a print-quality PNG buffer.
 *
 * Images are rendered on request from the payload stored in the DB rather than
 * persisted to disk, so QR codes survive hosts with ephemeral filesystems.
 */
const renderPng = (payloadStr) => QRCode.toBuffer(payloadStr, {
  errorCorrectionLevel: 'H',
  type: 'png',
  margin: 2,
  width: 600, // High quality for printing
  color: {
    dark: '#0f172a',
    light: '#ffffff'
  }
});

/**
 * Generate or Regenerate a QR Code for a Bay
 * @param {string} bayId 
 * @param {boolean} isRegenerate 
 * @returns {Promise<object>} - Updated Bay record
 */
const generateBayQR = async (bayId, isRegenerate = false) => {
  const bay = await prisma.bay.findUnique({ where: { id: bayId } });
  if (!bay) throw new AppError('Bay not found.', 404);

  if (bay.qrStatus === 'GENERATED' && !isRegenerate) {
    throw new AppError('QR Code already exists for this bay.', 400);
  }

  const newVersion = (bay.qrVersion || 0) + 1;
  const payloadStr = generatePayload('BAY', bay, newVersion);

  // Validate the payload renders before marking the QR as generated.
  await renderPng(payloadStr);

  // Update DB
  const updatedBay = await prisma.bay.update({
    where: { id: bay.id },
    data: {
      qrCode: payloadStr,
      qrStatus: 'GENERATED',
      qrGeneratedAt: new Date(),
      qrVersion: newVersion,
    },
  });

  return updatedBay;
};

/**
 * Generate or Regenerate a QR Code for a Material Lot
 * @param {string} lotId 
 * @param {boolean} isRegenerate 
 * @returns {Promise<object>} - Updated MaterialLot record
 */
const generateMaterialLotQR = async (lotId, isRegenerate = false) => {
  const lot = await prisma.materialLot.findUnique({ where: { id: lotId } });
  if (!lot) throw new AppError('Material Lot not found.', 404);

  if (lot.qrStatus === 'GENERATED' && !isRegenerate) {
    throw new AppError('QR Code already exists for this lot.', 400);
  }

  const newVersion = (lot.qrVersion || 0) + 1;
  const payloadStr = generatePayload('MATERIAL_LOT', lot, newVersion);

  // Validate the payload renders before marking the QR as generated.
  await renderPng(payloadStr);

  // Update DB
  const updatedLot = await prisma.materialLot.update({
    where: { id: lot.id },
    data: {
      qrCode: payloadStr,
      qrStatus: 'GENERATED',
      qrGeneratedAt: new Date(),
      qrVersion: newVersion,
    },
  });

  return updatedLot;
};

/**
 * Get QR Status and details for a given entity.
 */
const getQRStatus = async (entityType, entityId) => {
  if (entityType === 'BAY') {
    const bay = await prisma.bay.findUnique({ where: { id: entityId } });
    if (!bay) throw new AppError('Entity not found.', 404);
    return {
      entityType: 'BAY',
      entityId: bay.id,
      qrStatus: bay.qrStatus,
      qrGeneratedAt: bay.qrGeneratedAt,
      qrVersion: bay.qrVersion,
      hasFile: bay.qrStatus === 'GENERATED',
    };
  } else if (entityType === 'MATERIAL_LOT') {
    const lot = await prisma.materialLot.findUnique({ where: { id: entityId } });
    if (!lot) throw new AppError('Entity not found.', 404);
    return {
      entityType: 'MATERIAL_LOT',
      entityId: lot.id,
      qrStatus: lot.qrStatus,
      qrGeneratedAt: lot.qrGeneratedAt,
      qrVersion: lot.qrVersion,
      hasFile: lot.qrStatus === 'GENERATED',
    };
  }
  
  throw new AppError(`Unsupported entity type: ${entityType}`, 400);
};

/**
 * Render the PNG for an entity's generated QR code from its stored payload.
 * @returns {Promise<Buffer>}
 */
const getQRImageBuffer = async (entityType, entityId) => {
  let entity;
  if (entityType === 'BAY') {
    entity = await prisma.bay.findUnique({ where: { id: entityId } });
  } else if (entityType === 'MATERIAL_LOT') {
    entity = await prisma.materialLot.findUnique({ where: { id: entityId } });
  } else {
    throw new AppError(`Unsupported entity type: ${entityType}`, 400);
  }
  if (!entity) throw new AppError('Entity not found.', 404);
  if (entity.qrStatus !== 'GENERATED' || !entity.qrCode) {
    throw new AppError('QR Code has not been generated for this entity yet.', 404);
  }
  return renderPng(entity.qrCode);
};

module.exports = {
  generateBayQR,
  generateMaterialLotQR,
  getQRStatus,
  getQRImageBuffer,
};
