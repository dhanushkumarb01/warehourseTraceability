/**
 * Bay API Service
 *
 * Encapsulates all HTTP calls related to the Bay resource.
 * Components must never call apiClient directly — they use this service.
 * This makes it trivial to mock in tests and to update the endpoint paths.
 */

import apiClient from './apiClient';

const BASE = '/bays';

/**
 * Fetch all bays.
 * @returns {Promise<Bay[]>}
 */
export const fetchAllBays = () =>
  apiClient.get(BASE).then((res) => res.data.data);

/**
 * Fetch a single bay by ID.
 * @param {string} id
 * @returns {Promise<Bay>}
 */
export const fetchBayById = (id) =>
  apiClient.get(`${BASE}/${id}`).then((res) => res.data.data);

/**
 * Create a new bay.
 * @param {object} payload
 * @returns {Promise<Bay>}
 */
export const createBay = (payload) =>
  apiClient.post(BASE, payload).then((res) => res.data.data);

/**
 * Update an existing bay.
 * @param {string} id
 * @param {object} payload
 * @returns {Promise<Bay>}
 */
export const updateBay = (id, payload) =>
  apiClient.put(`${BASE}/${id}`, payload).then((res) => res.data.data);

/**
 * Delete a bay by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteBay = (id) =>
  apiClient.delete(`${BASE}/${id}`).then((res) => res.data);
