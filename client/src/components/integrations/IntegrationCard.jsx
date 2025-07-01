import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Box,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

/**
 * IntegrationCard - Displays information about a calendar/video provider integration
 * @param {Object} props
 * @param {string} props.providerId - Provider identifier (google, microsoft, zoom, caldav)
 * @param {string} props.providerName - Display name for the provider
 * @param {string} props.providerLogo - URL or icon for the provider logo
 * @param {string} props.status - Connection status (connected, disconnected, error, warning)
 * @param {Date} props.lastSync - Last synchronization timestamp
 * @param {Object} props.user - Connected user information
 * @param {string[]} props.scopes - Connected OAuth scopes
 * @param {Function} props.onConnect - Handler for connect/reconnect action
 * @param {Function} props.onDisconnect - Handler for disconnect action
 * @param {Function} props.onSettings - Handler for opening settings
 * @param {Function} props.onRefresh - Handler for manual refresh
 * @param {boolean} props.loading - Whether the card is in loading state
 */
const IntegrationCard = ({
  providerId,
  providerName,
  providerLogo,
  status = 'disconnected',
  lastSync,
  user,
  scopes = [],
  onConnect,
  onDisconnect,
  onSettings,
  onRefresh,
  loading = false,
}) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'success',
          icon: <ConnectedIcon color="success" />,
          text: 'Connected',
        };
      case 'error':
        return {
          color: 'error',
          icon: <ErrorIcon color="error" />,
          text: 'Connection Error',
        };
      case 'warning':
        return {
          color: 'warning',
          icon: <WarningIcon color="warning" />,
          text: 'Needs Attention',
        };
      default:
        return {
          color: 'default',
          icon: null,
          text: 'Not Connected',
        };
    }
  };

  const statusInfo = getStatusInfo();

  const formatLastSync = () => {
    if (!lastSync) return 'Never';
    
    const now = new Date();
    const diffMs = now - new Date(lastSync);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <Card 
      sx={{ 
        minWidth: 320, 
        height: '100%',
        opacity: loading ? 0.7 : 1,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        }
      }}
    >
      <CardContent>
        {/* Provider Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar
            src={providerLogo}
            sx={{ 
              width: 48, 
              height: 48, 
              mr: 2,
              bgcolor: 'primary.light'
            }}
          >
            {providerName.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="div">
              {providerName}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
              {statusInfo.icon}
              <Chip
                label={statusInfo.text}
                color={statusInfo.color}
                size="small"
                sx={{ ml: 1 }}
              />
            </Box>
          </Box>
          <Box>
            {status === 'connected' && (
              <Tooltip title="Refresh Connection">
                <IconButton
                  onClick={onRefresh}
                  disabled={loading}
                  size="small"
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Settings">
              <IconButton
                onClick={onSettings}
                disabled={loading}
                size="small"
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Connection Details */}
        {status === 'connected' && user && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Connected as:
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {user.name} ({user.email})
            </Typography>
          </Box>
        )}

        {/* Last Sync */}
        {status === 'connected' && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Last sync: {formatLastSync()}
            </Typography>
          </Box>
        )}

        {/* Scopes */}
        {scopes.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Permissions:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {scopes.slice(0, 3).map((scope) => (
                <Chip
                  key={scope}
                  label={scope}
                  size="small"
                  variant="outlined"
                />
              ))}
              {scopes.length > 3 && (
                <Chip
                  label={`+${scopes.length - 3} more`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              )}
            </Box>
          </Box>
        )}

        {/* Error Message */}
        {status === 'error' && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            Unable to connect. Please check your credentials and try again.
          </Typography>
        )}

        {/* Warning Message */}
        {status === 'warning' && (
          <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
            Token expires soon. Please reconnect to maintain access.
          </Typography>
        )}
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        {status === 'connected' ? (
          <Button
            variant="outlined"
            color="error"
            onClick={onDisconnect}
            disabled={loading}
            size="small"
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={onConnect}
            disabled={loading}
            size="small"
            sx={{ minWidth: 100 }}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </Button>
        )}
        
        <Typography variant="caption" color="text.secondary">
          {providerId}
        </Typography>
      </CardActions>
    </Card>
  );
};

export default IntegrationCard; 