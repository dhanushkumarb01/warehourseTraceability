/**
 * Auth Controller
 *
 * HTTP layer for authentication and self-service profile endpoints.
 */

'use strict';

const authService = require('../services/authService');
const { sendSuccess } = require('../utils/responseHelper');

/** POST /api/auth/login */
const login = async (req, res) => {
  const result = await authService.login(req.body);
  sendSuccess(res, 200, 'Login successful.', result);
};

/** POST /api/auth/logout  (authenticated) */
const logout = async (req, res) => {
  await authService.logout(req.user.id);
  sendSuccess(res, 200, 'Logged out successfully.');
};

/** POST /api/auth/register  (ADMIN) */
const register = async (req, res) => {
  const user = await authService.createUser(req.body, req.user.id);
  sendSuccess(res, 201, 'User created successfully.', user);
};

/** GET /api/auth/me  (authenticated) */
const me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  sendSuccess(res, 200, 'Current user retrieved.', user);
};

/** PUT /api/auth/profile  (authenticated) */
const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(req.user.id, req.body);
  sendSuccess(res, 200, 'Profile updated.', user);
};

/** PUT /api/auth/password  (authenticated) */
const changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  sendSuccess(res, 200, 'Password changed successfully.');
};

module.exports = { login, logout, register, me, updateProfile, changePassword };
