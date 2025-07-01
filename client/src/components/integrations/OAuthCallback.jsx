import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  Paper,
  Container,
} from '@mui/material';
import { CheckCircle as SuccessIcon, Error as ErrorIcon } from '@mui/icons-material';

/**
 * OAuth Callback Handler
 * This component handles OAuth redirects from providers like Google, Microsoft, Zoom, etc.
 * It processes the authorization code and communicates the result back to the parent window.
 */
const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // 'processing', 'success', 'error'
  const [message, setMessage] = useState('Processing authorization...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const processOAuthCallback = async () => {
      try {
        // Extract parameters from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Check for OAuth errors
        if (error) {
          const errorMsg = errorDescription || error || 'Authorization was denied';
          setStatus('error');
          setError(errorMsg);
          setMessage('Authorization failed');

          // Send error message to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              error: errorMsg,
              provider: getProviderFromState(state)
            }, window.location.origin);
          }
          return;
        }

        // Check if we have an authorization code
        if (!code) {
          const errorMsg = 'No authorization code received';
          setStatus('error');
          setError(errorMsg);
          setMessage('Authorization failed');

          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-error',
              error: errorMsg,
              provider: getProviderFromState(state)
            }, window.location.origin);
          }
          return;
        }

        // Parse state parameter to get provider info
        let stateData = {};
        try {
          if (state) {
            stateData = JSON.parse(atob(state));
          }
        } catch (e) {
          console.warn('Failed to parse state parameter:', e);
        }

        setMessage('Exchanging authorization code for tokens...');

        // Here you would normally exchange the authorization code for access tokens
        // For now, we'll simulate success
        await new Promise(resolve => setTimeout(resolve, 1000));

        setStatus('success');
        setMessage('Authorization successful! You can close this window.');

        // Send success message to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth-success',
            provider: stateData.providerId || 'unknown',
            credentials: {
              code,
              state,
              // In a real implementation, you'd include the access token here
            },
            user: {
              // User information would be populated after token exchange
              id: 'user-id',
              email: 'user@example.com',
              name: 'User Name'
            }
          }, window.location.origin);

          // Close the popup after a short delay
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          // If not in a popup, redirect back to integrations
          setTimeout(() => {
            navigate('/integrations');
          }, 3000);
        }

      } catch (err) {
        console.error('OAuth callback processing error:', err);
        setStatus('error');
        setError(err.message || 'Failed to process authorization');
        setMessage('An error occurred during authorization');

        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth-error',
            error: err.message || 'Failed to process authorization'
          }, window.location.origin);
        }
      }
    };

    processOAuthCallback();
  }, [searchParams, navigate]);

  const getProviderFromState = (state) => {
    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        return stateData.providerId || 'unknown';
      }
    } catch (e) {
      console.warn('Failed to parse provider from state:', e);
    }
    return 'unknown';
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <CircularProgress size={48} color="primary" />;
      case 'success':
        return <SuccessIcon sx={{ fontSize: 48, color: 'success.main' }} />;
      case 'error':
        return <ErrorIcon sx={{ fontSize: 48, color: 'error.main' }} />;
      default:
        return <CircularProgress size={48} color="primary" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Paper 
          elevation={3} 
          sx={{ 
            p: 4, 
            textAlign: 'center', 
            width: '100%',
            maxWidth: 400 
          }}
        >
          <Box sx={{ mb: 3 }}>
            {getStatusIcon()}
          </Box>

          <Typography variant="h5" gutterBottom>
            {status === 'processing' && 'Processing Authorization'}
            {status === 'success' && 'Authorization Successful!'}
            {status === 'error' && 'Authorization Failed'}
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {message}
          </Typography>

          {status === 'error' && error && (
            <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>
              <Typography variant="body2">
                <strong>Error:</strong> {error}
              </Typography>
            </Alert>
          )}

          {status === 'success' && (
            <Alert severity="success" sx={{ mt: 2, textAlign: 'left' }}>
              <Typography variant="body2">
                Your account has been successfully connected. This window will close automatically.
              </Typography>
            </Alert>
          )}

          {status === 'processing' && (
            <Typography variant="caption" color="text.secondary">
              Please wait while we complete the authorization process...
            </Typography>
          )}
        </Paper>
      </Box>
    </Container>
  );
};

export default OAuthCallback; 