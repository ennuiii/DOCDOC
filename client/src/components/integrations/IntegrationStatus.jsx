import React, { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  LinearProgress,
  Tooltip,
  IconButton,
  Badge,
  Grid,
  Card,
  CardContent,
  Divider,
  Alert,
  Tab,
  Tabs,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Sync as SyncIcon,
  SyncDisabled as SyncDisabledIcon,
  Refresh as RefreshIcon,
  Psychology as AIIcon,
  Timeline as TrendIcon,
  Navigation as TravelIcon,
  Schedule as ConflictIcon,
  Speed as PerformanceIcon,
  Analytics as AnalyticsIcon,
  TrendingUp as InsightIcon,
  AutoAwesome as SmartIcon,
} from '@mui/icons-material';

/**
 * IntegrationStatus - Displays a compact overview of all integration statuses
 * @param {Object} props
 * @param {Array} props.integrations - Array of integration objects with status information
 * @param {boolean} props.isSyncing - Whether any integration is currently syncing
 * @param {Function} props.onRefreshAll - Handler to refresh all integrations
 * @param {boolean} props.compact - Whether to show compact view
 * @param {string} props.title - Custom title for the status component
 */
const IntegrationStatus = ({
  integrations = [],
  isSyncing = false,
  onRefreshAll,
  compact = false,
  title = 'Integration Status',
}) => {
  const getStatusCounts = () => {
    const counts = {
      connected: 0,
      error: 0,
      warning: 0,
      disconnected: 0,
      total: integrations.length,
    };

    integrations.forEach((integration) => {
      counts[integration.status] = (counts[integration.status] || 0) + 1;
    });

    return counts;
  };

  const getHealthScore = () => {
    const counts = getStatusCounts();
    if (counts.total === 0) return 0;
    
    const score = (counts.connected / counts.total) * 100;
    return Math.round(score);
  };

  const getHealthColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  const getOverallStatus = () => {
    const counts = getStatusCounts();
    
    if (counts.error > 0) {
      return {
        icon: <ErrorIcon color="error" />,
        text: 'Issues Detected',
        color: 'error',
      };
    }
    
    if (counts.warning > 0) {
      return {
        icon: <WarningIcon color="warning" />,
        text: 'Needs Attention',
        color: 'warning',
      };
    }
    
    if (counts.connected === counts.total && counts.total > 0) {
      return {
        icon: <ConnectedIcon color="success" />,
        text: 'All Connected',
        color: 'success',
      };
    }
    
    if (counts.connected > 0) {
      return {
        icon: <SyncIcon color="primary" />,
        text: 'Partially Connected',
        color: 'primary',
      };
    }
    
    return {
      icon: <SyncDisabledIcon color="disabled" />,
      text: 'Not Connected',
      color: 'disabled',
    };
  };

  const counts = getStatusCounts();
  const healthScore = getHealthScore();
  const healthColor = getHealthColor(healthScore);
  const overallStatus = getOverallStatus();

  if (compact) {
    return (
      <Paper
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          backgroundColor: 'background.default',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {overallStatus.icon}
          <Typography variant="body2" fontWeight="medium">
            {overallStatus.text}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {counts.connected > 0 && (
            <Chip
              label={`${counts.connected} Connected`}
              color="success"
              size="small"
              variant="outlined"
            />
          )}
          {counts.error > 0 && (
            <Chip
              label={`${counts.error} Error`}
              color="error"
              size="small"
              variant="outlined"
            />
          )}
          {counts.warning > 0 && (
            <Chip
              label={`${counts.warning} Warning`}
              color="warning"
              size="small"
              variant="outlined"
            />
          )}
        </Box>

        {onRefreshAll && (
          <Tooltip title="Refresh All Integrations">
            <IconButton
              size="small"
              onClick={onRefreshAll}
              disabled={isSyncing}
            >
              <Badge
                color="primary"
                variant="dot"
                invisible={!isSyncing}
              >
                <RefreshIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        )}
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="div">
          {title}
        </Typography>
        {onRefreshAll && (
          <Tooltip title="Refresh All Integrations">
            <IconButton
              onClick={onRefreshAll}
              disabled={isSyncing}
              color="primary"
            >
              <Badge
                color="primary"
                variant="dot"
                invisible={!isSyncing}
              >
                <RefreshIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Overall Status */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {overallStatus.icon}
          <Typography variant="body1" fontWeight="medium">
            {overallStatus.text}
          </Typography>
          <Chip
            label={`${healthScore}% Healthy`}
            color={healthColor}
            size="small"
          />
        </Box>

        {/* Health Progress Bar */}
        <Box sx={{ mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={healthScore}
            color={healthColor}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'grey.200',
            }}
          />
        </Box>
      </Box>

      {/* Status Breakdown */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ConnectedIcon color="success" fontSize="small" />
          <Typography variant="body2">
            Connected: {counts.connected}
          </Typography>
        </Box>

        {counts.error > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ErrorIcon color="error" fontSize="small" />
            <Typography variant="body2">
              Errors: {counts.error}
            </Typography>
          </Box>
        )}

        {counts.warning > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WarningIcon color="warning" fontSize="small" />
            <Typography variant="body2">
              Warnings: {counts.warning}
            </Typography>
          </Box>
        )}

        {counts.disconnected > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <SyncDisabledIcon color="disabled" fontSize="small" />
            <Typography variant="body2">
              Disconnected: {counts.disconnected}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Sync Status */}
      {isSyncing && (
        <Box sx={{ mt: 2, p: 1.5, backgroundColor: 'action.hover', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SyncIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="primary">
              Synchronizing integrations...
            </Typography>
          </Box>
        </Box>
      )}

      {/* Integration List */}
      {integrations.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Providers ({integrations.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {integrations.map((integration) => (
              <Tooltip
                key={integration.providerId}
                title={`${integration.providerName}: ${integration.status}`}
              >
                <Chip
                  label={integration.providerName}
                  color={
                    integration.status === 'connected' ? 'success' :
                    integration.status === 'error' ? 'error' :
                    integration.status === 'warning' ? 'warning' :
                    'default'
                  }
                  size="small"
                  variant={integration.status === 'connected' ? 'filled' : 'outlined'}
                />
              </Tooltip>
            ))}
          </Box>
        </Box>
      )}

      {/* Empty State */}
      {integrations.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <SyncDisabledIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No integrations configured
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default IntegrationStatus; 