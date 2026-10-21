/**
 * QR Payload Utilities
 *
 * Pure, side-effect-free helpers for parsing the JSON QR payloads produced by
 * the QR module (see qrService.generatePayload). Kept separate so both the QR
 * module and the Mapping (dual-QR scan) workflow can share a single, canonical
 * parser instead of duplicating JSON.parse logic.
 *
 * Payload shapes (must stay in sync with qrService.generatePayload):
 *   BAY           → { entityType: 'BAY',          bayId, code, zone, version }
 *   MATERIAL_LOT  → { entityType: 'MATERIAL_LOT', lotId, code, version }
 *
 * The scan workflow is designed to be "scan-ready": a future camera scanner
 * simply hands the decoded string to these helpers — no other code changes.
 */

'use strict';

const AppError = require('./AppError');

/**
 * Parse a raw QR payload string into a structured object.
 *
 * Accepts either:
 *   - the canonical JSON string stored in the entity's `qrCode` column, or
 *   - an already-parsed object (passed straight through after validation).
 *
 * @param {string|object} raw
 * @returns {{ entityType: string, lotId?: string, bayId?: string, code?: string, version?: number }}
 * @throws {AppError} 400 when the payload is missing or malformed
 */
const parseQRPayload = (raw) => {
  if (raw === null || raw === undefined || raw === '') {
    throw new AppError('QR payload is empty.', 400);
  }

  let payload = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new AppError('QR payload is not valid JSON. The code may be damaged or unsupported.', 400);
    }
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('QR payload must be a JSON object.', 400);
  }

  if (!payload.entityType) {
    throw new AppError('QR payload is missing its entityType.', 400);
  }

  return payload;
};

/**
 * Parse a MATERIAL_LOT QR payload and return the lot id it references.
 *
 * @param {string|object} raw
 * @returns {string} lotId
 * @throws {AppError} 400 for wrong entity type or missing id
 */
const resolveLotIdFromQR = (raw) => {
  const payload = parseQRPayload(raw);
  if (payload.entityType !== 'MATERIAL_LOT') {
    throw new AppError(
      `Expected a Material Lot QR code but received a "${payload.entityType}" code.`,
      400
    );
  }
  if (!payload.lotId) {
    throw new AppError('Material Lot QR payload does not contain a lotId.', 400);
  }
  return payload.lotId;
};

/**
 * Parse a BAY QR payload and return the bay id it references.
 *
 * @param {string|object} raw
 * @returns {string} bayId
 * @throws {AppError} 400 for wrong entity type or missing id
 */
const resolveBayIdFromQR = (raw) => {
  const payload = parseQRPayload(raw);
  if (payload.entityType !== 'BAY') {
    throw new AppError(
      `Expected a Bay QR code but received a "${payload.entityType}" code.`,
      400
    );
  }
  if (!payload.bayId) {
    throw new AppError('Bay QR payload does not contain a bayId.', 400);
  }
  return payload.bayId;
};

module.exports = {
  parseQRPayload,
  resolveLotIdFromQR,
  resolveBayIdFromQR,
};
