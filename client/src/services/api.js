import axios from 'axios';
import { supabase } from '../lib/supabase.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add Supabase auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch (error) {
      console.error('Error getting Supabase session:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle Supabase token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the Supabase session
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !session?.access_token) {
          throw new Error('Session refresh failed');
        }

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Refresh failed, sign out and redirect to login
        await supabase.auth.signOut();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Appointment management
export const appointmentAPI = {
  // Create a new appointment with video link generation
  create: async (appointmentData) => {
    const response = await api.post('/appointments', appointmentData);
    return response.data;
  },

  // Get user's appointments
  getAppointments: async (params) => {
    const response = await api.get('/appointments', { params });
    return response.data;
  },

  // Update appointment status
  updateStatus: async (appointmentId, status, data = {}) => {
    const response = await api.patch(`/appointments/${appointmentId}/status`, {
      status,
      ...data
    });
    return response.data;
  },

  // Cancel appointment
  cancel: async (appointmentId, reason) => {
    const response = await api.patch(`/appointments/${appointmentId}/cancel`, {
      reason
    });
    return response.data;
  },

  // Confirm appointment
  confirm: async (appointmentId) => {
    const response = await api.patch(`/appointments/${appointmentId}/confirm`);
    return response.data;
  }
};

export default api; 