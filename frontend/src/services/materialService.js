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

// Attach Bearer token + 401 handling (preserves the response.data contract).
attachAuthInterceptors(api);

export const getMaterials = () => api.get('/materials');
export const getMaterialById = (id) => api.get(`/materials/${id}`);
export const createMaterial = (data) => api.post('/materials', data);
export const updateMaterial = (id, data) => api.put(`/materials/${id}`, data);
export const deleteMaterial = (id) => api.delete(`/materials/${id}`);
