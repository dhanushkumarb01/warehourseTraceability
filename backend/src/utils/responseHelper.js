/**
 * Response Helper Utilities
 *
 * Centralises the JSON response envelope so that every API response follows
 * the same contract. Consumers (frontend, SAP integration, etc.) can rely on
 * the presence of `success`, `message`, and either `data` or `errors`.
 */

/**
 * Send a successful response.
 *
 * @param {import('express').Response} res
 * @param {number}  statusCode  - HTTP status (200, 201, …)
 * @param {string}  message     - Human-readable success message
 * @param {*}       [data]      - Payload to include (object, array, null)
 */
const sendSuccess = (res, statusCode, message, data = null) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
};

/**
 * Send an error response.
 *
 * @param {import('express').Response} res
 * @param {number}  statusCode  - HTTP status (400, 404, 409, 500, …)
 * @param {string}  message     - Human-readable error message
 * @param {Array}   [errors]    - Optional array of validation/field errors
 */
const sendError = (res, statusCode, message, errors = null) => {
  const body = { success: false, message };
  if (errors !== null) body.errors = errors;
  return res.status(statusCode).json(body);
};

module.exports = { sendSuccess, sendError };
