/**
 * Gate Validation API Service
 *
 * All HTTP calls for the Exit Gate Validation module.
 */

import apiClient from './apiClient';

const BASE = '/gate-validations';

// Scan / exit
export const resolveScan = (payload) =>
  apiClient.post(`${BASE}/scan/resolve`, payload).then((res) => res.data.data);

export const processExit = (payload) =>
  apiClient.post(`${BASE}/exit`, payload).then((res) => res.data.data);

// Reads
export const fetchGateValidations = (status = null) =>
  apiClient.get(BASE, { params: status ? { status } : {} }).then((res) => res.data.data);

export const fetchPendingExits = () =>
  apiClient.get(`${BASE}/pending`).then((res) => res.data.data);

export const fetchGateSummary = () =>
  apiClient.get(`${BASE}/summary`).then((res) => res.data.data);

export const fetchGateValidationById = (id) =>
  apiClient.get(`${BASE}/${id}`).then((res) => res.data.data);
