/**
 * Dispatch Routes — mounted at /api/dispatches
 *
 *   POST   /api/dispatches                      Create a dispatch request
 *   POST   /api/dispatches/:id/approve          Approve a pending dispatch
 *   POST   /api/dispatches/:id/reject           Reject a pending dispatch
 *   POST   /api/dispatches/:id/cancel           Cancel a pending/approved dispatch
 *   GET    /api/dispatches                       All dispatches (optional ?status=)
 *   GET    /api/dispatches/pending               Pending dispatches
 *   GET    /api/dispatches/approved              Approved dispatches
 *   GET    /api/dispatches/summary               Dashboard counts
 *   GET    /api/dispatches/lot/:lotId/history    Dispatch history for a lot
 *   GET    /api/dispatches/:id                    Single dispatch
 *
 * Specific literal paths are declared BEFORE the '/:id' param route so they are
 * never shadowed by it.
 */

'use strict';

const { Router } = require('express');
const dispatchController = require('../controllers/dispatchController');
const {
  validateCreateDispatch,
  validateApprove,
  validateReject,
  validateCancel,
  validateDispatchId,
  validateLotIdParam,
  validateListQuery,
} = require('../validators/dispatchValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

// Authenticated for all. Create/cancel = operations group; approve/reject =
// dispatch-approve group (ADMIN, SUPERVISOR); reads = any authenticated role.
router.use(authenticate);

// Writes
router.post('/', authorize(GROUPS.DISPATCH_CREATE), validateCreateDispatch, handleValidationErrors, dispatchController.createDispatch);
router.post('/:id/approve', authorize(GROUPS.DISPATCH_APPROVE), validateApprove, handleValidationErrors, dispatchController.approveDispatch);
router.post('/:id/reject', authorize(GROUPS.DISPATCH_APPROVE), validateReject, handleValidationErrors, dispatchController.rejectDispatch);
router.post('/:id/cancel', authorize(GROUPS.DISPATCH_CREATE), validateCancel, handleValidationErrors, dispatchController.cancelDispatch);

// Reads — literal paths first
router.get('/pending', dispatchController.getPending);
router.get('/approved', dispatchController.getApproved);
router.get('/summary', dispatchController.getSummary);
router.get('/lot/:lotId/history', validateLotIdParam, handleValidationErrors, dispatchController.getHistory);
router.get('/', validateListQuery, handleValidationErrors, dispatchController.getAllDispatches);
router.get('/:id', validateDispatchId, handleValidationErrors, dispatchController.getById);

module.exports = router;
