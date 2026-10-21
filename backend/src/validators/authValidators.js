/**
 * Auth & User Validators
 *
 * express-validator chains for authentication, profile and user-management
 * endpoints. Enforces strong password rules and role/status whitelists to
 * prevent privilege escalation via crafted payloads.
 */

'use strict';

const { body, param } = require('express-validator');
const { ALL_ROLES } = require('../config/roles');

const USER_STATUSES = ['ACTIVE', 'INACTIVE'];

const strongPassword = (field) =>
  body(field)
    .isString().withMessage(`${field} must be a string.`)
    .isLength({ min: 8, max: 100 }).withMessage('Password must be 8–100 characters.')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter.')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.');

const validateLogin = [
  body('identifier').trim().notEmpty().withMessage('Username or email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

const validateRegister = [
  body('username').trim().notEmpty().withMessage('Username is required.').isLength({ max: 50 }),
  body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  strongPassword('password'),
  body('role').isIn(ALL_ROLES).withMessage(`Role must be one of: ${ALL_ROLES.join(', ')}.`),
  body('status').optional().isIn(USER_STATUSES).withMessage(`Status must be one of: ${USER_STATUSES.join(', ')}.`),
];

const validateUpdateProfile = [
  body('username').optional().trim().notEmpty().withMessage('Username cannot be empty.').isLength({ max: 50 }),
  body('email').optional().trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
];

const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  strongPassword('newPassword'),
];

const validateUserId = [
  param('id').isUUID().withMessage('User ID must be a valid UUID.'),
];

const validateUpdateUser = [
  ...validateUserId,
  body('username').optional().trim().notEmpty().isLength({ max: 50 }),
  body('email').optional().trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('role').optional().isIn(ALL_ROLES).withMessage(`Role must be one of: ${ALL_ROLES.join(', ')}.`),
  body('status').optional().isIn(USER_STATUSES).withMessage(`Status must be one of: ${USER_STATUSES.join(', ')}.`),
];

module.exports = {
  validateLogin,
  validateRegister,
  validateUpdateProfile,
  validateChangePassword,
  validateUserId,
  validateUpdateUser,
};
