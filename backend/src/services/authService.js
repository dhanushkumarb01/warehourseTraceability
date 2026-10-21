/**
 * Authentication Service
 *
 * Owns all auth business logic: login, self-service profile/password, and the
 * user-creation primitive shared by admin registration and the bootstrap seed.
 * Controllers never touch Prisma or bcrypt directly.
 *
 * Security notes:
 *   - Passwords are bcrypt-hashed via utils/password — plaintext is never
 *     stored, returned or logged.
 *   - Login failures return a single generic message to avoid user enumeration.
 *   - The password field is stripped from every user object returned to callers.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { ALL_ROLES } = require('../config/roles');

/** Strip sensitive fields before returning a user to any caller. */
const sanitize = (user) => {
  if (!user) return user;
  const { password, ...safe } = user;
  return safe;
};

/**
 * Create a user (shared by admin registration and the bootstrap seed).
 * @param {{ username, email, password, role, status? }} data
 * @param {string|null} actorId  - who is creating (for audit); null for bootstrap
 */
const createUser = async (data, actorId = null) => {
  const { username, email, password, role, status = 'ACTIVE' } = data;

  if (!ALL_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${ALL_ROLES.join(', ')}.`, 400);
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    const field = existing.username === username ? 'username' : 'email';
    throw new AppError(`A user with this ${field} already exists.`, 409);
  }

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, email, password: hashed, role, status },
  });

  await auditService.logAction('USER', 'CREATE', user.id, `Created user ${username} (${role})`, actorId);
  return sanitize(user);
};

/**
 * Authenticate a user by username OR email and issue a JWT.
 * @param {{ identifier: string, password: string }} input
 * @returns {Promise<{ token: string, user: object }>}
 */
const login = async ({ identifier, password }) => {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });

  // Generic failure message — never reveal whether the account exists.
  const invalid = new AppError('Invalid username or password.', 401);
  if (!user) throw invalid;

  const matches = await verifyPassword(password, user.password);
  if (!matches) throw invalid;

  if (user.status !== 'ACTIVE') {
    throw new AppError('Your account is inactive. Contact an administrator.', 403);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  await auditService.logAction('AUTH', 'LOGIN', user.id, `User ${user.username} logged in`, user.id);

  const token = signToken({ id: user.id, role: user.role, username: user.username });
  return { token, user: sanitize(updated) };
};

/** Record a logout (stateless JWT — this is for the audit trail only). */
const logout = async (userId) => {
  await auditService.logAction('AUTH', 'LOGOUT', userId, 'User logged out', userId);
  return true;
};

/** Current authenticated user's full profile. */
const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found.', 404);
  return sanitize(user);
};

/**
 * Self-service profile update (email / username only — never role or status).
 */
const updateProfile = async (userId, { username, email }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found.', 404);

  if (username && username !== user.username) {
    const clash = await prisma.user.findUnique({ where: { username } });
    if (clash) throw new AppError('That username is already taken.', 409);
  }
  if (email && email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash) throw new AppError('That email is already in use.', 409);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { username: username ?? user.username, email: email ?? user.email },
  });
  await auditService.logAction('USER', 'UPDATE_PROFILE', userId, 'Profile updated', userId);
  return sanitize(updated);
};

/** Change own password (requires the current password). */
const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found.', 404);

  const matches = await verifyPassword(currentPassword, user.password);
  if (!matches) throw new AppError('Current password is incorrect.', 400);

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  await auditService.logAction('USER', 'CHANGE_PASSWORD', userId, 'Password changed', userId);
  return true;
};

module.exports = {
  sanitize,
  createUser,
  login,
  logout,
  getCurrentUser,
  updateProfile,
  changePassword,
};
