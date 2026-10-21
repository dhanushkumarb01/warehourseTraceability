/**
 * Audit Controller (ADMIN / MANAGER)
 *
 * Read-only access to the audit trail.
 */

'use strict';

const auditService = require('../services/auditService');
const { sendSuccess } = require('../utils/responseHelper');

/** GET /api/audit-logs  (?module= &action= &limit=) */
const getLogs = async (req, res) => {
  const logs = await auditService.getLogs({
    module: req.query.module,
    action: req.query.action,
    limit: req.query.limit,
  });
  sendSuccess(res, 200, 'Audit logs retrieved successfully.', logs);
};

module.exports = { getLogs };
