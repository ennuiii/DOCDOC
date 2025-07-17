import React, { useState } from 'react';
import { Button, CircularProgress, Alert, Snackbar } from '@mui/material';
import api from '../../services/api';

const MicrosoftOAuthButton = ({ onSuccess, onError, fullWidth = false, variant = 'contained' }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);
      setShowError(false);
      
      // Create state parameter for security
      const state = btoa(JSON.stringify({
        providerId: 'microsoft',
        timestamp: Date.now(),
        returnUrl: '/integrations'
      }));
      
      // Define required scopes (Teams/OnlineMeetings disabled for multi-tenant SaaS)
      const scopes = [
        'https://graph.microsoft.com/calendars.readwrite',
        // DISABLED: 'https://graph.microsoft.com/onlinemeetings.readwrite',
        'https://graph.microsoft.com/user.read'
      ].join(' ');
      
      // Build OAuth URL
      const authUrl = `/api/integrations/microsoft/auth?` +
        `scopes=${encodeURIComponent(scopes)}&` +
        `state=${encodeURIComponent(state)}&` +
        `redirect_uri=${encodeURIComponent(window.location.origin + '/integrations/callback')}`;
      
      // Open OAuth popup window
      const popup = window.open(
        authUrl,
        'microsoft-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Listen for OAuth callback
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setLoading(false);
        }
      }, 1000);

      // Listen for OAuth success/error messages
      const messageHandler = (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'oauth-success') {
          clearInterval(checkClosed);
          popup.close();
          setLoading(false);
          
          if (onSuccess) {
            onSuccess({
              providerId: 'microsoft',
              integration: event.data.integration,
              user: event.data.user,
            });
          }
        } else if (event.data.type === 'oauth-error') {
          clearInterval(checkClosed);
          popup.close();
          setLoading(false);
          
          const errorMessage = event.data.error || 'Connection failed';
          setError(errorMessage);
          setShowError(true);
          
          if (onError) {
            onError(errorMessage);
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Cleanup on timeout
      const timeout = setTimeout(() => {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        if (!popup.closed) {
          popup.close();
        }
        setLoading(false);
        const timeoutError = 'Connection timed out. Please try again.';
        setError(timeoutError);
        setShowError(true);
        if (onError) {
          onError(timeoutError);
        }
      }, 300000); // 5 minute timeout

      // Store cleanup function for component unmount
      return () => {
        clearTimeout(timeout);
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
      };
      
    } catch (error) {
      console.error('Microsoft OAuth error:', error);
      setLoading(false);
      setError(error.message);
      setShowError(true);
      if (onError) {
        onError(error);
      }
    }
  };

  return (
    <>
      <Button
        variant={variant}
        fullWidth={fullWidth}
        onClick={handleConnect}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} /> : null}
        sx={{
          backgroundColor: variant === 'contained' ? '#0078d4' : 'transparent',
          color: variant === 'contained' ? 'white' : '#0078d4',
          borderColor: '#0078d4',
          '&:hover': {
            backgroundColor: variant === 'contained' ? '#106ebe' : 'rgba(0, 120, 212, 0.04)',
            borderColor: '#106ebe',
          },
          '&:disabled': {
            backgroundColor: variant === 'contained' ? '#f3f2f1' : 'transparent',
            color: '#a19f9d',
            borderColor: '#edebe9',
          },
        }}
      >
        {loading ? 'Connecting...' : 'Connect Microsoft Outlook'}
      </Button>

      <Snackbar
        open={showError}
        autoHideDuration={6000}
        onClose={() => setShowError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setShowError(false)} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  );
};

export default MicrosoftOAuthButton; 