/**
 * Video Link Generation Service
 * Orchestrates video meeting creation for PharmaDOC appointments
 */

import GoogleMeetService from './GoogleMeetService.js';
import AuditLogger from './AuditLogger.js';
import { createClient } from '@supabase/supabase-js';

export class VideoLinkGenerationService {
  constructor() {
    this.googleMeetService = new GoogleMeetService();
    this.auditLogger = new AuditLogger('VideoLinkGenerationService');
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Generate video meeting link for appointment
   * @param {Object} appointmentData - Complete appointment data
   * @param {Object} bookingForm - Form data with video preferences
   * @param {string} userId - User ID creating the appointment
   * @returns {Object} Video meeting details or null if not virtual
   */
  async generateVideoLinkForAppointment(appointmentData, bookingForm, userId) {
    try {
      // Only generate video links for virtual meetings
      if (bookingForm.meetingType !== 'virtual') {
        return null;
      }

      this.auditLogger.log('info', 'Starting video link generation', {
        appointmentId: appointmentData.id,
        requestedProvider: bookingForm.videoProvider,
        userId
      });

      // For now, focus on Google Meet integration
      // TODO: Add Zoom and Teams integration
      if (bookingForm.videoProvider === 'google-meet') {
        return await this.createGoogleMeetLink(appointmentData, bookingForm, userId);
      }

      return {
        success: false,
        error: 'Provider not yet supported',
        provider: bookingForm.videoProvider
      };

    } catch (error) {
      this.auditLogger.log('error', 'Video link generation service error', {
        appointmentId: appointmentData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create Google Meet link for appointment
   */
  async createGoogleMeetLink(appointmentData, bookingForm, userId) {
    try {
      // Get user's Google integration
      const { data: integration, error } = await this.supabase
        .from('oauth_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider_type', 'google')
        .eq('status', 'connected')
        .single();

      if (error || !integration) {
        return {
          success: false,
          error: 'Google integration not found or not connected'
        };
      }

      // Prepare meeting data
      const meetingData = this.prepareMeetingData(appointmentData, bookingForm);
      
      // Create Google Meet
      const result = await this.googleMeetService.createGoogleMeet(
        integration.access_token, 
        meetingData
      );

      if (result.success) {
        // Store video meeting data
        await this.storeVideoMeetingData(appointmentData.id, result, 'google-meet', bookingForm);
        
        return {
          success: true,
          provider: 'google-meet',
          meeting: result.meeting,
          joinUrl: result.meeting.joinUrl
        };
      }

      return result;

    } catch (error) {
      this.auditLogger.log('error', 'Google Meet creation failed', {
        error: error.message,
        appointmentId: appointmentData.id
      });
      throw error;
    }
  }

  /**
   * Prepare meeting data from appointment and form
   */
  prepareMeetingData(appointmentData, bookingForm) {
    const { timeslot, doctor, pharma_rep } = appointmentData;
    
    // Create meeting subject
    const subject = `PharmaDOC Appointment: ${pharma_rep?.company_name || 'Pharma Rep'} with Dr. ${doctor?.last_name || 'Doctor'}`;
    
    // Calculate meeting times
    const meetingDate = new Date(timeslot.date);
    const [startHour, startMinute] = timeslot.start_time.split(':');
    const [endHour, endMinute] = timeslot.end_time.split(':');
    
    const startDateTime = new Date(meetingDate);
    startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
    
    const endDateTime = new Date(meetingDate);
    endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);

    // Prepare attendees
    const attendees = [];
    if (doctor?.email) attendees.push(doctor.email);
    if (pharma_rep?.email) attendees.push(pharma_rep.email);

    return {
      userId: appointmentData.pharma_rep_id,
      subject,
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      attendees,
      description: `Purpose: ${appointmentData.purpose}\n\n${bookingForm.notes || ''}`,
      timeZone: 'UTC',
      conferenceRequestId: this.generateConferenceRequestId(),
      meetingSettings: this.prepareSecuritySettings(bookingForm)
    };
  }

  /**
   * Prepare security settings from booking form
   */
  prepareSecuritySettings(bookingForm) {
    const settings = {};

    // Meeting access controls
    switch (bookingForm.meetingAccess) {
      case 'open':
        settings.guestsCanInvite = true;
        settings.enforceLogin = false;
        break;
      case 'restricted':
        settings.guestsCanInvite = false;
        settings.enforceLogin = true;
        break;
      case 'approval-required':
        settings.guestsCanInvite = false;
        settings.enforceLogin = true;
        break;
      default:
        settings.guestsCanInvite = false;
        settings.enforceLogin = false;
    }

    return settings;
  }

  /**
   * Store video meeting data with appointment
   */
  async storeVideoMeetingData(appointmentId, meetingResult, provider, bookingForm) {
    try {
      const videoData = {
        provider,
        meeting_id: meetingResult.meeting?.meetingId || meetingResult.meeting?.id,
        join_url: meetingResult.meeting?.joinUrl,
        access_settings: {
          meetingAccess: bookingForm.meetingAccess,
          allowRecording: bookingForm.allowRecording,
          requirePassword: bookingForm.requirePassword
        },
        created_at: new Date().toISOString()
      };

      // Update appointment with video meeting data
      const { error } = await this.supabase
        .from('appointments')
        .update({
          video_meeting_data: videoData,
          video_provider: provider,
          video_join_url: videoData.join_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) {
        throw error;
      }

      this.auditLogger.log('info', 'Video meeting data stored successfully', {
        appointmentId,
        provider,
        meetingId: videoData.meeting_id
      });

    } catch (error) {
      this.auditLogger.log('error', 'Failed to store video meeting data', {
        appointmentId,
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate unique conference request ID
   */
  generateConferenceRequestId() {
    return `pharmadoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
