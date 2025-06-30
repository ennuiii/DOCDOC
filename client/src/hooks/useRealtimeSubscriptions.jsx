import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from 'notistack';

/**
 * Custom hook for managing Supabase real-time subscriptions
 * Handles notifications, appointments, timeslots, and other real-time updates
 */
export const useRealtimeSubscriptions = () => {
  const { user, isAuthenticated } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const subscriptionsRef = useRef([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    if (!isAuthenticated() || !user) {
      return;
    }

    // Initialize real-time subscriptions
    initializeSubscriptions();

    // Cleanup on unmount
    return () => {
      cleanupSubscriptions();
    };
  }, [user, isAuthenticated]);

  const initializeSubscriptions = async () => {
    try {
      setConnectionStatus('connecting');

      // Subscribe to notifications for current user
      const notificationSubscription = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`
          },
          handleNewNotification
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`
          },
          handleNotificationUpdate
        )
        .subscribe();

      // Subscribe to appointments based on user role
      const appointmentSubscription = await subscribeToAppointments();

      // Subscribe to timeslots if user is doctor or staff
      const timeslotSubscription = await subscribeToTimeslots();

      // Subscribe to research documents if public or shared with user
      const researchSubscription = await subscribeToResearch();

      // Store subscriptions for cleanup
      subscriptionsRef.current = [
        notificationSubscription,
        appointmentSubscription,
        timeslotSubscription,
        researchSubscription
      ].filter(Boolean);

      setIsConnected(true);
      setConnectionStatus('connected');
      console.log('✅ Real-time subscriptions initialized');

    } catch (error) {
      console.error('❌ Failed to initialize real-time subscriptions:', error);
      setConnectionStatus('error');
      enqueueSnackbar('Failed to connect to real-time updates', { variant: 'warning' });
    }
  };

  const subscribeToAppointments = async () => {
    if (!user) return null;

    // Build filter based on user role
    let filter = '';
    switch (user.role) {
      case 'doctor':
        filter = `doctor_id=eq.${user.id}`;
        break;
      case 'pharma':
        filter = `pharma_rep_id=eq.${user.id}`;
        break;
      case 'staff':
        // Staff can see appointments for their assigned doctor
        if (user.profile?.assignedDoctorId) {
          filter = `doctor_id=eq.${user.profile.assignedDoctorId}`;
        } else {
          return null;
        }
        break;
      case 'admin':
        // Admin can see all appointments - no filter
        filter = '';
        break;
      default:
        return null;
    }

    const subscription = supabase
      .channel('appointments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
          filter: filter || undefined
        },
        handleAppointmentUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: filter || undefined
        },
        handleAppointmentUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'appointments',
          filter: filter || undefined
        },
        handleAppointmentUpdate
      )
      .subscribe();

    return subscription;
  };

  const subscribeToTimeslots = async () => {
    if (!user || !['doctor', 'staff', 'admin'].includes(user.role)) {
      return null;
    }

    let filter = '';
    if (user.role === 'doctor') {
      filter = `doctor_id=eq.${user.id}`;
    } else if (user.role === 'staff' && user.profile?.assignedDoctorId) {
      filter = `doctor_id=eq.${user.profile.assignedDoctorId}`;
    }
    // Admin gets all timeslots - no filter

    const subscription = supabase
      .channel('timeslots')
      .on(
        'postgres_changes',
        {
          event: '*', // All events
          schema: 'public',
          table: 'timeslots',
          filter: filter || undefined
        },
        handleTimeslotUpdate
      )
      .subscribe();

    return subscription;
  };

  const subscribeToResearch = async () => {
    if (!user) return null;

    // Subscribe to public research documents or those shared with user
    const subscription = supabase
      .channel('research')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'research_documents',
          filter: 'is_public=eq.true'
        },
        handleResearchUpdate
      )
      .subscribe();

    return subscription;
  };

  // Event handlers
  const handleNewNotification = (payload) => {
    const notification = payload.new;
    
    // Show toast notification
    enqueueSnackbar(notification.title, {
      variant: getNotificationVariant(notification.priority),
      action: notification.data?.link ? (
        <button 
          onClick={() => window.location.href = notification.data.link}
          style={{ color: 'white', textDecoration: 'underline' }}
        >
          View
        </button>
      ) : undefined
    });

    // Trigger custom event for components listening to notifications
    window.dispatchEvent(new CustomEvent('newNotification', { 
      detail: notification 
    }));
  };

  const handleNotificationUpdate = (payload) => {
    const notification = payload.new;
    
    // Trigger custom event for notification updates (e.g., read status)
    window.dispatchEvent(new CustomEvent('notificationUpdated', { 
      detail: notification 
    }));
  };

  const handleAppointmentUpdate = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    let message = '';
    let variant = 'info';

    switch (eventType) {
      case 'INSERT':
        if (newRecord.doctor_id === user.id) {
          message = `New appointment scheduled: ${newRecord.purpose}`;
          variant = 'success';
        } else if (newRecord.pharma_rep_id === user.id) {
          message = `Appointment booked successfully`;
          variant = 'success';
        }
        // Dispatch event for dashboard updates
        window.dispatchEvent(new CustomEvent('appointmentCreated', { 
          detail: newRecord 
        }));
        break;
      case 'UPDATE':
        // Check for status changes
        if (oldRecord.status !== newRecord.status) {
          if (newRecord.doctor_id === user.id) {
            switch (newRecord.status) {
              case 'confirmed':
                message = `Appointment confirmed: ${newRecord.purpose}`;
                variant = 'success';
                break;
              case 'completed':
                message = `Appointment completed: ${newRecord.purpose}`;
                variant = 'success';
                break;
              case 'cancelled':
                message = `Appointment cancelled: ${newRecord.purpose}`;
                variant = 'warning';
                break;
            }
          } else if (newRecord.pharma_rep_id === user.id) {
            switch (newRecord.status) {
              case 'confirmed':
                message = `Your appointment was confirmed: ${newRecord.purpose}`;
                variant = 'success';
                break;
              case 'cancelled':
                message = `Your appointment was cancelled: ${newRecord.purpose}`;
                variant = 'warning';
                break;
            }
          }
        }
        // Dispatch event for dashboard updates
        window.dispatchEvent(new CustomEvent('appointmentUpdated', { 
          detail: { old: oldRecord, new: newRecord }
        }));
        break;
      case 'DELETE':
        if (oldRecord.doctor_id === user.id || oldRecord.pharma_rep_id === user.id) {
          message = `Appointment deleted: ${oldRecord.purpose}`;
          variant = 'info';
        }
        // Dispatch event for dashboard updates
        window.dispatchEvent(new CustomEvent('appointmentDeleted', { 
          detail: oldRecord 
        }));
        break;
    }

    if (message) {
      enqueueSnackbar(message, { variant });
    }
  };

  const handleTimeslotUpdate = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Only show notifications for significant changes
    if (eventType === 'UPDATE' && oldRecord.status !== newRecord.status) {
      let message = '';
      
      if (oldRecord.status === 'available' && newRecord.status === 'booked') {
        message = `Timeslot booked: ${newRecord.date} ${newRecord.start_time}`;
      } else if (oldRecord.status === 'booked' && newRecord.status === 'available') {
        message = `Timeslot became available: ${newRecord.date} ${newRecord.start_time}`;
      }
      
      if (message) {
        enqueueSnackbar(message, { variant: 'info' });
      }
    }

    // Trigger custom event for components
    window.dispatchEvent(new CustomEvent('timeslotUpdate', { 
      detail: { eventType, timeslot: newRecord || oldRecord }
    }));
  };

  const handleResearchUpdate = (payload) => {
    const research = payload.new;
    
    // Only notify about new public research documents
    if (research.is_public && user.role === 'doctor') {
      enqueueSnackbar(`New research available: ${research.title}`, { 
        variant: 'info',
        action: (
          <button 
            onClick={() => window.location.href = '/research'}
            style={{ color: 'white', textDecoration: 'underline' }}
          >
            View
          </button>
        )
      });
    }

    // Trigger custom event
    window.dispatchEvent(new CustomEvent('researchUpdate', { 
      detail: research 
    }));
  };

  const getNotificationVariant = (priority) => {
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
      default:
        return 'info';
    }
  };

  const cleanupSubscriptions = () => {
    console.log('🧹 Cleaning up real-time subscriptions');
    
    subscriptionsRef.current.forEach(subscription => {
      if (subscription) {
        subscription.unsubscribe();
      }
    });
    
    subscriptionsRef.current = [];
    setIsConnected(false);
    setConnectionStatus('disconnected');
  };

  const reconnect = async () => {
    console.log('🔄 Reconnecting real-time subscriptions');
    cleanupSubscriptions();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    initializeSubscriptions();
  };

  return {
    isConnected,
    connectionStatus,
    reconnect,
    cleanup: cleanupSubscriptions
  };
};

export default useRealtimeSubscriptions; 