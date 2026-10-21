/**
 * Dispatch Controller
 *
 * HTTP layer for the Dispatch module. Express 5 auto-propagates async
 * rejections to the global error handler, so no try/catch is needed.
 */

'use strict';

const dispatchService = require('../services/dispatchService');
const { sendSuccess } = require('../utils/responseHelper');

/** POST /api/dispatches */
const createDispatch = async (req, res) => {
  // Requester is always the authenticated user, never a client-supplied value.
  const dispatch = await dispatchService.createDispatch({ ...req.body, requestedBy: req.user.id });
  sendSuccess(res, 201, 'Dispatch request created successfully.', dispatch);
};

/** POST /api/dispatches/:id/approve */
const approveDispatch = async (req, res) => {
  const dispatch = await dispatchService.approveDispatch({ id: req.params.id, ...req.body, approvedBy: req.user.id });
  sendSuccess(res, 200, 'Dispatch approved successfully.', dispatch);
};

/** POST /api/dispatches/:id/reject */
const rejectDispatch = async (req, res) => {
  const dispatch = await dispatchService.rejectDispatch({ id: req.params.id, ...req.body, approvedBy: req.user.id });
  sendSuccess(res, 200, 'Dispatch rejected.', dispatch);
};

/** POST /api/dispatches/:id/cancel */
const cancelDispatch = async (req, res) => {
  const dispatch = await dispatchService.cancelDispatch({ id: req.params.id, ...req.body, requestedBy: req.user.id });
  sendSuccess(res, 200, 'Dispatch cancelled.', dispatch);
};

/** GET /api/dispatches  (optional ?status=) */
const getAllDispatches = async (req, res) => {
  const dispatches = await dispatchService.getAllDispatches(req.query.status || null);
  sendSuccess(res, 200, 'Dispatches retrieved successfully.', dispatches);
};

/** GET /api/dispatches/pending */
const getPending = async (req, res) => {
  const dispatches = await dispatchService.getPendingDispatches();
  sendSuccess(res, 200, 'Pending dispatches retrieved successfully.', dispatches);
};

/** GET /api/dispatches/approved */
const getApproved = async (req, res) => {
  const dispatches = await dispatchService.getApprovedDispatches();
  sendSuccess(res, 200, 'Approved dispatches retrieved successfully.', dispatches);
};

/** GET /api/dispatches/summary */
const getSummary = async (req, res) => {
  const summary = await dispatchService.getDashboardSummary();
  sendSuccess(res, 200, 'Dispatch summary retrieved successfully.', summary);
};

/** GET /api/dispatches/lot/:lotId/history */
const getHistory = async (req, res) => {
  const history = await dispatchService.getDispatchHistory(req.params.lotId);
  sendSuccess(res, 200, 'Dispatch history retrieved successfully.', history);
};

/** GET /api/dispatches/:id */
const getById = async (req, res) => {
  const dispatch = await dispatchService.getDispatchById(req.params.id);
  sendSuccess(res, 200, 'Dispatch retrieved successfully.', dispatch);
};

module.exports = {
  createDispatch,
  approveDispatch,
  rejectDispatch,
  cancelDispatch,
  getAllDispatches,
  getPending,
  getApproved,
  getSummary,
  getHistory,
  getById,
};
