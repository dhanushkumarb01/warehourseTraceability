/**
 * RFID Validators (Phase 10)
 */

'use strict';

const { body, param } = require('express-validator');

const STAGES = ['ENTRY_GATE', 'WEIGH_BRIDGE_1', 'LOADING_DOCK', 'WEIGH_BRIDGE_2', 'INVOICE', 'PARKING', 'EXIT_GATE'];
const READER_STATUSES = ['ONLINE', 'OFFLINE', 'MAINTENANCE'];

const validateCreateReader = [
  body('readerCode').trim().notEmpty().withMessage('Reader code is required.').isLength({ max: 40 }),
  body('readerName').trim().notEmpty().withMessage('Reader name is required.').isLength({ max: 100 }),
  body('readerType').optional({ nullable: true }).isString().isLength({ max: 40 }),
  body('stage').isIn(STAGES).withMessage(`stage must be one of: ${STAGES.join(', ')}.`),
  body('ipAddress').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('location').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('status').optional().isIn(READER_STATUSES),
];

const validateUpdateReader = [
  param('id').isUUID().withMessage('Reader ID must be a valid UUID.'),
  body('readerCode').optional().trim().notEmpty().isLength({ max: 40 }),
  body('readerName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('readerType').optional({ nullable: true }).isString().isLength({ max: 40 }),
  body('stage').optional().isIn(STAGES),
  body('ipAddress').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('location').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('status').optional().isIn(READER_STATUSES),
];

const validateReaderId = [param('id').isUUID().withMessage('Reader ID must be a valid UUID.')];

/**
 * Event ingestion — the single pipeline. Must identify a truck (tag/id/number)
 * and a reader (id/code) OR an explicit stage. Cross-field checks happen in the
 * service so hardware and the simulator share identical validation.
 */
const validateIngestEvent = [
  body().custom((value) => {
    if (!value || typeof value !== 'object') throw new Error('Request body is required.');
    if (!value.rfidTag && !value.truckId && !value.truckNumber) throw new Error('A truck identifier (rfidTag, truckId or truckNumber) is required.');
    if (!value.readerId && !value.readerCode && !value.stage) throw new Error('A reader (readerId/readerCode) or an explicit stage is required.');
    if (value.stage && !STAGES.includes(value.stage)) throw new Error(`stage must be one of: ${STAGES.join(', ')}.`);
    return true;
  }),
  body('truckId').optional({ nullable: true }).isUUID(),
  body('readerId').optional({ nullable: true }).isUUID(),
  body('eventTime').optional({ nullable: true }).isISO8601().withMessage('eventTime must be an ISO-8601 timestamp.'),
];

module.exports = { validateCreateReader, validateUpdateReader, validateReaderId, validateIngestEvent };
