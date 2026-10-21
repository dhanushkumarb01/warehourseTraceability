/**
 * AuthContext — client session management.
 *
 * Holds the authenticated user, restores the session on load (via /auth/me when
 * a token is present), and exposes login/logout plus a `can(roles)` helper for
 * role-based UI gating.
 *
 * The token itself lives in localStorage (authToken.js) and is attached to
 * requests by the axios interceptors — this context only tracks the user object
 * and loading state for rendering.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, setToken, clearToken } from '../services/authToken';
import * as authApi from '../services/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on first load.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const me = await authApi.fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        clearToken();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { token, user: u } = await authApi.login(identifier, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* best effort */ }
    clearToken();
    setUser(null);
  }, []);

  /** True if the current user's role is in the allowed list (or list empty). */
  const can = useCallback(
    (roles) => {
      if (!user) return false;
      if (!roles || roles.length === 0) return true;
      return roles.includes(user.role);
    },
    [user]
  );

  const value = { user, loading, isAuthenticated: Boolean(user), login, logout, can, setUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
