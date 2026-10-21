/**
 * Acting-User Resolver
 *
 * Shared helper for attributing a write to a real user. Until the auth module
 * lands there is no request-scoped user, so we fall back to an ADMIN (then any
 * user). Foreign-key columns such as Dispatch.requestedBy and
 * GateValidation.validatedBy are non-nullable / FK-constrained, so a real user
 * MUST exist.
 *
 * Accepts either the shared prisma singleton or a transaction client, so it can
 * be called inside or outside a `prisma.$transaction`.
 */

'use strict';

const AppError = require('./AppError');

/**
 * @param {import('@prisma/client').PrismaClient|import('@prisma/client').Prisma.TransactionClient} client
 * @param {string|null} [providedUserId]
 * @returns {Promise<string>} a valid user id
 * @throws {AppError} 400 when the provided id is unknown, 409 when no user exists
 */
const resolveActingUserId = async (client, providedUserId = null) => {
  if (providedUserId) {
    const user = await client.user.findUnique({ where: { id: providedUserId } });
    if (!user) {
      throw new AppError(`User with ID "${providedUserId}" was not found.`, 400);
    }
    return user.id;
  }

  const admin = await client.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) return admin.id;

  const anyUser = await client.user.findFirst();
  if (anyUser) return anyUser.id;

  throw new AppError(
    'No user exists to attribute this action to. Create a user first.',
    409
  );
};

module.exports = { resolveActingUserId };
