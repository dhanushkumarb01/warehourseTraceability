/**
 * Bay Routes
 *
 * Registers all Bay API endpoints under the /api/bays prefix.
 * Route files contain ONLY:
 *   1. Validation chains
 *   2. The validation result middleware
 *   3. The controller handler
 *
 * No business logic. No Prisma. No response formatting.
 */

const { Router } = require('express');
const bayController = require('../controllers/bayController');
const {
  validateCreateBay,
  validateUpdateBay,
  validateBayId,
} = require('../validators/bayValidators');
const handleValidationErrors = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');

const router = Router();

// All bay endpoints require authentication. Reads are open to any role;
// writes are restricted to the bay-management group (ADMIN, SUPERVISOR).
router.use(authenticate);

/**
 * GET /api/bays
 * Retrieve all bays.
 */
router.get('/', bayController.getAllBays);

/**
 * GET /api/bays/:id
 * Retrieve a single bay by UUID.
 */
router.get('/:id', validateBayId, handleValidationErrors, bayController.getBayById);

/**
 * POST /api/bays
 * Create a new bay.
 */
router.post('/', authorize(GROUPS.BAY_WRITE), validateCreateBay, handleValidationErrors, bayController.createBay);

/**
 * PUT /api/bays/:id
 * Update an existing bay (full replacement of mutable fields).
 */
router.put('/:id', authorize(GROUPS.BAY_WRITE), validateUpdateBay, handleValidationErrors, bayController.updateBay);

/**
 * DELETE /api/bays/:id
 * Permanently delete a bay.
 */
router.delete('/:id', authorize(GROUPS.BAY_WRITE), validateBayId, handleValidationErrors, bayController.deleteBay);

module.exports = router;
