/**
 * Live Streaming API Service (frontend, Phase 12)
 *
 * Talks to the backend streaming layer only — the frontend NEVER connects to a
 * camera directly. Media URLs (playback / HLS manifest) carry the JWT as a
 * query parameter because <video>/<img> tags cannot send an Authorization
 * header; the backend's streamAuthenticate accepts it there.
 *
 * Passwords and raw camera URLs are never returned by these endpoints.
 */

import apiClient from './apiClient';
import { API_BASE_URL } from '../config/api';
import { getToken } from './authToken';

const BASE = '/streams';

/** Live wall: every camera + its merged stream state. */
export const fetchLiveCameras = (params = {}) =>
  apiClient.get(`${BASE}/live`, { params }).then((res) => res.data.data);

export const openStream = (id, viewerId) =>
  apiClient.post(`${BASE}/${id}/open`, { viewerId }).then((res) => res.data.data);

export const closeStream = (id, viewerId) =>
  apiClient.post(`${BASE}/${id}/close`, { viewerId }).then((res) => res.data.data);

export const refreshStream = (id) =>
  apiClient.post(`${BASE}/${id}/refresh`).then((res) => res.data.data);

export const fetchStreamStatus = (id) =>
  apiClient.get(`${BASE}/${id}/status`).then((res) => res.data.data);

export const fetchStreamLogs = (id, limit = 50) =>
  apiClient.get(`${BASE}/${id}/logs`, { params: { limit } }).then((res) => res.data.data);

/** Absolute, authenticated media URL for a <video>/<img> element. */
export const playbackUrl = (id) =>
  `${API_BASE_URL}${BASE}/${id}/playback?access_token=${encodeURIComponent(getToken() || '')}`;

/** Absolute, authenticated HLS manifest URL (RTSP/RTMP via media gateway). */
export const manifestUrl = (id) =>
  `${API_BASE_URL}${BASE}/${id}/manifest.m3u8?access_token=${encodeURIComponent(getToken() || '')}`;

/** Associate a demo video file with a camera (admin). Sent as a raw body. */
export const uploadVideo = (id, file, onProgress) =>
  apiClient.post(`${BASE}/${id}/video`, file, {
    params: { filename: file.name },
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    onUploadProgress: onProgress,
    timeout: 0, // large uploads must not hit the default request timeout
  }).then((res) => res.data.data);

export const clearVideo = (id) =>
  apiClient.delete(`${BASE}/${id}/video`).then((res) => res.data.data);
