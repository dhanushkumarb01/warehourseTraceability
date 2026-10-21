/**
 * Authentication Middleware
 *
 * Verifies the Bearer JWT on incoming requests and attaches the live user to
 * req.user. Loading the user from the database on each request (rather than
 * trusting the token blindly) ensures deactivated/deleted accounts lose access
 * immediately.
 *
 * On any failure it responds 401 — it never calls next() with a half-populated
 * req.user, so downstream authorize() checks can rely on req.user existing.
 */

'use strict';

const prisma = require('../config/prisma');
const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/responseHelper');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return sendError(res, 401, 'Authentication required. Please log in.');
  }

  const token = header.slice(7).trim();
  if (!token) {
    return sendError(res, 401, 'Authentication required. Please log in.');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Invalid authentication token.';
    return sendError(res, 401, message);
  }

  // Confirm the user still exists and is active.
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, username: true, email: true, role: true, status: true },
  });

  if (!user) {
    return sendError(res, 401, 'Account no longer exists.');
  }
  if (user.status !== 'ACTIVE') {
    return sendError(res, 403, 'Your account is inactive. Contact an administrator.');
  }

  req.user = user;
  return next();
};

module.exports = authenticate;
