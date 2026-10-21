/**
 * Auth API Service (frontend)
 *
 * HTTP calls for authentication and self-service profile endpoints, plus admin
 * user management and audit-log reads. Uses the shared apiClient (token +
 * 401 handling already wired).
 */

import apiClient from './apiClient';

// ── Authentication ──────────────────────────────────────────────────────────
export const login = (identifier, password) =>
  apiClient.post('/auth/login', { identifier, password }).then((res) => res.data.data);

export const logout = () =>
  apiClient.post('/auth/logout').then((res) => res.data);

export const fetchMe = () =>
  apiClient.get('/auth/me').then((res) => res.data.data);

export const updateProfile = (payload) =>
  apiClient.put('/auth/profile', payload).then((res) => res.data.data);

export const changePassword = (payload) =>
  apiClient.put('/auth/password', payload).then((res) => res.data);

// ── User administration (ADMIN) ─────────────────────────────────────────────
export const registerUser = (payload) =>
  apiClient.post('/auth/register', payload).then((res) => res.data.data);

export const fetchUsers = () =>
  apiClient.get('/users').then((res) => res.data.data);

export const updateUser = (id, payload) =>
  apiClient.put(`/users/${id}`, payload).then((res) => res.data.data);

export const deactivateUser = (id) =>
  apiClient.post(`/users/${id}/deactivate`).then((res) => res.data.data);

export const activateUser = (id) =>
  apiClient.post(`/users/${id}/activate`).then((res) => res.data.data);

// ── Audit logs (ADMIN / MANAGER) ────────────────────────────────────────────
export const fetchAuditLogs = (params = {}) =>
  apiClient.get('/audit-logs', { params }).then((res) => res.data.data);
