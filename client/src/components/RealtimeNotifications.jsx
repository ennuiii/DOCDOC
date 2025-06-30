import React, { useState, useEffect } from 'react';
import {
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  NotificationsNone as NotificationsNoneIcon,
  Circle as CircleIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// Get API URL from environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const RealtimeNotifications = () => {
  const { user } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const open = Boolean(anchorEl);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      
      // Listen for real-time notification events
      const handleNewNotification = (event) => {
        const newNotification = event.detail;
        setNotifications(prev => [newNotification, ...prev]);
        setUnreadCount(prev => prev + 1);
      };

      const handleNotificationUpdate = (event) => {
        const updatedNotification = event.detail;
        setNotifications(prev => 
          prev.map(notif => 
            notif.id === updatedNotification.id ? updatedNotification : notif
          )
        );
        
        // Update unread count if notification was marked as read
        if (updatedNotification.read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      };

      window.addEventListener('newNotification', handleNewNotification);
      window.addEventListener('notificationUpdated', handleNotificationUpdate);

      return () => {
        window.removeEventListener('newNotification', handleNewNotification);
        window.removeEventListener('notificationUpdated', handleNotificationUpdate);
      };
    }
  }, [user]);

  const fetchNotifications = async () => {
    if (!user?.id) {
      console.log('❌ No user ID available for notifications');
      return;
    }

    console.log('📊 Fetching notifications for user:', user.id);
    
    setLoading(true);
    setError(null);
    
    try {
      // Get auth token for the request
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('❌ No auth token available');
        setError('Authentication required');
        return;
      }

      const response = await fetch(`${API_URL}/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📊 Notifications API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('📊 Notifications fetched:', {
          total: data.notifications?.length || 0,
          unread: data.notifications?.filter(n => !n.read)?.length || 0,
          data: data.notifications
        });
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to fetch notifications:', response.statusText, errorData);
        setError('Failed to load notifications');
      }
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    if (notifications.length === 0) {
      fetchNotifications();
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const markAsRead = async (notificationId) => {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('❌ No auth token available for mark as read');
        return;
      }

      const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev =>
          prev.map(notif =>
            notif.id === notificationId 
              ? { ...notif, read: true, read_at: new Date().toISOString() }
              : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } else {
        console.error('Failed to mark notification as read');
      }

    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      
      if (unreadIds.length === 0) return;

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('❌ No auth token available for mark all as read');
        return;
      }

      const response = await fetch(`${API_URL}/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev =>
          prev.map(notif => ({ ...notif, read: true, read_at: new Date().toISOString() }))
        );
        setUnreadCount(0);
      } else {
        console.error('Failed to mark all notifications as read');
      }

    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const getNotificationIcon = (type, priority) => {
    const color = priority === 'high' ? 'error' : priority === 'medium' ? 'warning' : 'info';
    
    switch (type) {
      case 'appointment-scheduled':
      case 'appointment-confirmed':
      case 'appointment-completed':
        return <CheckCircleIcon color={color} />;
      case 'appointment-cancelled':
        return <WarningIcon color={color} />;
      case 'system':
        return <InfoIcon color={color} />;
      default:
        return <CircleIcon color={color} />;
    }
  };

  const getPriorityChip = (priority) => {
    const colors = {
      high: 'error',
      medium: 'warning',
      low: 'default'
    };
    
    return (
      <Chip 
        label={priority} 
        size="small" 
        color={colors[priority] || 'default'}
        variant="outlined"
      />
    );
  };

  const handleNotificationClick = (notification) => {
    // Mark as read when clicked
    if (!notification.read) {
      markAsRead(notification.id);
    }

    // Navigate to link if provided
    if (notification.data?.link) {
      handleClose();
      window.location.href = notification.data.link;
    }
  };

  if (!user) return null;

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        aria-label="notifications"
      >
        <Badge badgeContent={unreadCount} color="error">
          {unreadCount > 0 ? <NotificationsIcon /> : <NotificationsNoneIcon />}
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { 
            width: 400, 
            maxHeight: 500,
            overflow: 'visible'
          }
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Notifications</Typography>
          <Box>
            <IconButton size="small" onClick={fetchNotifications} disabled={loading}>
              <RefreshIcon />
            </IconButton>
            {unreadCount > 0 && (
              <Button 
                size="small" 
                onClick={markAllAsRead}
                sx={{ ml: 1 }}
              >
                Mark all read
              </Button>
            )}
          </Box>
        </Box>
        
        <Divider />

        {loading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 1 }}>
            {error}
            <Button onClick={fetchNotifications} size="small" sx={{ ml: 1 }}>
              Retry
            </Button>
          </Alert>
        ) : notifications.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No notifications yet
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0, maxHeight: 400, overflow: 'auto' }}>
            {notifications.map((notification) => (
              <ListItem
                key={notification.id}
                button
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  backgroundColor: notification.read ? 'transparent' : 'action.hover',
                  borderLeft: notification.read ? 'none' : '4px solid',
                  borderLeftColor: notification.priority === 'high' ? 'error.main' : 
                                  notification.priority === 'medium' ? 'warning.main' : 'info.main'
                }}
              >
                <ListItemIcon>
                  {getNotificationIcon(notification.type, notification.priority)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography 
                        variant="subtitle2"
                        sx={{ 
                          fontWeight: notification.read ? 'normal' : 'bold',
                          flex: 1
                        }}
                      >
                        {notification.title}
                      </Typography>
                      {getPriorityChip(notification.priority)}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </Typography>
                    </Box>
                  }
                />
                {!notification.read && (
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                      }}
                      aria-label="mark as read"
                    >
                      <CheckCircleIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </Menu>
    </>
  );
};

export default RealtimeNotifications; 