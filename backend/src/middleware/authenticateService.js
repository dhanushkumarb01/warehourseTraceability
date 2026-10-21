/**
 * authenticateService — trusted machine-to-machine auth for the AI service.
 *
 * The Python AI worker is a backend component, not a browser user, so it
 * authenticates with a shared service token (header `X-Service-Token`) rather
 * than a user JWT. Used only by the internal surveillance endpoints the worker
 * calls (camera list, alert ingest, heartbeat).
 *
 * This is deliberately separate from the user `authenticate`/`authorize`
 * middleware so the human RBAC model is never weakened. If AI_SERVICE_TOKEN is
 * not configured, these endpoints are closed (503) rather than open.
 */

'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const { sendError } = require('../utils/responseHelper');

/** Constant-time comparison to avoid token-timing leaks. */
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const authenticateService = (req, res, next) => {
  if (!env.AI_SERVICE_TOKEN) {
    return sendError(res, 503, 'AI service integration is not configured (AI_SERVICE_TOKEN unset).');
  }
  const provided = req.headers['x-service-token'] || '';
  if (!provided || !safeEqual(provided, env.AI_SERVICE_TOKEN)) {
    return sendError(res, 401, 'Invalid or missing service token.');
  }
  req.serviceCaller = 'ai-service';
  return next();
};

module.exports = authenticateService;
