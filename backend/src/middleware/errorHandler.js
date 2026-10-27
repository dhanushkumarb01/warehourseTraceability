/**
 * Global Error Handler Middleware
 *
 * Must be registered as the LAST middleware in app.js (after all routes).
 * Express identifies a 4-argument function as an error handler.
 *
 * Responsibilities:
 *   - Handle known Prisma constraint violations (P2002 → 409 Conflict)
 *   - Handle operational AppErrors (expose message to client)
 *   - Hide internal details for unexpected errors (500 response)
 *   - Never log stack traces to the client
 */

const AppError = require('../utils/AppError');
const { sendError } = require('../utils/responseHelper');

/**
 * Map Prisma error codes to AppError instances.
 * Add additional codes here as new modules introduce new constraints.
 *
 * @param {Error} err
 * @returns {AppError|null}
 */
const handlePrismaError = (err) => {
  // Unique constraint violation
  if (err.code === 'P2002') {
    // target is an array of columns, or an index name for raw (partial) indexes.
    const target = err.meta?.target;
    const field = (Array.isArray(target) ? target.join(', ') : target) || 'field';
    return new AppError(`A record with this ${field} already exists.`, 409);
  }

  // Record not found (e.g. update/delete on non-existent record)
  if (err.code === 'P2025') {
    return new AppError('The requested record was not found.', 404);
  }

  // Foreign key constraint failed
  if (err.code === 'P2003') {
    return new AppError('A related record does not exist.', 400);
  }

  return null;
};

// eslint-disable-next-line no-unused-vars
const globalErrorHandler = (err, req, res, next) => {
  // Attempt to map Prisma-specific errors first
  const prismaError = handlePrismaError(err);
  if (prismaError) {
    return sendError(res, prismaError.statusCode, prismaError.message);
  }

  // Operational errors are intentional and safe to expose
  if (err.isOperational) {
    return sendError(res, err.statusCode, err.message);
  }

  // Unknown / programmer errors — log server-side, return generic message
  console.error('[UNHANDLED ERROR]', err);
  return sendError(res, 500, 'An unexpected error occurred. Please try again later.');
};

module.exports = globalErrorHandler;
