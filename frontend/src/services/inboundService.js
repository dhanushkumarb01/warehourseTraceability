/**
 * Inbound API Service — rail consignments recorded in FOIS / SAP.
 */

import apiClient from './apiClient';

const BASE = '/inbound';

/**
 * Consignments not yet received. Filters: { source, search }.
 * Result: { available, reason, isDemo, mode, consignments, importedCount }.
 * `available: false` means the source could not be read — not "nothing pending".
 */
export const fetchPendingConsignments = (filters = {}) =>
  apiClient.get(`${BASE}/pending`, { params: filters }).then((res) => res.data.data);

/** Receive one consignment as a rail lot. Result: { lot, materialCreated }. */
export const importConsignment = (source, externalRef) =>
  apiClient.post(`${BASE}/import`, { source, externalRef }).then((res) => res.data.data);
