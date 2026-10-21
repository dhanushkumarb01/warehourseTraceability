/**
 * AI Surveillance API Service (frontend, Phase 13)
 *
 * Alert dashboard, alert lifecycle, AI-service status, live motion state, and
 * per-camera motion configuration. Evidence images use a query access-token so
 * <img> tags can load them. Snapshots are served only through the backend; raw
 * paths are never exposed.
 */

import apiClient from './apiClient';
import { API_BASE_URL } from '../config/api';
import { getToken } from './authToken';

const BASE = '/surveillance';

export const fetchAlerts = (params = {}) =>
  apiClient.get(`${BASE}/alerts`, { params }).then((res) => res.data.data);

export const fetchAlertSummary = () =>
  apiClient.get(`${BASE}/alerts/summary`).then((res) => res.data.data);

export const fetchAlert = (id) =>
  apiClient.get(`${BASE}/alerts/${id}`).then((res) => res.data.data);

export const acknowledgeAlert = (id) =>
  apiClient.post(`${BASE}/alerts/${id}/acknowledge`).then((res) => res.data.data);

export const resolveAlert = (id) =>
  apiClient.post(`${BASE}/alerts/${id}/resolve`).then((res) => res.data.data);

export const dismissAlert = (id) =>
  apiClient.post(`${BASE}/alerts/${id}/dismiss`).then((res) => res.data.data);

/** Authenticated evidence image URL for <img>. */
export const snapshotUrl = (id) =>
  `${API_BASE_URL}${BASE}/alerts/${id}/snapshot?access_token=${encodeURIComponent(getToken() || '')}`;

export const fetchServiceStatus = () =>
  apiClient.get(`${BASE}/status`).then((res) => res.data.data);

export const fetchCameraLiveMotion = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/motion`).then((res) => res.data.data);

export const fetchCameraAlerts = (cameraId, limit = 10) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/alerts`, { params: { limit } }).then((res) => res.data.data);

export const fetchMotionConfig = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/motion-config`).then((res) => res.data.data);

export const updateMotionConfig = (cameraId, patch) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/motion-config`, patch).then((res) => res.data.data);

// ── Wall intrusion (person) detector config + boundary zones (Phase 10) ──
export const fetchWallConfig = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/wall-config`).then((res) => res.data.data);

export const updateWallConfig = (cameraId, patch) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/wall-config`, patch).then((res) => res.data.data);

export const fetchWagonConfig = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/wagon-config`).then((res) => res.data.data);

export const updateWagonConfig = (cameraId, patch) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/wagon-config`, patch).then((res) => res.data.data);

export const fetchOverSpeedConfig = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/overspeed-config`).then((res) => res.data.data);

export const updateOverSpeedConfig = (cameraId, patch) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/overspeed-config`, patch).then((res) => res.data.data);

export const fetchCancelledConfig = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/cancelled-config`).then((res) => res.data.data);

export const updateCancelledConfig = (cameraId, patch) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/cancelled-config`, patch).then((res) => res.data.data);

export const fetchFaceConfig = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/face-config`).then((res) => res.data.data);

export const updateFaceConfig = (cameraId, patch) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/face-config`, patch).then((res) => res.data.data);

export const fetchZones = (cameraId) =>
  apiClient.get(`${BASE}/cameras/${cameraId}/zones`).then((res) => res.data.data);

export const updateZones = (cameraId, zones) =>
  apiClient.put(`${BASE}/cameras/${cameraId}/zones`, { zones }).then((res) => res.data.data);
