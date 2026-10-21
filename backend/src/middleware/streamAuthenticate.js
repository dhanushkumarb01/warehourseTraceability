/**
 * streamAuthenticate — JWT auth for media endpoints.
 *
 * <video> and <img> elements cannot send an Authorization header, so playback
 * and HLS-manifest routes accept the access token either in the standard
 * `Authorization: Bearer` header OR in an `?access_token=` query parameter.
 *
 * This is a SEPARATE middleware so the primary `authenticate` middleware — used
 * by every other protected route — remains untouched. It enforces the same
 * guarantees: a live, active user is loaded from the database on every request.
 */

'use strict';

const prisma = require('../config/prisma');
const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/responseHelper');

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  if (req.query && typeof req.query.access_token === 'string' && req.query.access_token.trim()) {
    return req.query.access_token.trim();
  }
  return null;
};

const streamAuthenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return sendError(res, 401, 'Authentication required to view this stream.');

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Invalid authentication token.';
    return sendError(res, 401, message);
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, username: true, email: true, role: true, status: true },
  });
  if (!user) return sendError(res, 401, 'Account no longer exists.');
  if (user.status !== 'ACTIVE') return sendError(res, 403, 'Your account is inactive. Contact an administrator.');

  req.user = user;
  return next();
};

module.exports = streamAuthenticate;
