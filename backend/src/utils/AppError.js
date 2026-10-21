/**
 * AppError — Custom operational error class.
 *
 * Distinguishes application-level errors (validation failures, not-found,
 * conflicts) from unexpected programmer errors. The global error handler
 * checks `isOperational` to decide whether to expose the message to clients.
 */

class AppError extends Error {
  /**
   * @param {string} message   - Human-readable error message safe for clients.
   * @param {number} statusCode - HTTP status code (400, 404, 409, etc.).
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    // Preserve the original stack trace, excluding the constructor call.
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
