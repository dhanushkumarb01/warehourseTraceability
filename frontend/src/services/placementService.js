/**
 * Placement API Service — arrival mode, bay recommendations and allocation.
 */

import apiClient from './apiClient';

const BASE = '/placement';

/** Method description + static configuration (labels the placeholder rule). */
export const fetchPlacementConfig = () =>
  apiClient.get(`${BASE}/config`).then((res) => res.data.data);

/** Lots with their stage. Filters: { arrivalMode, stage, search }. */
export const fetchPlacementLots = (filters = {}) =>
  apiClient.get(`${BASE}/lots`, { params: filters }).then((res) => res.data.data);

/** Ranked bays for a lot; demandLevel is an optional what-if override. */
export const fetchRecommendations = (lotId, demandLevel) =>
  apiClient
    .get(`${BASE}/lots/${lotId}/recommendations`, { params: demandLevel ? { demandLevel } : {} })
    .then((res) => res.data.data);

export const recordArrivalMode = (lotId, arrivalMode) =>
  apiClient.put(`${BASE}/lots/${lotId}/arrival-mode`, { arrivalMode }).then((res) => res.data.data);

export const allocateBay = (payload) =>
  apiClient.post(`${BASE}/allocations`, payload).then((res) => res.data.data);

export const confirmPlacement = (allocationId, remarks) =>
  apiClient.post(`${BASE}/allocations/${allocationId}/confirm`, { remarks }).then((res) => res.data.data);

export const cancelAllocation = (allocationId, reason) =>
  apiClient.post(`${BASE}/allocations/${allocationId}/cancel`, { reason }).then((res) => res.data.data);
