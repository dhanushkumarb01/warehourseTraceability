/**
 * Authorization Middleware
 *
 * Centralised role-based access control. Must run AFTER `authenticate` so
 * req.user is populated. Usage in routes:
 *
 *   router.post('/', authenticate, authorize(GROUPS.BAY_WRITE), controller.create);
 *   router.post('/:id/approve', authenticate, authorize(ROLES.ADMIN, ROLES.SUPERVISOR), ...);
 *
 * Accepts either spread role strings or a single array of roles, so the
 * reusable GROUPS from config/roles.js can be passed directly.
 */

'use strict';

const { sendError } = require('../utils/responseHelper');

const authorize = (...allowed) => {
  // Allow authorize(GROUPS.X) where X is an array, or authorize('ADMIN','SUPERVISOR').
  const roles = allowed.length === 1 && Array.isArray(allowed[0]) ? allowed[0] : allowed;

  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required. Please log in.');
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        'You do not have permission to perform this action.'
      );
    }
    return next();
  };
};

module.exports = authorize;
