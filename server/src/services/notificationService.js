import Notification from '../models/Notification.js';

class NotificationService {
  // Appointment notifications
  static async notifyAppointmentScheduled(appointment) {
    await Notification.createNotification({
      recipient: appointment.doctor,
      type: 'appointment-scheduled',
      title: 'New Appointment Scheduled',
      message: `${appointment.pharmaRep.profile.firstName} ${appointment.pharmaRep.profile.lastName} from ${appointment.pharmaRep.profile.companyName} has scheduled an appointment on ${appointment.timeslot.date} at ${appointment.timeslot.startTime}`,
      data: {
        appointmentId: appointment._id,
        link: `/appointments`,
      },
      priority: 'high',
    });
  }

  static async notifyAppointmentConfirmed(appointment) {
    await Notification.createNotification({
      recipient: appointment.pharmaRep,
      type: 'appointment-confirmed',
      title: 'Appointment Confirmed',
      message: `Your appointment with Dr. ${appointment.doctor.profile.lastName} on ${appointment.timeslot.date} at ${appointment.timeslot.startTime} has been confirmed`,
      data: {
        appointmentId: appointment._id,
        link: `/appointments`,
      },
      priority: 'medium',
    });
  }

  static async notifyAppointmentCancelled(appointment, cancelledBy, reason) {
    const recipientId = cancelledBy.toString() === appointment.doctor.toString() 
      ? appointment.pharmaRep 
      : appointment.doctor;
    
    const cancellerName = cancelledBy.toString() === appointment.doctor.toString()
      ? `Dr. ${appointment.doctor.profile.lastName}`
      : `${appointment.pharmaRep.profile.firstName} ${appointment.pharmaRep.profile.lastName}`;

    await Notification.createNotification({
      recipient: recipientId,
      type: 'appointment-cancelled',
      title: 'Appointment Cancelled',
      message: `Your appointment on ${appointment.timeslot.date} at ${appointment.timeslot.startTime} has been cancelled by ${cancellerName}. Reason: ${reason}`,
      data: {
        appointmentId: appointment._id,
        link: `/appointments`,
      },
      priority: 'high',
    });
  }

  static async notifyAppointmentCompleted(appointment) {
    await Notification.createNotification({
      recipient: appointment.pharmaRep,
      type: 'appointment-completed',
      title: 'Appointment Completed',
      message: `Your appointment with Dr. ${appointment.doctor.profile.lastName} has been marked as completed. Thank you for your visit!`,
      data: {
        appointmentId: appointment._id,
        link: `/appointments`,
      },
      priority: 'low',
    });
  }

  static async notifyAppointmentReminder(appointment) {
    // Notify both parties
    await Promise.all([
      Notification.createNotification({
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
      Notification.createNotification({
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
      notifications.map(notif => Notification.createNotification(notif))
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
      notifications.map(notif => Notification.createNotification(notif))
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
      notifications.map(notif => Notification.createNotification(notif))
    );
  }

  // System notifications
  static async notifySystemMessage(userId, title, message, priority = 'medium') {
    await Notification.createNotification({
      recipient: userId,
      type: 'system',
      title,
      message,
      data: {},
      priority,
    });
  }
}

export default NotificationService; 