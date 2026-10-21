/**
 * User Routes — mounted at /api/users  (ADMIN only)
 *
 *   GET  /api/users                  List users
 *   GET  /api/users/:id              Single user
 *   PUT  /api/users/:id              Update user (role/status/identity)
 *   POST /api/users/:id/deactivate   Deactivate user
 *   POST /api/users/:id/activate     Activate user
 *
 * Creation is handled by POST /api/auth/register (also ADMIN-gated).
 */

'use strict';

const { Router } = require('express');
const userController = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');
const { validateUserId, validateUpdateUser } = require('../validators/authValidators');
const handleValidationErrors = require('../middleware/validate');

const router = Router();

// Every user route requires an authenticated ADMIN.
router.use(authenticate, authorize(GROUPS.USER_ADMIN));

router.get('/', userController.list);
router.get('/:id', validateUserId, handleValidationErrors, userController.getById);
router.put('/:id', validateUpdateUser, handleValidationErrors, userController.update);
router.post('/:id/deactivate', validateUserId, handleValidationErrors, userController.deactivate);
router.post('/:id/activate', validateUserId, handleValidationErrors, userController.activate);

module.exports = router;
