/**
 * Employee Face Registry API Service (frontend, Phase 14)
 *
 * Employee registration + face enrollment/management for the Face Detection /
 * Unknown Person use case. Face images are sent to the backend only to be turned
 * into an embedding by the AI worker — they are never stored. The registry keeps
 * embeddings + metadata only, so this API never returns any image.
 */

import apiClient from './apiClient';

const BASE = '/faces';

export const fetchEmployees = (params = {}) =>
  apiClient.get(BASE, { params }).then((res) => res.data.data);

export const fetchRegistrySummary = () =>
  apiClient.get(`${BASE}/summary`).then((res) => res.data.data);

export const fetchEmployee = (id) =>
  apiClient.get(`${BASE}/${id}`).then((res) => res.data.data);

export const createEmployee = (payload) =>
  apiClient.post(BASE, payload).then((res) => res.data.data);

export const updateEmployee = (id, payload) =>
  apiClient.put(`${BASE}/${id}`, payload).then((res) => res.data.data);

export const deleteEmployee = (id) =>
  apiClient.delete(`${BASE}/${id}`).then((res) => res.data);

export const fetchFaces = (id) =>
  apiClient.get(`${BASE}/${id}/faces`).then((res) => res.data.data);

/** Enroll a face. imageBase64 is a data-URL or bare base64 JPEG/PNG string. */
export const enrollFace = (id, imageBase64) =>
  apiClient.post(`${BASE}/${id}/faces`, { imageBase64 }).then((res) => res.data.data);

export const deleteFace = (id, faceId) =>
  apiClient.delete(`${BASE}/${id}/faces/${faceId}`).then((res) => res.data.data);
