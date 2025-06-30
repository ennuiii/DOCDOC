import React from 'react';
import {
  Chip,
  Tooltip,
  IconButton,
  Box
} from '@mui/material';
import {
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
  Sync as SyncIcon,
  Error as ErrorIcon
} from '@mui/icons-material';

const RealtimeStatusIndicator = ({ 
  isConnected, 
  connectionStatus, 
  onReconnect,
  showText = false,
  size = 'small'
}) => {
  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          color: 'success',
          icon: <WifiIcon />,
          label: 'Connected',
          tooltip: 'Real-time updates active'
        };
      case 'connecting':
        return {
          color: 'warning',
          icon: <SyncIcon className="rotating" />,
          label: 'Connecting',
          tooltip: 'Connecting to real-time updates...'
        };
      case 'disconnected':
        return {
          color: 'default',
          icon: <WifiOffIcon />,
          label: 'Disconnected',
          tooltip: 'Real-time updates inactive'
        };
      case 'error':
        return {
          color: 'error',
          icon: <ErrorIcon />,
          label: 'Error',
          tooltip: 'Failed to connect to real-time updates'
        };
      default:
        return {
          color: 'default',
          icon: <WifiOffIcon />,
          label: 'Unknown',
          tooltip: 'Connection status unknown'
        };
    }
  };

  const { color, icon, label, tooltip } = getStatusConfig();

  const handleClick = () => {
    if (connectionStatus === 'error' || connectionStatus === 'disconnected') {
      onReconnect?.();
    }
  };

  if (showText) {
    return (
      <Tooltip title={tooltip}>
        <Chip
          icon={icon}
          label={label}
          color={color}
          size={size}
          onClick={handleClick}
          clickable={connectionStatus === 'error' || connectionStatus === 'disconnected'}
          sx={{
            '& .rotating': {
              animation: 'spin 1s linear infinite'
            },
            '@keyframes spin': {
              '0%': {
                transform: 'rotate(0deg)'
              },
              '100%': {
                transform: 'rotate(360deg)'
              }
            }
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltip}>
      <IconButton
        size={size}
        onClick={handleClick}
        disabled={connectionStatus === 'connecting'}
        sx={{
          color: color === 'success' ? 'success.main' :
                 color === 'warning' ? 'warning.main' :
                 color === 'error' ? 'error.main' : 'text.secondary',
          '& .rotating': {
            animation: 'spin 1s linear infinite'
          },
          '@keyframes spin': {
            '0%': {
              transform: 'rotate(0deg)'
            },
            '100%': {
              transform: 'rotate(360deg)'
            }
          }
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
};

export default RealtimeStatusIndicator; 