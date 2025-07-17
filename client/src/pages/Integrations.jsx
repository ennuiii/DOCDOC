import React, { useState, useEffect } from 'react';
import { Box, Typography, Alert, Snackbar } from '@mui/material';
import IntegrationDashboard from '../components/integrations/IntegrationDashboard';
import api from '../services/api';

const Integrations = () => {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

  const showNotification = (message, severity = 'info') => {
    setNotification({ open: true, message, severity });
  };

  const closeNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // Fetch integrations from backend
  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      console.log('🔍 [DEBUG] Fetching integrations...');
      
      const response = await api.get('/integrations');
      console.log('🔍 [DEBUG] Raw API response:', response);
      console.log('🔍 [DEBUG] Response status:', response.status);
      console.log('🔍 [DEBUG] Response data:', response.data);
      console.log('🔍 [DEBUG] Integrations array:', response.data.integrations);
      
      if (response.data.integrations) {
        response.data.integrations.forEach((integration, index) => {
          console.log(`🔍 [DEBUG] Integration ${index}:`, {
            providerId: integration.providerId,
            providerName: integration.providerName,
            status: integration.status,
            lastSync: integration.lastSync,
            user: integration.user,
            scopes: integration.scopes,
            connectedAt: integration.connectedAt
          });
        });
      }
      
      setIntegrations(response.data.integrations || []);
      setError(null);
    } catch (err) {
      console.error('❌ [DEBUG] Error fetching integrations:', err);
      console.error('❌ [DEBUG] Error response:', err.response);
      console.error('❌ [DEBUG] Error status:', err.response?.status);
      console.error('❌ [DEBUG] Error data:', err.response?.data);
      console.error('❌ [DEBUG] Error message:', err.message);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle successful integration connection
  const handleConnect = async (result) => {
    try {
      showNotification(
        `Successfully connected to ${result.providerId === 'google' ? 'Google Calendar & Meet' : result.providerId}!`,
        'success'
      );
      
      // Refresh integrations list
      await fetchIntegrations();
    } catch (err) {
      console.error('Error after connection:', err);
      showNotification('Connection successful, but failed to refresh integration list', 'warning');
    }
  };

  // Handle integration disconnection
  const handleDisconnect = async (providerId) => {
    try {
      await api.post(`/integrations/${providerId}/disconnect`);
      showNotification(`Successfully disconnected from ${providerId}`, 'success');
      await fetchIntegrations();
    } catch (err) {
      console.error('Error disconnecting:', err);
      const errorMessage = err.response?.data?.message || err.message;
      showNotification(`Failed to disconnect from ${providerId}: ${errorMessage}`, 'error');
    }
  };

  // Handle integration refresh/sync
  const handleRefresh = async (providerId) => {
    try {
      await api.post(`/integrations/${providerId}/sync`);
      showNotification(`Successfully synced ${providerId}`, 'success');
      await fetchIntegrations();
    } catch (err) {
      console.error('Error syncing:', err);
      const errorMessage = err.response?.data?.message || err.message;
      showNotification(`Failed to sync ${providerId}: ${errorMessage}`, 'error');
    }
  };

  // Handle integration settings
  const handleSettings = (providerId) => {
    // This would open a settings dialog/page for the specific provider
    console.log('Opening settings for:', providerId);
    showNotification(`Settings for ${providerId} coming soon!`, 'info');
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Calendar & Video Integrations
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Connect and manage your calendar and video conferencing integrations
      </Typography>

      {/* Debug Panel */}
      <Box sx={{ 
        mb: 3, 
        p: 2, 
        border: '1px solid #ddd', 
        borderRadius: 1, 
        backgroundColor: '#f5f5f5',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <Typography variant="h6" sx={{ mb: 1, fontSize: '14px', fontFamily: 'inherit' }}>
          🐛 Debug Information
        </Typography>
        <Typography variant="body2" sx={{ mb: 1, fontSize: '12px', fontFamily: 'monospace' }}>
          <strong>Loading:</strong> {loading ? 'true' : 'false'}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1, fontSize: '12px', fontFamily: 'monospace' }}>
          <strong>Error:</strong> {error || 'none'}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1, fontSize: '12px', fontFamily: 'monospace' }}>
          <strong>Integrations Count:</strong> {integrations?.length || 0}
        </Typography>
        {integrations?.map((integration, index) => (
          <Box key={index} sx={{ ml: 2, mb: 1 }}>
            <Typography variant="body2" sx={{ fontSize: '11px', fontFamily: 'monospace' }}>
              <strong>{integration.providerId}:</strong> status="{integration.status}", 
              user={integration.user?.email || 'none'}, 
              scopes={integration.scopes?.length || 0}
            </Typography>
          </Box>
        ))}
      </Box>
      
      <IntegrationDashboard
        integrations={integrations}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
        loading={loading}
        error={error}
      />

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={closeNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={closeNotification} 
          severity={notification.severity} 
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Integrations; 