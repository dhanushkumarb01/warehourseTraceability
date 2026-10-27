/**
 * Location API Service — warehouse zones and loading docks.
 */

import apiClient from './apiClient';

export const fetchZones = () => apiClient.get('/zones').then((res) => res.data.data);
export const createZone = (payload) => apiClient.post('/zones', payload).then((res) => res.data.data);
export const updateZone = (id, payload) => apiClient.put(`/zones/${id}`, payload).then((res) => res.data.data);
export const deleteZone = (id) => apiClient.delete(`/zones/${id}`).then((res) => res.data);

export const fetchDocks = () => apiClient.get('/loading-docks').then((res) => res.data.data);
export const createDock = (payload) => apiClient.post('/loading-docks', payload).then((res) => res.data.data);
export const updateDock = (id, payload) => apiClient.put(`/loading-docks/${id}`, payload).then((res) => res.data.data);
export const deleteDock = (id) => apiClient.delete(`/loading-docks/${id}`).then((res) => res.data);

