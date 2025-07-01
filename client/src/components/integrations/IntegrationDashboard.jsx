import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Fab,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Settings as SettingsIcon,
  Sync as SyncIcon,
  Psychology as SmartIcon,
  Warning as WarningIcon,
  Timeline as TrendIcon,
  DirectionsCar as TravelIcon,
  Schedule as ConflictIcon,
  TrendingUp as InsightIcon,
  AutoAwesome as AIIcon,
} from '@mui/icons-material';

import IntegrationCard from './IntegrationCard';
import ProviderConnectButton from './ProviderConnectButton';
import IntegrationStatus from './IntegrationStatus';

/**
 * Smart Analytics Panel - Shows intelligent insights about conflicts and scheduling
 */
const SmartAnalyticsPanel = ({ analytics, onRefreshAnalytics }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshAnalytics?.();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartIcon color="primary" />
            <Typography variant="h6">Smart Scheduling Analytics</Typography>
          </Box>
          <Tooltip title="Refresh Analytics">
            <IconButton onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <CircularProgress size={20} /> : <SyncIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        <Grid container spacing={3}>
          {/* Conflict Detection Stats */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <ConflictIcon sx={{ fontSize: 32, color: analytics?.conflicts?.count > 0 ? 'error.main' : 'success.main', mb: 1 }} />
              <Typography variant="h4" color={analytics?.conflicts?.count > 0 ? 'error.main' : 'success.main'}>
                {analytics?.conflicts?.count || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active Conflicts
              </Typography>
              {analytics?.conflicts?.resolved > 0 && (
                <Chip 
                  label={`${analytics.conflicts.resolved} resolved today`} 
                  size="small" 
                  color="success" 
                  sx={{ mt: 1 }} 
                />
              )}
            </Box>
          </Grid>

          {/* Travel Time Warnings */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <TravelIcon sx={{ fontSize: 32, color: analytics?.travel?.warnings > 0 ? 'warning.main' : 'success.main', mb: 1 }} />
              <Typography variant="h4" color={analytics?.travel?.warnings > 0 ? 'warning.main' : 'success.main'}>
                {analytics?.travel?.warnings || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Travel Warnings
              </Typography>
              {analytics?.travel?.averageTime && (
                <Chip 
                  label={`Avg: ${analytics.travel.averageTime}min`} 
                  size="small" 
                  color="info" 
                  sx={{ mt: 1 }} 
                />
              )}
            </Box>
          </Grid>

          {/* Smart Suggestions */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <AIIcon sx={{ fontSize: 32, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" color="primary.main">
                {analytics?.suggestions?.available || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                AI Suggestions
              </Typography>
              {analytics?.suggestions?.accepted > 0 && (
                <Chip 
                  label={`${analytics.suggestions.accepted} accepted`} 
                  size="small" 
                  color="primary" 
                  sx={{ mt: 1 }} 
                />
              )}
            </Box>
          </Grid>

          {/* Learning Insights */}
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ textAlign: 'center', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <InsightIcon sx={{ fontSize: 32, color: 'info.main', mb: 1 }} />
              <Typography variant="h4" color="info.main">
                {analytics?.learning?.accuracy || 0}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Preference Accuracy
              </Typography>
              {analytics?.learning?.patterns > 0 && (
                <Chip 
                  label={`${analytics.learning.patterns} patterns learned`} 
                  size="small" 
                  color="info" 
                  sx={{ mt: 1 }} 
                />
              )}
            </Box>
          </Grid>
        </Grid>

        {/* Recent Smart Actions */}
        {analytics?.recentActions?.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Recent Smart Actions
            </Typography>
            {analytics.recentActions.slice(0, 3).map((action, index) => (
              <Alert 
                key={index}
                severity={action.type === 'conflict' ? 'warning' : action.type === 'suggestion' ? 'info' : 'success'}
                sx={{ mb: 1 }}
                action={
                  action.action && (
                    <Button size="small" onClick={() => action.action()}>
                      {action.actionLabel || 'View'}
                    </Button>
                  )
                }
              >
                {action.message}
              </Alert>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * IntegrationDashboard - Main dashboard for managing all calendar and video integrations
 * @param {Object} props
 * @param {Array} props.integrations - Array of current integrations
 * @param {Function} props.onConnect - Handler for connecting new integrations
 * @param {Function} props.onDisconnect - Handler for disconnecting integrations
 * @param {Function} props.onRefresh - Handler for refreshing integrations
 * @param {Function} props.onSettings - Handler for opening integration settings
 * @param {boolean} props.loading - Whether the dashboard is loading
 * @param {string} props.error - Any error message to display
 * @param {Object} props.smartAnalytics - Smart scheduling analytics data
 * @param {Function} props.onRefreshAnalytics - Handler for refreshing analytics
 */
const IntegrationDashboard = ({
  integrations = [],
  onConnect,
  onDisconnect,
  onRefresh,
  onSettings,
  loading = false,
  error = null,
  smartAnalytics = null,
  onRefreshAnalytics,
}) => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [syncingAll, setSyncingAll] = useState(false);

  // Available providers that can be connected
  const availableProviders = [
    {
      id: 'google',
      name: 'Google Calendar & Meet',
      description: 'Connect your Google Calendar and enable Google Meet for video calls',
      category: 'calendar',
      scopes: ['https://www.googleapis.com/auth/calendar'],
    },
    {
      id: 'microsoft',
      name: 'Microsoft Outlook & Teams',
      description: 'Connect Microsoft Outlook and enable Teams for video calls',
      category: 'calendar',
      scopes: ['https://graph.microsoft.com/calendars.readwrite'],
    },
    {
      id: 'zoom',
      name: 'Zoom Meetings',
      description: 'Enable Zoom for video conferences and webinars',
      category: 'video',
      scopes: ['meeting:write', 'meeting:read'],
    },
    {
      id: 'caldav',
      name: 'CalDAV (iCloud, Yahoo, etc.)',
      description: 'Connect to any CalDAV-compatible calendar service',
      category: 'calendar',
      scopes: ['calendar:read', 'calendar:write'],
    },
  ];

  const getUnconnectedProviders = () => {
    const connectedIds = integrations.map(i => i.providerId);
    return availableProviders.filter(p => !connectedIds.includes(p.id));
  };

  const getProvidersByCategory = (category) => {
    return integrations.filter(i => {
      const provider = availableProviders.find(p => p.id === i.providerId);
      return provider && provider.category === category;
    });
  };

  const handleAddIntegration = () => {
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
  };

  const handleConnectProvider = (result) => {
    handleCloseAddDialog();
    if (onConnect) {
      onConnect(result);
    }
  };

  const handleRefreshAll = async () => {
    if (syncingAll || !onRefresh) return;
    
    setSyncingAll(true);
    try {
      await Promise.all(
        integrations.map(integration => 
          onRefresh(integration.providerId)
        )
      );
    } catch (err) {
      console.error('Failed to refresh all integrations:', err);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  const calendarIntegrations = getProvidersByCategory('calendar');
  const videoIntegrations = getProvidersByCategory('video');
  const unconnectedProviders = getUnconnectedProviders();

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress size={48} />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Integration Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Connect your calendar and video conferencing providers to streamline appointment scheduling
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Smart Analytics Panel */}
      {smartAnalytics && (
        <SmartAnalyticsPanel 
          analytics={smartAnalytics} 
          onRefreshAnalytics={onRefreshAnalytics} 
        />
      )}

      {/* Status Overview */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <IntegrationStatus
            integrations={integrations}
            isSyncing={syncingAll}
            onRefreshAll={handleRefreshAll}
            title="Integration Health"
          />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label={`All Integrations (${integrations.length})`} />
          <Tab label={`Calendar (${calendarIntegrations.length})`} />
          <Tab label={`Video (${videoIntegrations.length})`} />
        </Tabs>
      </Paper>

      {/* Integration Cards */}
      <Grid container spacing={3}>
        {/* All Integrations Tab */}
        {selectedTab === 0 && (
          <>
            {integrations.map((integration) => (
              <Grid item xs={12} sm={6} lg={4} key={integration.providerId}>
                <IntegrationCard
                  providerId={integration.providerId}
                  providerName={integration.providerName}
                  providerLogo={integration.providerLogo}
                  status={integration.status}
                  lastSync={integration.lastSync}
                  user={integration.user}
                  scopes={integration.scopes}
                  onConnect={() => onConnect && onConnect(integration.providerId)}
                  onDisconnect={() => onDisconnect && onDisconnect(integration.providerId)}
                  onSettings={() => onSettings && onSettings(integration.providerId)}
                  onRefresh={() => onRefresh && onRefresh(integration.providerId)}
                  loading={integration.loading}
                />
              </Grid>
            ))}
          </>
        )}

        {/* Calendar Integrations Tab */}
        {selectedTab === 1 && (
          <>
            {calendarIntegrations.map((integration) => (
              <Grid item xs={12} sm={6} lg={4} key={integration.providerId}>
                <IntegrationCard
                  providerId={integration.providerId}
                  providerName={integration.providerName}
                  providerLogo={integration.providerLogo}
                  status={integration.status}
                  lastSync={integration.lastSync}
                  user={integration.user}
                  scopes={integration.scopes}
                  onConnect={() => onConnect && onConnect(integration.providerId)}
                  onDisconnect={() => onDisconnect && onDisconnect(integration.providerId)}
                  onSettings={() => onSettings && onSettings(integration.providerId)}
                  onRefresh={() => onRefresh && onRefresh(integration.providerId)}
                  loading={integration.loading}
                />
              </Grid>
            ))}
          </>
        )}

        {/* Video Integrations Tab */}
        {selectedTab === 2 && (
          <>
            {videoIntegrations.map((integration) => (
              <Grid item xs={12} sm={6} lg={4} key={integration.providerId}>
                <IntegrationCard
                  providerId={integration.providerId}
                  providerName={integration.providerName}
                  providerLogo={integration.providerLogo}
                  status={integration.status}
                  lastSync={integration.lastSync}
                  user={integration.user}
                  scopes={integration.scopes}
                  onConnect={() => onConnect && onConnect(integration.providerId)}
                  onDisconnect={() => onDisconnect && onDisconnect(integration.providerId)}
                  onSettings={() => onSettings && onSettings(integration.providerId)}
                  onRefresh={() => onRefresh && onRefresh(integration.providerId)}
                  loading={integration.loading}
                />
              </Grid>
            ))}
          </>
        )}

        {/* Empty State */}
        {integrations.length === 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <SyncIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No Integrations Connected
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Connect your calendar and video providers to get started with integrated scheduling
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddIntegration}
              >
                Add Integration
              </Button>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Floating Action Button */}
      {integrations.length > 0 && unconnectedProviders.length > 0 && (
        <Fab
          color="primary"
          aria-label="add integration"
          onClick={handleAddIntegration}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
          }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Add Integration Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={handleCloseAddDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Add New Integration
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose a provider to connect with your PharmaDOC account
          </Typography>
          
          <Grid container spacing={2}>
            {unconnectedProviders.map((provider) => (
              <Grid item xs={12} key={provider.id}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    {provider.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {provider.description}
                  </Typography>
                  <ProviderConnectButton
                    providerId={provider.id}
                    providerName={provider.name}
                    scopes={provider.scopes}
                    onSuccess={handleConnectProvider}
                    onError={(error) => console.error('Connection failed:', error)}
                    fullWidth
                  />
                </Paper>
                {unconnectedProviders.indexOf(provider) < unconnectedProviders.length - 1 && (
                  <Divider sx={{ my: 2 }} />
                )}
              </Grid>
            ))}
          </Grid>

          {unconnectedProviders.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                All available providers are already connected
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default IntegrationDashboard; 