/**
 * Mapping Validators
 *
 * express-validator chains for the Material-to-Bay Mapping endpoints.
 * Kept separate from controllers/services per the project's SRP convention.
 *
 * QR payloads (scan endpoints) may arrive either as a JSON string (the value
 * stored in the entity's `qrCode` column / encoded in the printed QR) or as an
 * already-parsed object — both are accepted; structural parsing happens in the
 * service via the shared qrPayload util.
 */

'use strict';

const { body, param } = require('express-validator');

// ─── Reusable rules ───────────────────────────────────────────────────────────

const optionalRemarks = body('remarks')
  .optional({ nullable: true })
  .isString()
  .withMessage('Remarks must be a string.')
  .isLength({ max: 500 })
  .withMessage('Remarks must not exceed 500 characters.');

const optionalMappedBy = body('mappedBy')
  .optional({ nullable: true })
  .isUUID()
  .withMessage('mappedBy must be a valid user UUID.');

const qrPayloadRule = (field) =>
  body(field)
    .notEmpty()
    .withMessage(`${field} is required.`)
    .custom((value) => {
      // Accept an object or a non-empty string — the service parses/validates it.
      if (typeof value === 'object') return true;
      if (typeof value === 'string' && value.trim() !== '') return true;
      throw new Error(`${field} must be a QR payload string or object.`);
    });

// ─── Write endpoints ──────────────────────────────────────────────────────────

const validateCreateMapping = [
  body('lotId').isUUID().withMessage('lotId must be a valid UUID.'),
  body('bayId').isUUID().withMessage('bayId must be a valid UUID.'),
  optionalRemarks,
  optionalMappedBy,
];

const validateMoveMaterial = [
  body('lotId').isUUID().withMessage('lotId must be a valid UUID.'),
  body('toBayId').isUUID().withMessage('toBayId must be a valid UUID.'),
  optionalRemarks,
  optionalMappedBy,
];

const validateRemoveMaterial = [
  body('lotId').isUUID().withMessage('lotId must be a valid UUID.'),
  optionalRemarks,
  optionalMappedBy,
];

// ─── Dual-QR endpoints ────────────────────────────────────────────────────────

const validateScanCommit = [
  qrPayloadRule('materialQr'),
  qrPayloadRule('bayQr'),
  optionalRemarks,
  optionalMappedBy,
];

// Resolve allows scanning either code first (preview as you scan).
const validateScanResolve = [
  body('materialQr')
    .optional({ nullable: true })
    .custom((v) => typeof v === 'object' || (typeof v === 'string' && v.trim() !== ''))
    .withMessage('materialQr must be a QR payload string or object.'),
  body('bayQr')
    .optional({ nullable: true })
    .custom((v) => typeof v === 'object' || (typeof v === 'string' && v.trim() !== ''))
    .withMessage('bayQr must be a QR payload string or object.'),
];

// ─── Param validators ─────────────────────────────────────────────────────────

const validateBayIdParam = [
  param('bayId').isUUID().withMessage('Bay ID must be a valid UUID.'),
];

const validateLotIdParam = [
  param('lotId').isUUID().withMessage('Lot ID must be a valid UUID.'),
];

module.exports = {
  validateCreateMapping,
  validateMoveMaterial,
  validateRemoveMaterial,
  validateScanCommit,
  validateScanResolve,
  validateBayIdParam,
  validateLotIdParam,
};
