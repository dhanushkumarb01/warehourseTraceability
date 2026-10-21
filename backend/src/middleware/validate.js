/**
 * Validation Result Handler Middleware
 *
 * Reads the result produced by express-validator chains and, if violations
 * are found, terminates the request cycle with a structured 400 response.
 * Must be placed AFTER the validation chain array and BEFORE the controller
 * in the route definition.
 */

const { validationResult } = require('express-validator');
const { sendError } = require('../utils/responseHelper');

const handleValidationErrors = (req, res, next) => {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    // Normalise to a consistent shape: [{ field, message }]
    const errors = result.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));

    return sendError(res, 400, 'Validation failed. Please correct the highlighted fields.', errors);
  }

  return next();
};

module.exports = handleValidationErrors;
