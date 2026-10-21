'use strict';

const env = require('../../config/env');

const base = () => env.SAP_BASE_URL.replace(/\/$/, '');

const authHeaders = () => {
  const h = { 'Content-Type': 'application/json' };
  if (env.SAP_API_KEY) {
    h.Authorization = `Bearer ${env.SAP_API_KEY}`;
    h['x-api-key'] = env.SAP_API_KEY;
  }
  return h;
};

const request = async (method, path, { params, body } = {}) => {
  let url = base() + path;
  if (params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length) url += '?' + new URLSearchParams(entries).toString();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.SAP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`SAP responded with HTTP ${res.status}`);
      err.response = { status: res.status };
      throw err;
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('SAP request timed out.');
      e.code = 'ETIMEDOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  mode: 'http',
  ping: () => request('GET', '/health'),
  getMaterial: (materialNumber) => request('GET', `/materials/${encodeURIComponent(materialNumber)}`),
  listMaterials: () => request('GET', '/materials'),
  getLot: (batchNumber, materialNumber) => request('GET', `/lots/${encodeURIComponent(batchNumber)}`, { params: { materialNumber } }),
  listLots: () => request('GET', '/lots'),
  getInventory: (materialNumber) => request('GET', `/inventory/${encodeURIComponent(materialNumber)}`),
  listInventory: () => request('GET', '/inventory'),
  getDispatch: (deliveryNumber) => request('GET', `/dispatches/${encodeURIComponent(deliveryNumber)}`),
  listDispatches: () => request('GET', '/dispatches'),
  createDispatch: (payload) => request('POST', '/dispatches', { body: payload }),
  validateMaterial: (payload) => request('POST', '/validate/material', { body: payload }),
  validateInventory: (payload) => request('POST', '/validate/inventory', { body: payload }),
  validateDispatch: (payload) => request('POST', '/validate/dispatch', { body: payload }),
};
