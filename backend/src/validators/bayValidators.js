/**
 * Bay Validators
 *
 * Defines express-validator chains for all Bay CRUD operations.
 * Kept separate from controllers and services to follow SRP.
 *
 * Rules enforced:
 *   bayCode            — required, non-empty string, trimmed
 *   bayName            — required, non-empty string, trimmed
 *   zone               — required, non-empty string, trimmed
 *   latitude           — required, numeric, range [-90, 90]
 *   longitude          — required, numeric, range [-180, 180]
 *   status             — required, must be one of the BayStatus enum values
 *   polygonCoordinates — optional; if present must be a valid coordinate array
 */

'use strict';

const { body, param } = require('express-validator');

/** Values must mirror the BayStatus enum in schema.prisma exactly. */
const VALID_BAY_STATUSES = ['AVAILABLE', 'OCCUPIED', 'INACTIVE'];

/**
 * Validate a polygonCoordinates value.
 *
 * Accepts:
 *   - null / undefined — means "no boundary defined"
 *   - Array of [lat, lng] pairs — minimum 3 pairs, each element a finite float
 *     in valid geographic ranges.
 *
 * Rejects:
 *   - Arrays with fewer than 3 coordinate pairs (degenerate geometry)
 *   - Any element that is not a [lat, lng] numeric pair
 *   - lat outside [-90, 90] or lng outside [-180, 180]
 *
 * @param {*} value
 * @returns {true}
 * @throws {Error}
 */
const validatePolygonCoordinates = (value) => {
  // Null / undefined means "no polygon defined" — valid
  if (value === null || value === undefined) return true;

  if (!Array.isArray(value)) {
    throw new Error('polygonCoordinates must be an array of [latitude, longitude] pairs.');
  }

  if (value.length < 3) {
    throw new Error('polygonCoordinates must contain at least 3 coordinate pairs to form a valid polygon.');
  }

  for (let i = 0; i < value.length; i++) {
    const pair = value[i];

    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`polygonCoordinates[${i}] must be a [latitude, longitude] pair.`);
    }

    const [lat, lng] = pair;

    if (typeof lat !== 'number' || !isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`polygonCoordinates[${i}][0] (latitude) must be a number between -90 and 90.`);
    }

    if (typeof lng !== 'number' || !isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`polygonCoordinates[${i}][1] (longitude) must be a number between -180 and 180.`);
    }
  }

  return true;
};

/**
 * Shared field rules used by both create and update validators.
 * Exported as an array so callers can spread or compose them.
 */
const bayFieldRules = [
  body('bayCode')
    .trim()
    .notEmpty()
    .withMessage('Bay Code is required.')
    .isLength({ max: 50 })
    .withMessage('Bay Code must not exceed 50 characters.'),

  body('bayName')
    .trim()
    .notEmpty()
    .withMessage('Bay Name is required.')
    .isLength({ max: 100 })
    .withMessage('Bay Name must not exceed 100 characters.'),

  body('zone')
    .trim()
    .notEmpty()
    .withMessage('Zone is required.')
    .isLength({ max: 100 })
    .withMessage('Zone must not exceed 100 characters.'),

  body('latitude')
    .notEmpty()
    .withMessage('Latitude is required.')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a number between -90 and 90.'),

  body('longitude')
    .notEmpty()
    .withMessage('Longitude is required.')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a number between -180 and 180.'),

  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required.')
    .isIn(VALID_BAY_STATUSES)
    .withMessage(`Status must be one of: ${VALID_BAY_STATUSES.join(', ')}.`),

  // polygonCoordinates is optional — validated only when present
  body('polygonCoordinates')
    .optional({ nullable: true })
    .custom(validatePolygonCoordinates),
];

/** Validates the :id route parameter is a valid UUID. */
const bayIdParam = param('id')
  .isUUID()
  .withMessage('Bay ID must be a valid UUID.');

/** Validation chain for POST /api/bays */
const validateCreateBay = [...bayFieldRules];

/** Validation chain for PUT /api/bays/:id */
const validateUpdateBay = [bayIdParam, ...bayFieldRules];

/** Validation chain for GET /api/bays/:id and DELETE /api/bays/:id */
const validateBayId = [bayIdParam];

module.exports = {
  validateCreateBay,
  validateUpdateBay,
  validateBayId,
};
