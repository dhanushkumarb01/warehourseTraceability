/**
 * Dispatch API Service
 *
 * All HTTP calls for the Dispatch module. Uses the shared apiClient singleton
 * (consistent error normalisation, base URL, timeout).
 */

import apiClient from './apiClient';

const BASE = '/dispatches';

// Writes
export const createDispatch = (payload) =>
  apiClient.post(BASE, payload).then((res) => res.data.data);

export const approveDispatch = (id, payload = {}) =>
  apiClient.post(`${BASE}/${id}/approve`, payload).then((res) => res.data.data);

export const rejectDispatch = (id, payload = {}) =>
  apiClient.post(`${BASE}/${id}/reject`, payload).then((res) => res.data.data);

export const cancelDispatch = (id, payload = {}) =>
  apiClient.post(`${BASE}/${id}/cancel`, payload).then((res) => res.data.data);

// Reads
export const fetchDispatches = (status = null) =>
  apiClient.get(BASE, { params: status ? { status } : {} }).then((res) => res.data.data);

export const fetchPendingDispatches = () =>
  apiClient.get(`${BASE}/pending`).then((res) => res.data.data);

export const fetchApprovedDispatches = () =>
  apiClient.get(`${BASE}/approved`).then((res) => res.data.data);

export const fetchDispatchSummary = () =>
  apiClient.get(`${BASE}/summary`).then((res) => res.data.data);

export const fetchDispatchById = (id) =>
  apiClient.get(`${BASE}/${id}`).then((res) => res.data.data);

export const fetchDispatchHistory = (lotId) =>
  apiClient.get(`${BASE}/lot/${lotId}/history`).then((res) => res.data.data);
