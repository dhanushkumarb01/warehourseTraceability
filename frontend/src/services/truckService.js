/**
 * Truck & RFID API Service
 *
 * All HTTP calls for the Truck Traceability + RFID module.
 * Uses the shared apiClient singleton.
 */

import apiClient from './apiClient';

// ── Truck Dashboard ────────────────────────────────────────────────────────────

export const fetchTruckDashboard = () =>
  apiClient.get('/trucks/dashboard').then((res) => res.data.data);

// ── Truck Master ───────────────────────────────────────────────────────────────

export const fetchTrucks = () =>
  apiClient.get('/trucks').then((res) => res.data.data);

export const fetchTruckById = (id) =>
  apiClient.get(`/trucks/${id}`).then((res) => res.data.data);

export const createTruck = (payload) =>
  apiClient.post('/trucks', payload).then((res) => res.data.data);

export const updateTruck = (id, payload) =>
  apiClient.put(`/trucks/${id}`, payload).then((res) => res.data.data);

// ── Visits & Journey ───────────────────────────────────────────────────────────

export const fetchVisits = (params = {}) =>
  apiClient.get('/trucks/visits', { params }).then((res) => res.data.data);

export const fetchJourney = (visitId) =>
  apiClient.get(`/trucks/visits/${visitId}/journey`).then((res) => res.data.data);

// ── RFID Readers ───────────────────────────────────────────────────────────────

export const fetchReaderDashboard = () =>
  apiClient.get('/rfid/readers/dashboard').then((res) => res.data.data);

export const fetchReaders = () =>
  apiClient.get('/rfid/readers').then((res) => res.data.data);

export const fetchReaderById = (id) =>
  apiClient.get(`/rfid/readers/${id}`).then((res) => res.data.data);

export const createReader = (payload) =>
  apiClient.post('/rfid/readers', payload).then((res) => res.data.data);

export const updateReader = (id, payload) =>
  apiClient.put(`/rfid/readers/${id}`, payload).then((res) => res.data.data);

export const deleteReader = (id) =>
  apiClient.delete(`/rfid/readers/${id}`).then((res) => res.data);

export const sendHeartbeat = (id) =>
  apiClient.post(`/rfid/readers/${id}/heartbeat`).then((res) => res.data.data);

// ── RFID Event Pipeline (Simulator + Hardware) ────────────────────────────────

export const ingestRFIDEvent = (payload) =>
  apiClient.post('/rfid/events', payload).then((res) => res.data.data);
