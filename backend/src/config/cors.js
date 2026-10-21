/**
 * CORS Configuration
 *
 * Returns the cors() options object consumed by app.js.
 * The allowed origin is read exclusively from the FRONTEND_URL environment
 * variable — never from a hardcoded string.
 *
 * Deployment guide:
 *   Development  → FRONTEND_URL=http://localhost:5174
 *   Staging      → FRONTEND_URL=https://staging.warehouse.company.com
 *   Production   → FRONTEND_URL=https://warehouse.company.com
 *
 * No source code changes are required when deploying to a new environment;
 * only the environment variable value changes.
 *
 * Security notes:
 *   - `credentials: true` is required when the frontend sends cookies or
 *     Authorization headers. Pair this with a specific origin (never '*').
 *   - Exposed headers are whitelisted explicitly; wildcard exposure is avoided.
 */

'use strict';

const env = require('./env');

/**
 * Allowed origins, parsed from FRONTEND_URL.
 *
 * FRONTEND_URL may contain a single origin or a comma-separated list, e.g.
 *   FRONTEND_URL=http://localhost:5173,http://localhost:5174
 * This lets one backend accept the Vite dev server regardless of which port it
 * picks (5173 default, 5174 fallback) without code changes per environment.
 */
const ALLOWED_ORIGINS = env.FRONTEND_URL
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const corsConfig = {
  /**
   * Dynamic origin validation.
   * Using a function instead of a string lets us:
   *   1. Log rejected origins for security monitoring.
   *   2. Extend to a whitelist array later without restructuring.
   *
   * @param {string|undefined} origin - The Origin header from the request.
   * @param {function}         callback
   */
  origin: (origin, callback) => {
    // Allow requests with no Origin header (server-to-server, curl, Prisma Studio)
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // Reject and log any other origin
    console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
    return callback(
      new Error(`CORS policy does not allow access from origin: ${origin}`)
    );
  },

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],

  /**
   * Headers the browser is permitted to read from the response.
   * Add new custom headers here as the API grows (e.g. X-Request-ID).
   */
  exposedHeaders: [],

  /**
   * Allow cookies and Authorization headers in cross-origin requests.
   * Required for future JWT auth via httpOnly cookies.
   */
  credentials: true,

  /**
   * Cache duration for the pre-flight OPTIONS response (in seconds).
   * Reduces the number of OPTIONS round-trips during development and production.
   */
  maxAge: 86400, // 24 hours
};

module.exports = corsConfig;
