/**
 * Camera API Service (frontend, Phase 11)
 *
 * All HTTP calls for the surveillance camera registry. Uses the shared
 * apiClient (auth header + 401 handling). Passwords are write-only — the API
 * never returns them.
 */

import apiClient from './apiClient';

const BASE = '/cameras';

export const fetchCameras = (params = {}) =>
  apiClient.get(BASE, { params }).then((res) => res.data.data);

export const fetchCameraSummary = () =>
  apiClient.get(`${BASE}/summary`).then((res) => res.data.data);

export const fetchCamera = (id) =>
  apiClient.get(`${BASE}/${id}`).then((res) => res.data.data);

export const createCamera = (payload) =>
  apiClient.post(BASE, payload).then((res) => res.data.data);

export const updateCamera = (id, payload) =>
  apiClient.put(`${BASE}/${id}`, payload).then((res) => res.data.data);

export const deleteCamera = (id) =>
  apiClient.delete(`${BASE}/${id}`).then((res) => res.data);

/** Test ad-hoc connection details (registration form, before saving). */
export const testConnection = (payload) =>
  apiClient.post(`${BASE}/test`, payload).then((res) => res.data.data);

/** Test a saved camera's connection (persists health + lastConnectivityCheck). */
export const testSavedCamera = (id) =>
  apiClient.post(`${BASE}/${id}/test`).then((res) => res.data.data);
