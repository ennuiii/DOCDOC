import { Card, CardContent, Typography, Box, IconButton, Chip, Avatar } from '@mui/material';
import { styled } from '@mui/material/styles';
import { 
  Close, 
  CheckCircle, 
  Warning, 
  Error, 
  Info,
  Schedule,
  Person,
  Event,
} from '@mui/icons-material';
import { useState } from 'react';

const StyledNotificationCard = styled(Card)(({ theme, severity = 'info' }) => {
  const severityStyles = {
    success: {
      borderLeft: `4px solid ${theme.palette.success.main}`,
      backgroundColor: '#f0fdf4',
      '& .notification-icon': {
        color: theme.palette.success.main,
        backgroundColor: '#dcfce7',
      },
    },
    warning: {
      borderLeft: `4px solid ${theme.palette.warning.main}`,
      backgroundColor: '#fffbeb',
      '& .notification-icon': {
        color: theme.palette.warning.main,
        backgroundColor: '#fef3c7',
      },
    },
    error: {
      borderLeft: `4px solid ${theme.palette.error.main}`,
      backgroundColor: '#fef2f2',
      '& .notification-icon': {
        color: theme.palette.error.main,
        backgroundColor: '#fecaca',
      },
    },
    info: {
      borderLeft: `4px solid ${theme.palette.info.main}`,
      backgroundColor: '#f0f9ff',
      '& .notification-icon': {
        color: theme.palette.info.main,
        backgroundColor: '#dbeafe',
      },
    },
  };

  return {
    borderRadius: 12,
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    transition: 'all 0.3s ease-in-out',
    position: 'relative',
    overflow: 'hidden',
    ...severityStyles[severity],
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
    },
  };
});

const getSeverityIcon = (severity) => {
  const icons = {
    success: CheckCircle,
    warning: Warning,
    error: Error,
    info: Info,
  };
  return icons[severity] || Info;
};

const getTypeIcon = (type) => {
  const icons = {
    appointment: Event,
    schedule: Schedule,
    user: Person,
    system: Info,
  };
  return icons[type] || Info;
};

const NotificationCard = ({
  title,
  message,
  severity = 'info',
  type = 'system',
  timestamp,
  actions,
  onClose,
  avatar,
  chips = [],
  sx = {},
  ...props
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const SeverityIcon = getSeverityIcon(severity);
  const TypeIcon = getTypeIcon(type);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <StyledNotificationCard 
      severity={severity} 
      sx={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'all 0.3s ease-in-out',
        ...sx,
      }}
      {...props}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" alignItems="flex-start" gap={2}>
          {/* Icon */}
          <Avatar 
            className="notification-icon"
            sx={{ 
              width: 40, 
              height: 40,
              '& .MuiSvgIcon-root': {
                fontSize: '1.25rem',
              },
            }}
          >
            {avatar || <SeverityIcon />}
          </Avatar>

          {/* Content */}
          <Box flex={1}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  fontWeight: 600,
                  color: 'text.primary',
                }}
              >
                {title}
              </Typography>
              
              <Box display="flex" alignItems="center" gap={1}>
                {timestamp && (
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ fontSize: '0.75rem' }}
                  >
                    {timestamp}
                  </Typography>
                )}
                
                {onClose && (
                  <IconButton 
                    size="small" 
                    onClick={handleClose}
                    sx={{ 
                      color: 'text.secondary',
                      '&:hover': {
                        backgroundColor: 'rgba(0,0,0,0.04)',
                      },
                    }}
                  >
                    <Close fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>

            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{ mb: chips.length > 0 || actions ? 1.5 : 0 }}
            >
              {message}
            </Typography>

            {/* Chips */}
            {chips.length > 0 && (
              <Box display="flex" gap={1} mb={actions ? 1.5 : 0} flexWrap="wrap">
                {chips.map((chip, index) => (
                  <Chip
                    key={index}
                    label={chip.label}
                    size="small"
                    variant="outlined"
                    icon={chip.icon}
                    sx={{
                      height: 24,
                      fontSize: '0.75rem',
                      borderColor: 'rgba(0,0,0,0.12)',
                      backgroundColor: 'rgba(255,255,255,0.8)',
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Actions */}
            {actions && (
              <Box display="flex" gap={1} flexWrap="wrap">
                {actions}
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </StyledNotificationCard>
  );
};

// Toast notification component
export const ToastNotification = ({
  message,
  severity = 'info',
  duration = 4000,
  onClose,
  sx = {},
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useState(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'all 0.3s ease-in-out',
        ...sx,
      }}
    >
      <NotificationCard
        title={severity.charAt(0).toUpperCase() + severity.slice(1)}
        message={message}
        severity={severity}
        onClose={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
      />
    </Box>
  );
};

export default NotificationCard;
