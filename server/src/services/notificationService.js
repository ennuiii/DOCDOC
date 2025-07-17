import { supabaseAdmin } from '../config/supabase.js';

class NotificationService {
  // Helper method to create notification in Supabase
  static async createNotification(data) {
    try {
      const supabase = supabaseAdmin();
      const { data: notification, error } = await supabase
        .from('notifications')
        .insert([{
          recipient_id: data.recipient,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data || {},
          read: false,
          priority: data.priority || 'medium'
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating notification:', error);
        throw error;
      }

      console.log('📨 Notification created:', notification);
      return notification;
    } catch (error) {
      console.error('Error in createNotification:', error);
      // Don't throw error to prevent breaking the main flow
      return null;
    }
  }

  // Appointment notifications
  static async notifyAppointmentScheduled(data) {
    await this.createNotification({
      recipient: data.doctor?._id || data.doctorId,
      type: 'appointment-scheduled',
      title: 'New Appointment Scheduled',
      message: `${data.pharmaRep?.profile?.firstName || data.pharmaRepName} from ${data.pharmaRep?.profile?.companyName || data.companyName} has scheduled an appointment on ${data.timeslot?.date || data.date} at ${data.timeslot?.startTime || data.startTime}`,
      data: {
        appointmentId: data._id || data.appointmentId,
        link: `/appointments`,
      },
      priority: 'high',
    });
  }

  static async notifyAppointmentConfirmed(data) {
    await this.createNotification({
      recipient: data.pharmaRep?._id || data.pharmaRepId,
      type: 'appointment-confirmed',
      title: 'Appointment Confirmed',
      message: `Your appointment with Dr. ${data.doctor?.profile?.lastName || data.doctorName} on ${data.timeslot?.date || data.date} at ${data.timeslot?.startTime || data.startTime} has been confirmed`,
      data: {
        appointmentId: data._id || data.appointmentId,
        link: `/appointments`,
      },
      priority: 'medium',
    });
  }

  static async notifyAppointmentCancelled(data, cancelledBy, reason) {
    const recipientId = cancelledBy?.toString() === (data.doctor?._id || data.doctorId)?.toString() 
      ? (data.pharmaRep?._id || data.pharmaRepId)
      : (data.doctor?._id || data.doctorId);
    
    const cancellerName = cancelledBy?.toString() === (data.doctor?._id || data.doctorId)?.toString()
      ? `Dr. ${data.doctor?.profile?.lastName || data.doctorName || 'Doctor'}`
      : `${data.pharmaRep?.profile?.firstName || data.pharmaRepName || 'Pharma Rep'}`;

    await this.createNotification({
      recipient: recipientId,
      type: 'appointment-cancelled',
      title: 'Appointment Cancelled',
      message: `Your appointment on ${data.timeslot?.date || data.date} at ${data.timeslot?.startTime || data.startTime} has been cancelled by ${cancellerName}${reason ? `. Reason: ${reason}` : ''}`,
      data: {
        appointmentId: data._id || data.appointmentId,
        link: `/appointments`,
      },
      priority: 'high',
    });
  }

  static async notifyAppointmentCompleted(data) {
    await this.createNotification({
      recipient: data.pharmaRep?._id || data.pharmaRepId,
      type: 'appointment-completed',
      title: 'Appointment Completed',
      message: `Your appointment with Dr. ${data.doctor?.profile?.lastName || data.doctorName || 'Doctor'} has been marked as completed. Thank you for your visit!`,
      data: {
        appointmentId: data._id || data.appointmentId,
        link: `/appointments`,
      },
      priority: 'low',
    });
  }

  static async notifyAppointmentReminder(appointment) {
    // Notify both parties
    await Promise.all([
      this.createNotification({
        recipient: appointment.doctor,
        type: 'appointment-reminder',
        title: 'Appointment Reminder',
        message: `Reminder: You have an appointment with ${appointment.pharmaRep.profile.firstName} ${appointment.pharmaRep.profile.lastName} tomorrow at ${appointment.timeslot.startTime}`,
        data: {
          appointmentId: appointment._id,
          link: `/appointments`,
        },
        priority: 'medium',
      }),
      this.createNotification({
        recipient: appointment.pharmaRep,
        type: 'appointment-reminder',
        title: 'Appointment Reminder',
        message: `Reminder: You have an appointment with Dr. ${appointment.doctor.profile.lastName} tomorrow at ${appointment.timeslot.startTime}`,
        data: {
          appointmentId: appointment._id,
          link: `/appointments`,
        },
        priority: 'medium',
      }),
    ]);
  }

  // Research notifications
  static async notifyResearchShared(research, doctors) {
    const notifications = doctors.map(doctorId => ({
      recipient: doctorId,
      type: 'research-shared',
      title: 'New Research Shared With You',
      message: `${research.companyName} has shared a research document: "${research.title}"`,
      data: {
        researchId: research._id,
        link: `/research`,
      },
      priority: 'medium',
    }));

    await Promise.all(
      notifications.map(notif => this.createNotification(notif))
    );
  }

  static async notifyResearchUploaded(research, interestedDoctors) {
    // Notify doctors who might be interested (based on specialization/tags)
    const notifications = interestedDoctors.map(doctor => ({
      recipient: doctor._id,
      type: 'research-uploaded',
      title: 'New Research Available',
      message: `New ${research.category} research available: "${research.title}" by ${research.companyName}`,
      data: {
        researchId: research._id,
        link: `/research`,
      },
      priority: 'low',
    }));

    await Promise.all(
      notifications.map(notif => this.createNotification(notif))
    );
  }

  // Timeslot notifications
  static async notifyTimeslotAvailable(timeslot, interestedPharmaReps) {
    const notifications = interestedPharmaReps.map(rep => ({
      recipient: rep._id,
      type: 'timeslot-available',
      title: 'New Timeslot Available',
      message: `Dr. ${timeslot.doctor.profile.lastName} (${timeslot.doctor.profile.specialization}) has a new timeslot available on ${timeslot.date} at ${timeslot.startTime}`,
      data: {
        timeslotId: timeslot._id,
        link: `/appointments`,
      },
      priority: 'low',
    }));

    await Promise.all(
      notifications.map(notif => this.createNotification(notif))
    );
  }

  // System notifications
  static async notifySystemMessage(userId, title, message, priority = 'medium') {
    await this.createNotification({
      recipient: userId,
      type: 'system',
      title,
      message,
      data: {},
      priority,
    });
  }

  // Get notifications for user
  static async getNotifications(userId, limit = 50) {
    try {
      const supabase = supabaseAdmin();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getNotifications:', error);
      return [];
    }
  }

  // Get unread count
  static async getUnreadCount(userId) {
    try {
      const supabase = supabaseAdmin();
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('read', false);

      if (error) {
        console.error('Error getting unread count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error in getUnreadCount:', error);
      return 0;
    }
  }

  // Mark as read
  static async markAsRead(notificationId) {
    try {
      const supabase = supabaseAdmin();
      const { error } = await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in markAsRead:', error);
      return false;
    }
  }
}

export default NotificationService; 