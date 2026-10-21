/**
 * Frontend API Configuration
 *
 * Single source of truth for all API-related configuration values on the
 * frontend. No component, service, or hook may reference import.meta.env
 * or construct API URLs directly — they must import from this file.
 *
 * Environment variable:
 *   VITE_API_BASE_URL — set in .env (or .env.local for local overrides).
 *
 * Deployment guide:
 *   Development  → VITE_API_BASE_URL=http://localhost:5000/api
 *   Staging      → VITE_API_BASE_URL=https://staging.warehouse.company.com/api
 *   Production   → VITE_API_BASE_URL=https://warehouse.company.com/api
 *
 * Only the .env file changes per environment — no source code modifications.
 */

/**
 * Validate that the required Vite environment variable is defined.
 * Vite replaces import.meta.env values at build time, so a missing variable
 * will result in `undefined` — we want a clear error rather than a silent
 * failure that surfaces only at runtime as a network error.
 */
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!rawBaseUrl || rawBaseUrl.trim() === '') {
  throw new Error(
    '[API Config] VITE_API_BASE_URL is not defined. ' +
    'Add it to your .env file and restart the dev server.'
  );
}

/**
 * Strip any accidental trailing slash so that URL concatenation is always
 * predictable:  API_BASE_URL + '/bays'  →  'http://localhost:5000/api/bays'
 */
export const API_BASE_URL = rawBaseUrl.replace(/\/$/, '');

/**
 * Request timeout in milliseconds.
 * Exported separately so it can be referenced in tests or retry logic.
 */
export const API_TIMEOUT_MS = 15000;

/**
 * Default headers sent with every request.
 * Authorization header is injected dynamically by the axios interceptor
 * once the auth module is implemented.
 */
export const API_DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};
