/**
 * Bay Controller
 *
 * Handles HTTP concerns only: extracting request data, calling the service,
 * and forming the response. Contains zero business logic.
 *
 * All async errors are passed to `next(err)` so the global error handler
 * processes them uniformly — no try/catch boilerplate is needed here because
 * Express 5 (which this project uses) auto-propagates async rejections.
 *
 * If the project ever moves to Express 4, wrap each handler with a
 * try/catch or use the `express-async-errors` package.
 */

const bayService = require('../services/bayService');
const { sendSuccess } = require('../utils/responseHelper');

/**
 * GET /api/bays
 * Returns all bays.
 */
const getAllBays = async (req, res, next) => {
  const bays = await bayService.getAllBays();
  sendSuccess(res, 200, 'Bays retrieved successfully.', bays);
};

/**
 * GET /api/bays/:id
 * Returns a single bay by UUID.
 */
const getBayById = async (req, res, next) => {
  const bay = await bayService.getBayById(req.params.id);
  sendSuccess(res, 200, 'Bay retrieved successfully.', bay);
};

/**
 * POST /api/bays
 * Creates a new bay.
 */
const createBay = async (req, res, next) => {
  const bay = await bayService.createBay(req.body);
  sendSuccess(res, 201, 'Bay created successfully.', bay);
};

/**
 * PUT /api/bays/:id
 * Replaces all mutable fields of an existing bay.
 */
const updateBay = async (req, res, next) => {
  const bay = await bayService.updateBay(req.params.id, req.body);
  sendSuccess(res, 200, 'Bay updated successfully.', bay);
};

/**
 * DELETE /api/bays/:id
 * Permanently removes a bay record.
 */
const deleteBay = async (req, res, next) => {
  await bayService.deleteBay(req.params.id);
  sendSuccess(res, 200, 'Bay deleted successfully.');
};

module.exports = {
  getAllBays,
  getBayById,
  createBay,
  updateBay,
  deleteBay,
};
