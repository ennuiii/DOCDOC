import { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, tokens } = response.data;
      
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      
      setUser(user);
      enqueueSnackbar('Login successful!', { variant: 'success' });
      
      // Navigate based on role
      if (user.role === 'doctor') {
        navigate('/timeslots');
      } else if (user.role === 'pharma') {
        navigate('/appointments');
      } else {
        navigate('/dashboard');
      }
      
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      enqueueSnackbar(message, { variant: 'error' });
      return { success: false, error: message };
    }
  };

  const register = async (userData) => {
    try {
      const response = await api.post('/auth/register', userData);
      const { user, tokens } = response.data;
      
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      
      setUser(user);
      enqueueSnackbar('Registration successful!', { variant: 'success' });
      navigate('/dashboard');
      
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed';
      enqueueSnackbar(message, { variant: 'error' });
      return { success: false, error: message };
    }
  };

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      navigate('/login');
      enqueueSnackbar('Logged out successfully', { variant: 'info' });
    }
  }, [navigate, enqueueSnackbar]);

  const updateProfile = async (profileData) => {
    try {
      const response = await api.put('/users/profile', profileData);
      setUser(response.data.user);
      enqueueSnackbar('Profile updated successfully', { variant: 'success' });
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Profile update failed';
      enqueueSnackbar(message, { variant: 'error' });
      return { success: false, error: message };
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 