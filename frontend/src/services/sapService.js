/**
 * SAP Integration API Service (frontend)
 *
 * HTTP calls for the SAP integration layer — dashboard, logs, manual sync,
 * retry, and validation previews. Uses the shared apiClient (auth + 401).
 */

import apiClient from './apiClient';

const BASE = '/sap';

export const fetchStatus = () =>
  apiClient.get(`${BASE}/status`).then((res) => res.data.data);

export const fetchDashboard = () =>
  apiClient.get(`${BASE}/dashboard`).then((res) => res.data.data);

export const fetchSyncLogs = (params = {}) =>
  apiClient.get(`${BASE}/sync-logs`, { params }).then((res) => res.data.data);

export const fetchValidationLogs = (params = {}) =>
  apiClient.get(`${BASE}/validation-logs`, { params }).then((res) => res.data.data);

export const syncMaterial = (materialId) =>
  apiClient.post(`${BASE}/sync/material/${materialId}`).then((res) => res.data.data);

export const syncInventory = (materialId) =>
  apiClient.post(`${BASE}/sync/inventory/${materialId}`).then((res) => res.data.data);

export const syncDispatch = (dispatchId) =>
  apiClient.post(`${BASE}/sync/dispatch/${dispatchId}`).then((res) => res.data.data);

export const retrySync = (syncLogId) =>
  apiClient.post(`${BASE}/sync-logs/${syncLogId}/retry`).then((res) => res.data.data);

/** SAP validation preview for a dispatch (used in the approval UI). */
export const previewDispatchValidation = (dispatchId) =>
  apiClient.get(`${BASE}/validate/dispatch/${dispatchId}`).then((res) => res.data.data);

/** SAP validation preview for a gate exit (used in the gate UI). */
export const previewGateValidation = (dispatchId) =>
  apiClient.get(`${BASE}/validate/gate/${dispatchId}`).then((res) => res.data.data);
