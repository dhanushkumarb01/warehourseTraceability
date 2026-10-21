import axios from 'axios';
import { attachAuthInterceptors } from './authToken';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    throw error.response?.data || { message: 'Network Error' };
  }
);

// Attach Bearer token + 401 handling. Registered after the transform above so
// the existing `response.data` contract is preserved (axios runs response
// interceptors in reverse order).
attachAuthInterceptors(api);

export const getLots = () => api.get('/lots');
export const getLotById = (id) => api.get(`/lots/${id}`);
export const createLot = (data) => api.post('/lots', data);
export const updateLot = (id, data) => api.put(`/lots/${id}`, data);
export const deleteLot = (id) => api.delete(`/lots/${id}`);
