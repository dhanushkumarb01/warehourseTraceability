/**
 * QR API Service
 *
 * Encapsulates all HTTP calls related to QR code generation and retrieval.
 */

import apiClient from './apiClient';
import { API_BASE_URL } from '../config/api';

const BASE = '/qr';

/**
 * Generate or regenerate a QR Code for an entity.
 * @param {string} entityType 
 * @param {string} entityId 
 * @param {boolean} isRegenerate 
 * @returns {Promise<Object>} - Updated entity
 */
export const generateQR = (entityType, entityId, isRegenerate = false) =>
  apiClient.post(`${BASE}/${entityType}/${entityId}/generate`, { isRegenerate })
    .then((res) => res.data.data);

/**
 * Get QR status for an entity.
 * @param {string} entityType 
 * @param {string} entityId 
 * @returns {Promise<Object>}
 */
export const getQRStatus = (entityType, entityId) =>
  apiClient.get(`${BASE}/${entityType}/${entityId}/status`)
    .then((res) => res.data.data);

/**
 * Get the full URL to download the QR code image.
 * This does not make an API call, it just constructs the URL for an <a> tag.
 * @param {string} entityType 
 * @param {string} entityId 
 * @returns {string}
 */
export const getQRDownloadUrl = (entityType, entityId) => {
  // Using API_BASE_URL which points to the backend /api
  return `${API_BASE_URL}${BASE}/${entityType}/${entityId}/download`;
};

/**
 * Get the full URL to view the QR code image inline.
 * @param {string} entityType 
 * @param {string} entityId 
 * @returns {string}
 */
export const getQRImageUrl = (entityType, entityId) => {
  return `${API_BASE_URL}${BASE}/${entityType}/${entityId}/image`;
};

