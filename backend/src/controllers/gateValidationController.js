/**
 * Gate Validation Controller
 *
 * HTTP layer for the Exit Gate Validation module.
 */

'use strict';

const gateService = require('../services/gateValidationService');
const { sendSuccess } = require('../utils/responseHelper');

/** POST /api/gate-validations/scan/resolve */
const resolveScan = async (req, res) => {
  const result = await gateService.resolveScan(req.body);
  sendSuccess(res, 200, 'Scan resolved successfully.', result);
};

/** POST /api/gate-validations/exit */
const processExit = async (req, res) => {
  // Validator is always the authenticated user, never a client-supplied value.
  const result = await gateService.processGateExit({ ...req.body, validatedBy: req.user.id });
  const message = result.decision === 'EXITED'
    ? 'Gate exit authorised. Material has left the warehouse.'
    : `Gate exit denied: ${result.reason}`;
  sendSuccess(res, 200, message, result);
};

/** GET /api/gate-validations  (optional ?status=) */
const getAll = async (req, res) => {
  const records = await gateService.getAllGateValidations(req.query.status || null);
  sendSuccess(res, 200, 'Gate validations retrieved successfully.', records);
};

/** GET /api/gate-validations/pending */
const getPending = async (req, res) => {
  const records = await gateService.getPendingExits();
  sendSuccess(res, 200, 'Pending gate exits retrieved successfully.', records);
};

/** GET /api/gate-validations/summary */
const getSummary = async (req, res) => {
  const summary = await gateService.getDashboardSummary();
  sendSuccess(res, 200, 'Gate validation summary retrieved successfully.', summary);
};

/** GET /api/gate-validations/:id */
const getById = async (req, res) => {
  const record = await gateService.getGateValidationById(req.params.id);
  sendSuccess(res, 200, 'Gate validation retrieved successfully.', record);
};

module.exports = {
  resolveScan,
  processExit,
  getAll,
  getPending,
  getSummary,
  getById,
};
