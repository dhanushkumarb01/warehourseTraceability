const prisma = require('../config/prisma');

/**
 * Log an audit action to the database.
 * 
 * @param {string} module - The module name (e.g. 'MATERIAL', 'MATERIAL_LOT', 'QR')
 * @param {string} action - The action performed (e.g. 'CREATE', 'UPDATE', 'DELETE', 'GENERATE', 'DOWNLOAD')
 * @param {string} entityId - The ID of the affected entity
 * @param {string} remarks - Additional optional context
 * @param {string} userId - The ID of the user performing the action.
 */
const logAction = async (module, action, entityId, remarks = null, userId = null) => {
  try {
    // In dev phase without active auth context, fetch an admin user to link the audit log.
    let activeUserId = userId;
    if (!activeUserId) {
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (admin) activeUserId = admin.id;
    }

    if (activeUserId) {
      await prisma.auditLog.create({
        data: {
          userId: activeUserId,
          module,
          action,
          entityId,
          remarks
        }
      });
    }
  } catch (error) {
    console.error('Audit Logging failed:', error);
  }
};

/**
 * Read audit logs (ADMIN / MANAGER). Optional filtering by module/action and a
 * capped result limit. Includes the acting user (sans password) for display.
 *
 * @param {{ module?: string, action?: string, limit?: number }} [filters]
 */
const getLogs = async (filters = {}) => {
  const { module, action, limit = 200 } = filters;
  const where = {};
  if (module) where.module = module;
  if (action) where.action = action;

  return prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, username: true, role: true } } },
    orderBy: { timestamp: 'desc' },
    take: Math.min(Number(limit) || 200, 1000),
  });
};

module.exports = {
  logAction,
  getLogs
};
