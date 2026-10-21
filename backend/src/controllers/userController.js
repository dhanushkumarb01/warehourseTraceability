/**
 * User Controller (ADMIN)
 *
 * HTTP layer for administrative user management.
 */

'use strict';

const userService = require('../services/userService');
const { sendSuccess } = require('../utils/responseHelper');

/** GET /api/users */
const list = async (req, res) => {
  const users = await userService.listUsers();
  sendSuccess(res, 200, 'Users retrieved successfully.', users);
};

/** GET /api/users/:id */
const getById = async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  sendSuccess(res, 200, 'User retrieved successfully.', user);
};

/** PUT /api/users/:id */
const update = async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.user.id);
  sendSuccess(res, 200, 'User updated successfully.', user);
};

/** POST /api/users/:id/deactivate */
const deactivate = async (req, res) => {
  const user = await userService.deactivateUser(req.params.id, req.user.id);
  sendSuccess(res, 200, 'User deactivated.', user);
};

/** POST /api/users/:id/activate */
const activate = async (req, res) => {
  const user = await userService.activateUser(req.params.id, req.user.id);
  sendSuccess(res, 200, 'User activated.', user);
};

module.exports = { list, getById, update, deactivate, activate };
