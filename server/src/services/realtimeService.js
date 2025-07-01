import { supabaseAdmin } from '../config/supabase.js';

/**
 * Service for managing real-time events and notifications
 * Provides centralized functions to trigger real-time updates
 */
class RealtimeService {
  
  /**
   * Create and send a notification to a user
   */
  static async createNotification(notificationData) {
    try {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .insert({
          recipient_id: notificationData.recipientId,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data || {},
          priority: notificationData.priority || 'medium'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`📢 Real-time notification sent to ${notificationData.recipientId}: ${notificationData.title}`);
      return data;

    } catch (error) {
      console.error('❌ Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Notify about appointment events
   */
  static async notifyAppointmentEvent(eventType, appointment, additionalData = {}) {
    try {
      let notifications = [];

      switch (eventType) {
        case 'scheduled':
          // Notify doctor about new appointment
          notifications.push({
            recipientId: appointment.doctor_id,
            type: 'appointment-scheduled',
            title: 'New Appointment Scheduled',
            message: `A pharmaceutical representative has scheduled an appointment with you`,
            priority: 'high',
            data: {
              appointmentId: appointment.id,
              link: '/appointments'
            }
          });
          break;

        case 'confirmed':
          // Notify pharma rep about confirmation
          notifications.push({
            recipientId: appointment.pharma_rep_id,
            type: 'appointment-confirmed',
            title: 'Appointment Confirmed',
            message: `Your appointment has been confirmed by the doctor`,
            priority: 'medium',
            data: {
              appointmentId: appointment.id,
              link: '/appointments'
            }
          });
          break;

        case 'cancelled':
          // Notify both parties about cancellation
          const cancelledBy = additionalData.cancelledBy;
          const reason = additionalData.reason || 'No reason provided';
          
          // Notify the other party (not the one who cancelled)
          const otherPartyId = cancelledBy === appointment.doctor_id 
            ? appointment.pharma_rep_id 
            : appointment.doctor_id;
          
          notifications.push({
            recipientId: otherPartyId,
            type: 'appointment-cancelled',
            title: 'Appointment Cancelled',
            message: `Your appointment has been cancelled. Reason: ${reason}`,
            priority: 'high',
            data: {
              appointmentId: appointment.id,
              link: '/appointments'
            }
          });
          break;

        case 'completed':
          // Notify both parties about completion
          notifications.push(
            {
              recipientId: appointment.doctor_id,
              type: 'appointment-completed',
              title: 'Appointment Completed',
              message: `Your appointment has been marked as completed`,
              priority: 'low',
              data: {
                appointmentId: appointment.id,
                link: '/appointments'
              }
            },
            {
              recipientId: appointment.pharma_rep_id,
              type: 'appointment-completed',
              title: 'Appointment Completed',
              message: `Your appointment has been marked as completed`,
              priority: 'low',
              data: {
                appointmentId: appointment.id,
                link: '/appointments'
              }
            }
          );
          break;

        case 'reminder':
          // Send reminder notifications
          const reminderTime = additionalData.reminderTime || '1 hour';
          notifications.push(
            {
              recipientId: appointment.doctor_id,
              type: 'appointment-reminder',
              title: 'Upcoming Appointment',
              message: `You have an appointment in ${reminderTime}`,
              priority: 'medium',
              data: {
                appointmentId: appointment.id,
                link: '/appointments'
              }
            },
            {
              recipientId: appointment.pharma_rep_id,
              type: 'appointment-reminder',
              title: 'Upcoming Appointment',
              message: `You have an appointment in ${reminderTime}`,
              priority: 'medium',
              data: {
                appointmentId: appointment.id,
                link: '/appointments'
              }
            }
          );
          break;
      }

      // Send all notifications
      const results = await Promise.all(
        notifications.map(notif => this.createNotification(notif))
      );

      return results;

    } catch (error) {
      console.error('❌ Failed to send appointment notifications:', error);
      throw error;
    }
  }

  /**
   * Notify about timeslot changes
   */
  static async notifyTimeslotEvent(eventType, timeslot, additionalData = {}) {
    try {
      const notifications = [];

      switch (eventType) {
        case 'created':
          // Could notify staff about new timeslots if needed
          break;

        case 'booked':
          // Notify doctor that their timeslot was booked
          notifications.push({
            recipientId: timeslot.doctor_id,
            type: 'timeslot-booked',
            title: 'Timeslot Booked',
            message: `Your timeslot for ${timeslot.date} at ${timeslot.start_time} has been booked`,
            priority: 'medium',
            data: {
              timeslotId: timeslot.id,
              link: '/timeslots'
            }
          });
          break;

        case 'cancelled':
          // Notify about timeslot cancellation
          if (additionalData.affectedUsers) {
            additionalData.affectedUsers.forEach(userId => {
              notifications.push({
                recipientId: userId,
                type: 'timeslot-cancelled',
                title: 'Timeslot Cancelled',
                message: `A timeslot you were interested in has been cancelled`,
                priority: 'medium',
                data: {
                  timeslotId: timeslot.id,
                  link: '/timeslots'
                }
              });
            });
          }
          break;
      }

      // Send all notifications
      const results = await Promise.all(
        notifications.map(notif => this.createNotification(notif))
      );

      return results;

    } catch (error) {
      console.error('❌ Failed to send timeslot notifications:', error);
      throw error;
    }
  }

  /**
   * Notify about research document events
   */
  static async notifyResearchEvent(eventType, research, additionalData = {}) {
    try {
      const notifications = [];

      switch (eventType) {
        case 'shared':
          // Notify about new research shared publicly
          if (research.is_public) {
            // Get all doctors to notify about new public research
            const { data: doctors } = await supabaseAdmin
              .from('users')
              .select('id')
              .eq('role', 'doctor');

            if (doctors) {
              doctors.forEach(doctor => {
                notifications.push({
                  recipientId: doctor.id,
                  type: 'research-available',
                  title: 'New Research Available',
                  message: `New research document: ${research.title}`,
                  priority: 'low',
                  data: {
                    researchId: research.id,
                    link: '/research'
                  }
                });
              });
            }
          }
          break;

        case 'updated':
          // Notify specific users if research was shared with them
          if (additionalData.sharedWithUsers) {
            additionalData.sharedWithUsers.forEach(userId => {
              notifications.push({
                recipientId: userId,
                type: 'research-updated',
                title: 'Research Document Updated',
                message: `Research document "${research.title}" has been updated`,
                priority: 'low',
                data: {
                  researchId: research.id,
                  link: '/research'
                }
              });
            });
          }
          break;
      }

      // Send notifications in batches to avoid overwhelming the system
      if (notifications.length > 0) {
        const batchSize = 10;
        for (let i = 0; i < notifications.length; i += batchSize) {
          const batch = notifications.slice(i, i + batchSize);
          await Promise.all(batch.map(notif => this.createNotification(notif)));
          
          // Small delay between batches
          if (i + batchSize < notifications.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      return notifications.length;

    } catch (error) {
      console.error('❌ Failed to send research notifications:', error);
      throw error;
    }
  }

  /**
   * Send system notifications
   */
  static async sendSystemNotification(recipientIds, title, message, priority = 'medium', data = {}) {
    try {
      const notifications = Array.isArray(recipientIds) 
        ? recipientIds.map(id => ({
            recipientId: id,
            type: 'system',
            title,
            message,
            priority,
            data
          }))
        : [{
            recipientId: recipientIds,
            type: 'system',
            title,
            message,
            priority,
            data
          }];

      const results = await Promise.all(
        notifications.map(notif => this.createNotification(notif))
      );

      console.log(`📢 System notification sent to ${notifications.length} recipient(s): ${title}`);
      return results;

    } catch (error) {
      console.error('❌ Failed to send system notification:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationAsRead(notificationId, userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('notifications')
        .update({ 
          read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .eq('recipient_id', userId)
        .select()
        .single();

      if (error) throw error;

      return data;

    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(userId, options = {}) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        unreadOnly = false,
        type = null 
      } = options;

      let query = supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false });

      if (unreadOnly) {
        query = query.eq('read', false);
      }

      if (type) {
        query = query.eq('type', type);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('❌ Failed to get user notifications:', error);
      throw error;
    }
  }

  /**
   * Clean up old notifications
   */
  static async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabaseAdmin
        .from('notifications')
        .delete()
        .lt('created_at', cutoffDate.toISOString())
        .eq('read', true);

      if (error) throw error;

      console.log(`🧹 Cleaned up old notifications older than ${daysOld} days`);
      return data;

    } catch (error) {
      console.error('❌ Failed to cleanup old notifications:', error);
      throw error;
    }
  }
}

export default RealtimeService; 