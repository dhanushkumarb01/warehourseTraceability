/**
 * Axios HTTP Client Instance
 *
 * Singleton axios instance shared across the entire application.
 * All configuration values come from src/config/api.js — no URLs, ports,
 * or env variable names appear here.
 *
 * Interceptors registered here:
 *   - Response: passes successful responses through unchanged.
 *   - Error:    normalises all failure shapes so every caller receives
 *               a consistent `err.message` string.
 *
 * Future interceptors to add here (not elsewhere):
 *   - Request:  attach Authorization header from auth store.
 *   - Response: global 401 → redirect to login.
 */

import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT_MS, API_DEFAULT_HEADERS } from '../config/api';
import { attachAuthInterceptors } from './authToken';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: API_DEFAULT_HEADERS,
});

// Inject the Bearer token on every request and handle 401s (clear + redirect).
attachAuthInterceptors(apiClient);

// ─── Response Interceptor ─────────────────────────────────────────────────────

apiClient.interceptors.response.use(
  // Success — pass through unchanged; callers receive the full response object.
  (response) => response,

  // Error — attach a normalised human-readable message regardless of origin.
  (error) => {
    if (error.response) {
      // Server responded with a non-2xx status
      error.message =
        error.response.data?.message || 'An API error occurred.';
    } else if (error.request) {
      // Request was sent but no response received (network error, timeout)
      error.message =
        'Unable to reach the server. Please check your connection.';
    }
    // else: error was thrown before the request was sent (config error)
    return Promise.reject(error);
  }
);

export default apiClient;
