/**
 * Video Link Generation Service
 * Orchestrates video meeting creation for PharmaDOC appointments
 */

import GoogleMeetService from './GoogleMeetService.js';
// DISABLED: Teams requires admin consent for multi-tenant SaaS
// import { MicrosoftTeamsMeetingService } from './MicrosoftTeamsMeetingService.js';
import AuditLogger from './AuditLogger.js';
import { createClient } from '@supabase/supabase-js';

export class VideoLinkGenerationService {
  constructor() {
    this.googleMeetService = new GoogleMeetService();
    this.zoomMeetingService = null; // Will be loaded dynamically
    // DISABLED: Teams requires admin consent for multi-tenant SaaS
    // this.teamsService = new MicrosoftTeamsMeetingService();
    this.auditLogger = new AuditLogger('VideoLinkGenerationService');
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Get or initialize ZoomMeetingService (dynamic import for CommonJS compatibility)
   */
  async getZoomMeetingService() {
    if (!this.zoomMeetingService) {
      const ZoomMeetingServiceModule = await import('./ZoomMeetingService.js');
      // Handle both CommonJS (module.exports) and ES module exports
      const ZoomMeetingService = ZoomMeetingServiceModule.default || ZoomMeetingServiceModule;
      this.zoomMeetingService = new ZoomMeetingService();
    }
    return this.zoomMeetingService;
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

      await this.auditLogger.logEvent('VIDEO_LINK_GENERATION_START', {
        appointmentId: appointmentData.id,
        requestedProvider: bookingForm.videoProvider,
        meetingAccess: bookingForm.meetingAccess
      }, { userId, provider: bookingForm.videoProvider });

      // Support Google Meet and Zoom
      if (bookingForm.videoProvider === 'google_meet') {
        return await this.createGoogleMeetLink(appointmentData, bookingForm, userId);
      }

      if (bookingForm.videoProvider === 'zoom') {
        return await this.createZoomMeetingLink(appointmentData, bookingForm, userId);
      }
      
      // DISABLED: Teams requires admin consent for multi-tenant SaaS
      /*
      if (bookingForm.videoProvider === 'microsoft_teams') {
        return await this.createMicrosoftTeamsLink(appointmentData, bookingForm, userId);
      }
      */

      return {
        success: false,
        error: 'Provider not yet supported. Supported providers: google_meet, zoom',
        provider: bookingForm.videoProvider
      };

    } catch (error) {
      await this.auditLogger.logEvent('VIDEO_LINK_GENERATION_ERROR', {
        appointmentId: appointmentData.id,
        error: error.message,
        stack: error.stack
      }, { userId, provider: bookingForm.videoProvider });
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
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'google')
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
      
      // Create Google Meet with refresh token for automatic token refresh
      const result = await this.googleMeetService.createGoogleMeet(
        integration.access_token, 
        meetingData,
        integration.refresh_token
      );

      if (result.success) {
        // Store video meeting data
        await this.storeVideoMeetingData(appointmentData.id, result, 'google_meet', bookingForm);
        
        return {
          success: true,
          provider: 'google_meet',
          meeting: result.meeting,
          joinUrl: result.meeting.joinUrl
        };
      }

      return result;

    } catch (error) {
      await this.auditLogger.logEvent('GOOGLE_MEET_CREATION_ERROR', {
        appointmentId: appointmentData.id,
        error: error.message,
        stack: error.stack
      }, { userId, provider: 'google-meet' });
      throw error;
    }
  }

  /**
   * Create Zoom meeting link for appointment
   */
  async createZoomMeetingLink(appointmentData, bookingForm, userId) {
    try {
      // Get user's Zoom integration
      const { data: integration, error } = await this.supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'zoom')
        .eq('status', 'connected')
        .single();

      if (error || !integration) {
        return {
          success: false,
          error: 'Zoom integration not found or not connected'
        };
      }

      // Get ZoomMeetingService
      const zoomService = await this.getZoomMeetingService();

      // Prepare meeting data for Zoom service
      const appointmentForZoom = {
        id: appointmentData.id,
        doctor: appointmentData.doctor,
        pharma_rep: appointmentData.pharma_rep,
        timeslots: appointmentData.timeslot,
        purpose: appointmentData.purpose,
        duration: this.calculateMeetingDuration(appointmentData.timeslot),
        timezone: appointmentData.timezone || 'UTC'
      };

      // Create Zoom meeting
      const result = await zoomService.createMeetingForAppointment(
        integration.access_token,
        appointmentForZoom,
        this.prepareZoomCustomSettings(bookingForm)
      );

      console.log('🔍 [VIDEO DEBUG] Zoom meeting service result:', {
        success: result.success,
        joinUrl: result.joinUrl,
        meetingId: result.meetingId,
        password: result.password,
        meeting: result.meeting ? { id: result.meeting.id, join_url: result.meeting.join_url } : null
      });

      if (result.success) {
        // Store video meeting data
        await this.storeVideoMeetingData(appointmentData.id, result, 'zoom', bookingForm);
        
        return {
          success: true,
          provider: 'zoom',
          meeting: result.meeting,
          joinUrl: result.joinUrl,
          meetingId: result.meetingId,
          password: result.password
        };
      }

      return result;

    } catch (error) {
      await this.auditLogger.logEvent('ZOOM_MEETING_CREATION_ERROR', {
        appointmentId: appointmentData.id,
        error: error.message,
        stack: error.stack
      }, { userId, provider: 'zoom' });
      throw error;
    }
  }

  /*
  DISABLED: Microsoft Teams requires admin consent for multi-tenant SaaS
  
  /**
   * Create Microsoft Teams link for appointment
   */
  /*
  async createMicrosoftTeamsLink(appointmentData, bookingForm, userId) {
    try {
      // Get user's Microsoft integration
      const { data: integration, error } = await this.supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .eq('status', 'connected')
        .single();

      if (error || !integration) {
        return {
          success: false,
          error: 'Microsoft integration not found or not connected'
        };
      }

      // Prepare meeting data
      const meetingData = this.prepareMeetingData(appointmentData, bookingForm);
      
      // Create Teams meeting
      const result = await this.teamsService.createMeeting(
        integration.access_token, 
        meetingData
      );

      if (result.success) {
        // Store video meeting data
        await this.storeVideoMeetingData(appointmentData.id, result, 'microsoft_teams', bookingForm);
        
        return {
          success: true,
          provider: 'microsoft_teams',
          meeting: result.meeting,
          joinUrl: result.meeting.joinUrl
        };
      }

      return result;

    } catch (error) {
      await this.auditLogger.logEvent('TEAMS_MEETING_CREATION_ERROR', {
        appointmentId: appointmentData.id,
        error: error.message,
        stack: error.stack
      }, { userId, provider: 'microsoft_teams' });
      throw error;
    }
  }
  */

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
      startTime: startDateTime.toISOString(),  // Fixed: was startDateTime
      endTime: endDateTime.toISOString(),      // Fixed: was endDateTime  
      timezone: 'UTC',                         // Fixed: was timeZone
      attendees,
      description: `Purpose: ${appointmentData.purpose}\n\n${bookingForm.notes || ''}`,
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
      console.log('🔍 [VIDEO DEBUG] Storing video meeting data:', {
        appointmentId,
        provider,
        meetingResult: {
          success: meetingResult.success,
          joinUrl: meetingResult.joinUrl,
          meetingId: meetingResult.meetingId,
          meeting: meetingResult.meeting ? { id: meetingResult.meeting.id, join_url: meetingResult.meeting.join_url } : null
        }
      });

      const videoData = {
        provider,
        meeting_id: meetingResult.meetingId || meetingResult.meeting?.id, // Fix: Use top-level meetingId first
        join_url: meetingResult.joinUrl || meetingResult.meeting?.join_url, // Fix: Use top-level joinUrl first
        access_settings: {
          meetingAccess: bookingForm.meetingAccess,
          allowRecording: bookingForm.allowRecording,
          requirePassword: bookingForm.requirePassword
        },
        created_at: new Date().toISOString()
      };

      console.log('🔍 [VIDEO DEBUG] Video data to store:', videoData);

      // Update appointment with video meeting data
      const { error } = await this.supabase
        .from('appointments')
        .update({
          video_meeting_data: videoData,
          video_provider: provider,
          meeting_link: videoData.join_url,  // Use meeting_link field for consistency with sync service
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) {
        console.error('❌ [VIDEO ERROR] Database update failed:', error);
        throw error;
      }

      console.log('✅ [VIDEO DEBUG] Video meeting data stored successfully');

      await this.auditLogger.logEvent('VIDEO_MEETING_DATA_STORED', {
        appointmentId,
        provider,
        meetingId: videoData.meeting_id,
        meetingAccess: videoData.access_settings.meetingAccess
      }, { provider });

    } catch (error) {
      console.error('❌ [VIDEO ERROR] Failed to store video meeting data:', error);
      await this.auditLogger.logEvent('VIDEO_MEETING_DATA_STORAGE_ERROR', {
        appointmentId,
        provider,
        error: error.message,
        stack: error.stack
      }, { provider });
      throw error;
    }
  }

  /**
   * Generate unique conference request ID
   */
  generateConferenceRequestId() {
    return `pharmadoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate meeting duration from timeslot
   */
  calculateMeetingDuration(timeslot) {
    try {
      const [startHour, startMinute] = timeslot.start_time.split(':').map(Number);
      const [endHour, endMinute] = timeslot.end_time.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      
      return Math.max(15, endMinutes - startMinutes); // Minimum 15 minutes
    } catch (error) {
      console.warn('Failed to calculate meeting duration:', error);
      return 60; // Default to 60 minutes
    }
  }

  /**
   * Prepare Zoom-specific custom settings from booking form
   */
  prepareZoomCustomSettings(bookingForm) {
    const settings = {};

    // Map meeting access to Zoom settings
    switch (bookingForm.meetingAccess) {
      case 'open':
        settings.joinBeforeHost = true;
        settings.waitingRoom = false;
        settings.enforceLogin = false;
        break;
      case 'restricted':
        settings.joinBeforeHost = false;
        settings.waitingRoom = true;
        settings.enforceLogin = true;
        break;
      case 'approval-required':
        settings.joinBeforeHost = false;
        settings.waitingRoom = true;
        settings.enforceLogin = true;
        settings.muteUponEntry = true;
        break;
      default:
        settings.waitingRoom = true;
        settings.enforceLogin = false;
    }

    // Additional settings from form
    if (bookingForm.allowRecording) {
      settings.autoRecording = 'cloud';
    }

    if (bookingForm.requirePassword) {
      settings.password = true;
    }

    return settings;
  }
}
