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

      // Subscribe to research documents and shares
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

    // Subscribe to research documents and shares
    const subscription = supabase
      .channel('research')
      .on(
        'postgres_changes',
        {
          event: '*', // All events
          schema: 'public',
          table: 'research_documents'
        },
        handleResearchUpdate
      )
      .on(
        'postgres_changes',
        {
          event: '*', // All events
          schema: 'public',
          table: 'research_shares',
          filter: user.role === 'doctor' ? `doctor_id=eq.${user.id}` : undefined
        },
        handleResearchShareUpdate
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
    console.log('📱 Appointment real-time update:', payload);
    
    // Dispatch custom events for components to listen to
    const eventType = payload.eventType;
    const appointmentData = payload.new || payload.old;

    // Show user notification for relevant changes
    if (appointmentData && eventType !== 'DELETE') {
      const isUserInvolved = 
        appointmentData.doctor_id === user.id || 
        appointmentData.pharma_rep_id === user.id;

      if (isUserInvolved) {
        let message = '';
        switch (eventType) {
          case 'INSERT':
            message = 'New appointment scheduled';
            break;
          case 'UPDATE':
            if (appointmentData.status === 'confirmed') {
              message = 'Appointment confirmed';
            } else if (appointmentData.status === 'cancelled') {
              message = 'Appointment cancelled';
            } else if (appointmentData.status === 'completed') {
              message = 'Appointment completed';
            } else {
              message = 'Appointment updated';
            }
            break;
        }
        
        if (message) {
          enqueueSnackbar(message, { 
            variant: appointmentData.status === 'cancelled' ? 'warning' : 'info',
            autoHideDuration: 2500 
          });
        }
      }
    }

    // Dispatch custom events for different components
    window.dispatchEvent(new CustomEvent('appointmentUpdated', { 
      detail: { payload, eventType, appointmentData } 
    }));
    
    if (eventType === 'INSERT') {
      window.dispatchEvent(new CustomEvent('appointmentCreated', { 
        detail: { payload, appointmentData } 
      }));
    } else if (eventType === 'DELETE') {
      window.dispatchEvent(new CustomEvent('appointmentDeleted', { 
        detail: { payload, appointmentData: payload.old } 
      }));
    }

    // Enhanced invalidation for all appointment-related queries
    setTimeout(() => {
      // Dashboard queries
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: 'dashboard-stats' }
      }));
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: ['today-appointments'] }
      }));
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: 'upcoming-appointments' }
      }));
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: 'pending-actions' }
      }));
      
      // Appointments page queries
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: ['appointments'] }
      }));
      
      // Timeslots availability
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: ['available-timeslots'] }
      }));
    }, 100); // Small delay to ensure consistency
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
    console.log('📚 Research document real-time update:', payload);
    
    const eventType = payload.eventType;
    const documentData = payload.new || payload.old;

    // Show user notification for relevant changes
    if (documentData && eventType !== 'DELETE') {
      let message = '';
      switch (eventType) {
        case 'INSERT':
          if (documentData.is_public) {
            message = 'New public research document available';
          } else if (documentData.uploaded_by_id === user.id) {
            message = 'Your research document was uploaded successfully';
          }
          break;
        case 'UPDATE':
          if (documentData.uploaded_by_id === user.id) {
            message = 'Your research document was updated';
          }
          break;
      }
      
      if (message) {
              enqueueSnackbar(message, {
        variant: 'info',
        autoHideDuration: 2500 
        });
      }
    }

    // Dispatch custom events for components
    window.dispatchEvent(new CustomEvent('researchUpdated', { 
      detail: { payload, eventType, documentData } 
    }));

    // Invalidate research queries
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: ['research'] }
      }));
    }, 100);
  };

  const handleResearchShareUpdate = (payload) => {
    console.log('🤝 Research share real-time update:', payload);
    
    const eventType = payload.eventType;
    const shareData = payload.new || payload.old;

    // Show notification based on event type
    if (shareData && shareData.doctor_id === user.id) {
      if (eventType === 'INSERT') {
        enqueueSnackbar('New research document shared with you', { 
          variant: 'info',
          autoHideDuration: 2500 
        });
      } else if (eventType === 'DELETE') {
        enqueueSnackbar('Research document access has been revoked', { 
          variant: 'warning',
          autoHideDuration: 2500 
        });
      }
    }

    // Dispatch custom events for components
    window.dispatchEvent(new CustomEvent('researchShareUpdated', { 
      detail: { payload, eventType, shareData } 
    }));

    // Invalidate research queries
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('invalidateQuery', { 
        detail: { queryKey: ['research'] }
      }));
    }, 100);
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