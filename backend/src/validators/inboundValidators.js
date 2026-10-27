/**
 * Inbound Validators — FOIS / SAP rail consignments.
 */

'use strict';

const { body, query } = require('express-validator');
const { SOURCES } = require('../inbound/consignment');

const validateListPending = [
  query('source')
    .optional({ values: 'falsy' })
    .isIn(SOURCES).withMessage(`source must be one of: ${SOURCES.join(', ')}.`),
  query('search').optional().isString().isLength({ max: 100 }),
];

const validateImport = [
  body('source').isIn(SOURCES).withMessage(`source must be one of: ${SOURCES.join(', ')}.`),
  body('externalRef')
    .isString().withMessage('externalRef is required.')
    .trim()
    .notEmpty().withMessage('externalRef is required.')
    .isLength({ max: 50 }).withMessage('externalRef must not exceed 50 characters.'),
];

module.exports = { validateListPending, validateImport };
