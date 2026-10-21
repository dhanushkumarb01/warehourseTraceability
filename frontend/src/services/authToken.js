/**
 * Auth Token Store
 *
 * Single source of truth for the JWT on the client. Persisted in localStorage
 * so a refresh keeps the session, and shared by every axios instance via
 * attachAuthInterceptors() so each request carries the Bearer token and reacts
 * to 401s consistently.
 */

const TOKEN_KEY = 'wt_auth_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const setToken = (token) => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

/**
 * Attach the shared auth behaviour to an axios instance:
 *   - request:  inject `Authorization: Bearer <token>` when present.
 *   - response: on 401, clear the token and redirect to /login (once).
 *
 * Used by apiClient and the standalone lot/material axios instances so auth is
 * uniform without duplicating logic.
 */
export const attachAuthInterceptors = (axiosInstance) => {
  axiosInstance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && error.response.status === 401) {
        clearToken();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );
};
