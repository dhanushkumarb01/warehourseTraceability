/**
 * Zone + Loading Dock Validators
 *
 * Coordinates are optional for both, but must be supplied as a complete,
 * in-range pair. Values are coerced to numbers (or null) here so services
 * never see strings or a half-entered pair.
 */

'use strict';

const { body, param } = require('express-validator');
const { validateCoordinatePair } = require('../placement/geo');

const ARRIVAL_MODES = ['RAIL', 'ROAD'];

/** Validate latitude+longitude together, then normalise them on req.body. */
const coordinatePairRule = body('latitude').custom((value, { req }) => {
  const result = validateCoordinatePair(value, req.body.longitude);
  if (!result.valid) throw new Error(result.message);
  req.body.latitude = result.value.latitude;
  req.body.longitude = result.value.longitude;
  return true;
});

/** true / false / null — null means "not configured". */
const triStateRule = (field, label) =>
  body(field)
    .optional({ values: 'undefined' })
    .custom((v) => v === null || typeof v === 'boolean')
    .withMessage(`${label} must be true, false or null (not configured).`);

const idParam = (label) => param('id').isUUID().withMessage(`${label} ID must be a valid UUID.`);

// ─── Zones ────────────────────────────────────────────────────────────────────

const zoneFieldRules = [
  body('name')
    .isString().withMessage('Zone name is required.')
    .trim()
    .notEmpty().withMessage('Zone name is required.')
    .isLength({ max: 100 }).withMessage('Zone name must not exceed 100 characters.'),
  body('description')
    .optional({ values: 'null' })
    .isString().withMessage('Description must be text.')
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters.'),
  coordinatePairRule,
  triStateRule('railConnected', 'Rail connectivity'),
  triStateRule('roadConnected', 'Road connectivity'),
];

const validateCreateZone = [...zoneFieldRules];
const validateUpdateZone = [idParam('Zone'), ...zoneFieldRules];
const validateZoneId = [idParam('Zone')];

// ─── Loading docks ──────────────────────────────────────────────────────────

const dockFieldRules = [
  body('dockCode')
    .isString().withMessage('Dock code is required.')
    .trim()
    .notEmpty().withMessage('Dock code is required.')
    .isLength({ max: 50 }).withMessage('Dock code must not exceed 50 characters.'),
  body('dockName')
    .isString().withMessage('Dock name is required.')
    .trim()
    .notEmpty().withMessage('Dock name is required.')
    .isLength({ max: 100 }).withMessage('Dock name must not exceed 100 characters.'),
  body('zoneId')
    .optional({ values: 'falsy' })
    .isUUID().withMessage('Zone must be a valid zone ID, or empty for a shared dock.'),
  coordinatePairRule,
  body('arrivalModes')
    .optional({ values: 'null' })
    .isArray().withMessage('Arrival modes must be a list.')
    .custom((list) => list.every((m) => ARRIVAL_MODES.includes(m)))
    .withMessage('Arrival modes may only contain RAIL and ROAD.'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE']).withMessage('Status must be ACTIVE or INACTIVE.'),
  body('notes')
    .optional({ values: 'null' })
    .isString().withMessage('Notes must be text.')
    .isLength({ max: 500 }).withMessage('Notes must not exceed 500 characters.'),
];

const validateCreateDock = [...dockFieldRules];
const validateUpdateDock = [idParam('Loading dock'), ...dockFieldRules];
const validateDockId = [idParam('Loading dock')];

module.exports = {
  validateCreateZone,
  validateUpdateZone,
  validateZoneId,
  validateCreateDock,
  validateUpdateDock,
  validateDockId,
};
