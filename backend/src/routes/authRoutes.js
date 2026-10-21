/**
 * Auth Routes — mounted at /api/auth
 *
 *   POST /api/auth/login        Public — authenticate, receive a JWT
 *   POST /api/auth/logout       Auth   — record logout (stateless JWT)
 *   POST /api/auth/register     ADMIN  — create a new user
 *   GET  /api/auth/me           Auth   — current user profile
 *   PUT  /api/auth/profile      Auth   — update own username/email
 *   PUT  /api/auth/password     Auth   — change own password
 */

'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { GROUPS } = require('../config/roles');
const {
  validateLogin,
  validateRegister,
  validateUpdateProfile,
  validateChangePassword,
} = require('../validators/authValidators');
const handleValidationErrors = require('../middleware/validate');

const router = Router();

router.post('/login', validateLogin, handleValidationErrors, authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/register', authenticate, authorize(GROUPS.USER_ADMIN), validateRegister, handleValidationErrors, authController.register);
router.get('/me', authenticate, authController.me);
router.put('/profile', authenticate, validateUpdateProfile, handleValidationErrors, authController.updateProfile);
router.put('/password', authenticate, validateChangePassword, handleValidationErrors, authController.changePassword);

module.exports = router;
