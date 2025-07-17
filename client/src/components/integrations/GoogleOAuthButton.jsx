import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Box,
} from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import api from '../../services/api';

/**
 * Google OAuth Button using @react-oauth/google
 * Handles Google Calendar and Meet integration with proper scopes
 */
const GoogleOAuthButton = ({
  onSuccess,
  onError,
  disabled = false,
  variant = 'contained',
  size = 'medium',
  fullWidth = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      setIsLoading(true);
      try {
        // Send the authorization code to your backend using the API service
        const result = await api.post('/integrations/google/token', {
          code: response.code,
        });

        const data = result.data;
        
        if (onSuccess) {
          onSuccess({
            providerId: 'google',
            credentials: data.credentials,
            user: data.user,
          });
        }
      } catch (error) {
        console.error('Google OAuth error:', error);
        setError(error.message);
        setShowError(true);
        
        if (onError) {
          onError(error.message);
        }
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google OAuth error:', error);
      const errorMessage = 'Google authorization failed';
      setError(errorMessage);
      setShowError(true);
      
      if (onError) {
        onError(errorMessage);
      }
    },
    flow: 'auth-code',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.calendars.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '),
  });

  const handleCloseError = () => {
    setShowError(false);
    setError(null);
  };

  return (
    <Box>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        onClick={() => googleLogin()}
        disabled={disabled || isLoading}
        startIcon={
          isLoading ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <GoogleIcon />
          )
        }
        sx={{
          backgroundColor: '#4285f4',
          color: 'white',
          '&:hover': {
            backgroundColor: '#3367d6',
          },
          '&:disabled': {
            backgroundColor: '#ccc',
          },
        }}
      >
        {isLoading ? 'Connecting...' : 'Connect Google Calendar & Meet'}
      </Button>

      <Snackbar
        open={showError}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseError} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default GoogleOAuthButton; 