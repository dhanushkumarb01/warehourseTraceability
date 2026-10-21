/**
 * User Management Service (ADMIN)
 *
 * Administrative user operations: list, view, update (role/status), and
 * activate/deactivate. Creation is delegated to authService.createUser so
 * hashing logic lives in one place.
 *
 * Safety guards prevent the system from locking itself out:
 *   - An admin cannot deactivate or demote their own account.
 *   - The last remaining ACTIVE admin cannot be deactivated or demoted.
 */

'use strict';

const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const authService = require('./authService');
const { ALL_ROLES, ROLES } = require('../config/roles');

const listUsers = async () => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return users.map(authService.sanitize);
};

const getUserById = async (id) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(`User with ID "${id}" was not found.`, 404);
  return authService.sanitize(user);
};

/** Count active admins other than `exceptId`. */
const otherActiveAdmins = (exceptId) =>
  prisma.user.count({ where: { role: ROLES.ADMIN, status: 'ACTIVE', id: { not: exceptId } } });

/**
 * Update a user's username/email/role/status (admin only).
 */
const updateUser = async (id, data, actorId) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(`User with ID "${id}" was not found.`, 404);

  if (data.role && !ALL_ROLES.includes(data.role)) {
    throw new AppError(`Invalid role. Must be one of: ${ALL_ROLES.join(', ')}.`, 400);
  }

  // Uniqueness checks for changed identity fields.
  if (data.username && data.username !== user.username) {
    const clash = await prisma.user.findUnique({ where: { username: data.username } });
    if (clash) throw new AppError('That username is already taken.', 409);
  }
  if (data.email && data.email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email: data.email } });
    if (clash) throw new AppError('That email is already in use.', 409);
  }

  // Lock-out guards.
  const demotingAdmin = user.role === ROLES.ADMIN && data.role && data.role !== ROLES.ADMIN;
  const deactivating = data.status === 'INACTIVE' && user.status === 'ACTIVE';
  if ((demotingAdmin || deactivating) && user.role === ROLES.ADMIN) {
    if ((await otherActiveAdmins(id)) === 0) {
      throw new AppError('Cannot demote or deactivate the last active administrator.', 409);
    }
  }
  if (deactivating && id === actorId) {
    throw new AppError('You cannot deactivate your own account.', 409);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      username: data.username ?? user.username,
      email: data.email ?? user.email,
      role: data.role ?? user.role,
      status: data.status ?? user.status,
    },
  });

  await auditService.logAction('USER', 'UPDATE', id, `Updated user ${updated.username}`, actorId);
  return authService.sanitize(updated);
};

const setStatus = async (id, status, actorId) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(`User with ID "${id}" was not found.`, 404);

  if (status === 'INACTIVE') {
    if (id === actorId) throw new AppError('You cannot deactivate your own account.', 409);
    if (user.role === ROLES.ADMIN && (await otherActiveAdmins(id)) === 0) {
      throw new AppError('Cannot deactivate the last active administrator.', 409);
    }
  }

  const updated = await prisma.user.update({ where: { id }, data: { status } });
  await auditService.logAction('USER', status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE', id, `User ${updated.username} set ${status}`, actorId);
  return authService.sanitize(updated);
};

module.exports = {
  listUsers,
  getUserById,
  updateUser,
  deactivateUser: (id, actorId) => setStatus(id, 'INACTIVE', actorId),
  activateUser: (id, actorId) => setStatus(id, 'ACTIVE', actorId),
};
