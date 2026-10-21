/**
 * Mapping API Service
 *
 * Encapsulates all HTTP calls for the Material-to-Bay Mapping module.
 * Uses the shared apiClient singleton (consistent error normalisation,
 * base URL, timeout). Components must never call apiClient directly.
 */

import apiClient from './apiClient';

const BASE = '/mappings';

// ── Writes ──────────────────────────────────────────────────────────────────

/** Place a lot into a bay (first-time mapping). */
export const createMapping = (payload) =>
  apiClient.post(BASE, payload).then((res) => res.data.data);

/** Relocate a lot from its current bay to another bay. */
export const moveMaterial = (payload) =>
  apiClient.post(`${BASE}/move`, payload).then((res) => res.data.data);

/** Remove a lot from its current bay. */
export const removeMaterial = (payload) =>
  apiClient.post(`${BASE}/remove`, payload).then((res) => res.data.data);

// ── Dual-QR scan ─────────────────────────────────────────────────────────────

/** Identify the entities referenced by scanned QR payloads (no commit). */
export const resolveScan = (payload) =>
  apiClient.post(`${BASE}/scan/resolve`, payload).then((res) => res.data.data);

/** Commit a dual-QR scan — places or relocates the lot. */
export const commitScan = (payload) =>
  apiClient.post(`${BASE}/scan`, payload).then((res) => res.data);

// ── Reads ───────────────────────────────────────────────────────────────────

/** All active inventory across the yard (flat list of active mappings). */
export const fetchActiveInventory = () =>
  apiClient.get(`${BASE}/inventory`).then((res) => res.data.data);

/** Per-bay active inventory summary, keyed by bayId: { lotCount, totalQuantity }. */
export const fetchInventorySummary = () =>
  apiClient.get(`${BASE}/inventory/summary`).then((res) => res.data.data);

/** Inventory (active lots) for a single bay. */
export const fetchBayInventory = (bayId) =>
  apiClient.get(`${BASE}/bay/${bayId}/inventory`).then((res) => res.data.data);

/** Current location of a lot. */
export const fetchMaterialLocation = (lotId) =>
  apiClient.get(`${BASE}/lot/${lotId}/location`).then((res) => res.data.data);

/** Full movement history of a lot. */
export const fetchMappingHistory = (lotId) =>
  apiClient.get(`${BASE}/lot/${lotId}/history`).then((res) => res.data.data);

/** Current active mapping of a lot (or null). */
export const fetchActiveMapping = (lotId) =>
  apiClient.get(`${BASE}/lot/${lotId}/active`).then((res) => res.data.data);
