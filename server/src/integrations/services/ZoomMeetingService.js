/**
 * Zoom Meeting Service for PharmaDOC Integration
 * Comprehensive service for managing Zoom meetings
 */

const ZoomOAuthProvider = require('../providers/zoom/ZoomOAuthProvider');
const AuditLogger = require('./AuditLogger');
const TimezoneService = require('./TimezoneService');
const { createClient } = require('@supabase/supabase-js');

class ZoomMeetingService {
  constructor() {
    this.zoomProvider = new ZoomOAuthProvider();
    this.auditLogger = new AuditLogger();
    this.timezoneService = new TimezoneService();
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Meeting cache for performance
    this.meetingCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

    // Security profiles for different meeting types
    this.securityProfiles = {
      pharmaceutical: {
        waitingRoom: true,
        enforceLogin: true,
        joinBeforeHost: false,
        muteUponEntry: true,
        autoRecording: 'none',
        watermark: true,
        maxParticipants: 4,
        allowInternationalDialIn: false,
        requirePassword: true
      },
      business: {
        waitingRoom: true,
        enforceLogin: false,
        joinBeforeHost: false,
        muteUponEntry: true,
        autoRecording: 'none',
        watermark: false,
        maxParticipants: 10,
        allowInternationalDialIn: true,
        requirePassword: true
      },
      public: {
        waitingRoom: false,
        enforceLogin: false,
        joinBeforeHost: true,
        muteUponEntry: false,
        autoRecording: 'none',
        watermark: false,
        maxParticipants: 50,
        allowInternationalDialIn: true,
        requirePassword: false
      }
    };
  }

  /**
   * Create a Zoom meeting for PharmaDOC appointment
   * @param {string} accessToken - User's Zoom access token
   * @param {Object} appointment - PharmaDOC appointment data
   * @param {Object} customSettings - Custom meeting settings
   * @returns {Object} Created meeting information
   */
  async createMeetingForAppointment(accessToken, appointment, customSettings = {}) {
    try {
      const meetingData = this.buildMeetingDataFromAppointment(appointment, customSettings);
      const securitySettings = await this.configureSecuritySettings(appointment);
      
      // Merge security settings with meeting data
      meetingData.settings = { ...meetingData.settings, ...securitySettings };

      const meeting = await this.zoomProvider.createMeeting(accessToken, meetingData);
      
      // Store meeting information in database
      await this.storeMeetingData(appointment.id, meeting, accessToken);
      
      // Cache meeting for quick access
      this.cacheMeeting(meeting.id, meeting);

      this.auditLogger.log('zoom_meeting_created_for_appointment', {
        appointmentId: appointment.id,
        meetingId: meeting.id,
        topic: meeting.topic,
        securityProfile: this.determineSecurityProfile(appointment)
      });

      return {
        success: true,
        meeting,
        joinUrl: meeting.joinUrl,
        meetingId: meeting.id,
        password: meeting.password
      };
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_creation_failed', error, {
        appointmentId: appointment.id
      });
      throw new Error(`Failed to create Zoom meeting: ${error.message}`);
    }
  }

  /**
   * Update Zoom meeting
   * @param {string} accessToken - Access token
   * @param {string} meetingId - Meeting ID
   * @param {Object} appointment - Updated appointment data
   * @param {Object} customSettings - Custom settings
   * @returns {Object} Updated meeting information
   */
  async updateMeetingForAppointment(accessToken, meetingId, appointment, customSettings = {}) {
    try {
      const meetingData = this.buildMeetingDataFromAppointment(appointment, customSettings);
      const securitySettings = await this.configureSecuritySettings(appointment);
      
      meetingData.settings = { ...meetingData.settings, ...securitySettings };

      const updatedMeeting = await this.zoomProvider.updateMeeting(accessToken, meetingId, meetingData);
      
      // Update cached meeting
      this.cacheMeeting(meetingId, updatedMeeting);
      
      // Update database record
      await this.updateMeetingData(appointment.id, updatedMeeting);

      this.auditLogger.log('zoom_meeting_updated_for_appointment', {
        appointmentId: appointment.id,
        meetingId,
        changes: Object.keys(meetingData)
      });

      return {
        success: true,
        meeting: updatedMeeting,
        joinUrl: updatedMeeting.joinUrl,
        password: updatedMeeting.password
      };
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_update_failed', error, {
        appointmentId: appointment.id,
        meetingId
      });
      throw new Error(`Failed to update Zoom meeting: ${error.message}`);
    }
  }

  /**
   * Delete Zoom meeting
   * @param {string} accessToken - Access token
   * @param {string} meetingId - Meeting ID
   * @param {string} appointmentId - Appointment ID
   * @returns {boolean} Success status
   */
  async deleteMeeting(accessToken, meetingId, appointmentId) {
    try {
      await this.zoomProvider.deleteMeeting(accessToken, meetingId);
      
      // Remove from cache
      this.meetingCache.delete(meetingId);
      
      // Update database to remove meeting link
      await this.removeMeetingData(appointmentId);

      this.auditLogger.log('zoom_meeting_deleted', {
        appointmentId,
        meetingId
      });

      return true;
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_deletion_failed', error, {
        appointmentId,
        meetingId
      });
      throw new Error(`Failed to delete Zoom meeting: ${error.message}`);
    }
  }

  /**
   * Get meeting details
   * @param {string} accessToken - Access token
   * @param {string} meetingId - Meeting ID
   * @returns {Object} Meeting details
   */
  async getMeetingDetails(accessToken, meetingId) {
    try {
      // Check cache first
      const cachedMeeting = this.getCachedMeeting(meetingId);
      if (cachedMeeting) {
        return cachedMeeting;
      }

      const meeting = await this.zoomProvider.getMeeting(accessToken, meetingId);
      
      // Cache the meeting
      this.cacheMeeting(meetingId, meeting);

      return meeting;
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_details_fetch_failed', error, { meetingId });
      throw new Error(`Failed to get Zoom meeting details: ${error.message}`);
    }
  }

  /**
   * Generate meeting invitations in multiple formats
   * @param {Object} meeting - Meeting details
   * @param {Object} appointment - Appointment data
   * @returns {Object} Invitation formats
   */
  async generateMeetingInvitations(meeting, appointment) {
    try {
      const { doctor, pharma_rep, timeslots } = appointment;
      
      const startDateTime = this.timezoneService.formatDateTime(
        new Date(`${timeslots.date}T${timeslots.start_time}`),
        appointment.timezone || 'UTC'
      );

      const endDateTime = this.timezoneService.formatDateTime(
        new Date(`${timeslots.date}T${timeslots.end_time}`),
        appointment.timezone || 'UTC'
      );

      // HTML invitation
      const htmlInvitation = this.generateHTMLInvitation(meeting, appointment, {
        startDateTime,
        endDateTime,
        organizer: doctor,
        attendees: [doctor, pharma_rep]
      });

      // Plain text invitation
      const textInvitation = this.generateTextInvitation(meeting, appointment, {
        startDateTime,
        endDateTime,
        organizer: doctor,
        attendees: [doctor, pharma_rep]
      });

      // ICS calendar file
      const icsInvitation = this.generateICSInvitation(meeting, appointment, {
        startDateTime,
        endDateTime,
        organizer: doctor,
        attendees: [doctor, pharma_rep]
      });

      return {
        html: htmlInvitation,
        text: textInvitation,
        ics: icsInvitation,
        meeting: {
          joinUrl: meeting.joinUrl,
          meetingId: meeting.id,
          password: meeting.password,
          phoneNumbers: this.getDialInNumbers(meeting)
        }
      };
    } catch (error) {
      this.auditLogger.logError('zoom_invitation_generation_failed', error, {
        meetingId: meeting.id,
        appointmentId: appointment.id
      });
      throw new Error(`Failed to generate meeting invitations: ${error.message}`);
    }
  }

  /**
   * Validate meeting access for user
   * @param {string} meetingId - Meeting ID
   * @param {string} userId - User ID attempting access
   * @param {string} appointmentId - Related appointment ID
   * @returns {Object} Access validation result
   */
  async validateMeetingAccess(meetingId, userId, appointmentId) {
    try {
      // Get appointment details
      const { data: appointment, error } = await this.supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (error || !appointment) {
        return {
          authorized: false,
          reason: 'Appointment not found'
        };
      }

      // Check if appointment is cancelled
      if (appointment.status === 'cancelled') {
        return {
          authorized: false,
          reason: 'Meeting has been cancelled'
        };
      }

      // Check if user is participant
      const isDoctor = appointment.doctor_id === userId;
      const isPharmaRep = appointment.pharma_rep_id === userId;

      if (!isDoctor && !isPharmaRep) {
        return {
          authorized: false,
          reason: 'User is not authorized for this meeting'
        };
      }

      // Determine user role and permissions
      const role = isDoctor ? 'doctor' : 'pharma_rep';
      const permissions = this.getUserMeetingPermissions(role);

      return {
        authorized: true,
        role,
        permissions,
        appointment
      };
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_access_validation_failed', error, {
        meetingId,
        userId,
        appointmentId
      });
      return {
        authorized: false,
        reason: 'Access validation failed'
      };
    }
  }

  /**
   * Build meeting data from PharmaDOC appointment
   * @param {Object} appointment - Appointment data
   * @param {Object} customSettings - Custom settings
   * @returns {Object} Meeting data for Zoom API
   */
  buildMeetingDataFromAppointment(appointment, customSettings = {}) {
    const { doctor, pharma_rep, timeslots, purpose, duration } = appointment;
    
    const startDateTime = new Date(`${timeslots.date}T${timeslots.start_time}`);
    const timezone = appointment.timezone || 'UTC';

    return {
      topic: `PharmaDOC: ${purpose}`,
      type: 2, // Scheduled meeting
      startTime: startDateTime.toISOString(),
      duration: duration || 60,
      timezone,
      agenda: `Virtual meeting between ${doctor.name} and ${pharma_rep.name}\n\nPurpose: ${purpose}`,
      password: this.generateMeetingPassword(),
      settings: {
        hostVideo: customSettings.hostVideo ?? true,
        participantVideo: customSettings.participantVideo ?? true,
        joinBeforeHost: customSettings.joinBeforeHost ?? false,
        muteUponEntry: customSettings.muteUponEntry ?? true,
        audio: customSettings.audio || 'voip',
        autoRecording: customSettings.autoRecording || 'none',
        alternativeHosts: customSettings.alternativeHosts,
        ...customSettings
      },
      securityProfile: this.determineSecurityProfile(appointment)
    };
  }

  /**
   * Configure security settings based on appointment context
   * @param {Object} appointment - Appointment data
   * @returns {Object} Security settings
   */
  async configureSecuritySettings(appointment) {
    const securityProfile = this.determineSecurityProfile(appointment);
    const baseSettings = this.securityProfiles[securityProfile];

    // Custom security settings from appointment
    const customSecurity = appointment.integration_data?.zoom?.security || {};

    // Merge base settings with custom settings
    return this.mergeSecuritySettings(baseSettings, customSecurity);
  }

  /**
   * Determine security profile based on appointment context
   * @param {Object} appointment - Appointment data
   * @returns {string} Security profile name
   */
  determineSecurityProfile(appointment) {
    const purpose = appointment.purpose?.toLowerCase() || '';
    
    // Pharmaceutical security for sensitive discussions
    const sensitiveKeywords = [
      'clinical trial', 'regulatory', 'fda', 'patient data',
      'confidential', 'compliance', 'hipaa', 'medical records'
    ];

    if (sensitiveKeywords.some(keyword => purpose.includes(keyword))) {
      return 'pharmaceutical';
    }

    // Business security for standard meetings
    const businessKeywords = [
      'presentation', 'demo', 'product', 'training', 'consultation'
    ];

    if (businessKeywords.some(keyword => purpose.includes(keyword))) {
      return 'business';
    }

    // Default to pharmaceutical for safety
    return 'pharmaceutical';
  }

  /**
   * Merge security settings safely
   * @param {Object} baseSettings - Base security profile
   * @param {Object} customSettings - Custom overrides
   * @returns {Object} Merged settings
   */
  mergeSecuritySettings(baseSettings, customSettings) {
    const merged = { ...baseSettings };

    // Only allow certain custom overrides for security
    const allowedOverrides = [
      'maxParticipants', 'autoRecording', 'alternativeHosts'
    ];

    allowedOverrides.forEach(key => {
      if (customSettings.hasOwnProperty(key)) {
        merged[key] = customSettings[key];
      }
    });

    return merged;
  }

  /**
   * Get user permissions based on role
   * @param {string} role - User role (doctor/pharma_rep)
   * @returns {Object} User permissions
   */
  getUserMeetingPermissions(role) {
    const basePermissions = {
      canJoinMeeting: true,
      canStartMeeting: false,
      canInviteOthers: false,
      canRecord: false,
      canShareScreen: true,
      canChat: true
    };

    if (role === 'doctor') {
      return {
        ...basePermissions,
        canStartMeeting: true,
        canRecord: true,
        canInviteOthers: true
      };
    }

    return basePermissions;
  }

  /**
   * Generate HTML invitation
   * @param {Object} meeting - Meeting details
   * @param {Object} appointment - Appointment data
   * @param {Object} context - Additional context
   * @returns {string} HTML invitation
   */
  generateHTMLInvitation(meeting, appointment, context) {
    const { startDateTime, endDateTime, organizer, attendees } = context;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>PharmaDOC Meeting Invitation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .meeting-details { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .join-button { background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .security-note { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 15px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PharmaDOC Meeting Invitation</h1>
        </div>
        <div class="content">
          <h2>Meeting: ${meeting.topic}</h2>
          
          <div class="meeting-details">
            <p><strong>Date & Time:</strong> ${startDateTime} - ${endDateTime}</p>
            <p><strong>Duration:</strong> ${appointment.duration || 60} minutes</p>
            <p><strong>Organizer:</strong> ${organizer.name} (${organizer.email})</p>
            <p><strong>Participants:</strong> ${attendees.map(a => a.name).join(', ')}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${meeting.joinUrl}" class="join-button">Join Zoom Meeting</a>
          </div>

          <div class="meeting-details">
            <p><strong>Meeting ID:</strong> ${meeting.id}</p>
            ${meeting.password ? `<p><strong>Password:</strong> ${meeting.password}</p>` : ''}
            <p><strong>Phone Access:</strong> Available via Zoom dial-in numbers</p>
          </div>

          <div class="security-note">
            <p><strong>Security Note:</strong> This meeting includes enhanced security settings for pharmaceutical discussions. Please ensure you're in a private location.</p>
          </div>

          <p>If you have any questions about this meeting, please contact ${organizer.name} at ${organizer.email}.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text invitation
   * @param {Object} meeting - Meeting details
   * @param {Object} appointment - Appointment data
   * @param {Object} context - Additional context
   * @returns {string} Text invitation
   */
  generateTextInvitation(meeting, appointment, context) {
    const { startDateTime, endDateTime, organizer, attendees } = context;

    return `
PharmaDOC Meeting Invitation

Meeting: ${meeting.topic}
Date & Time: ${startDateTime} - ${endDateTime}
Duration: ${appointment.duration || 60} minutes
Organizer: ${organizer.name} (${organizer.email})
Participants: ${attendees.map(a => a.name).join(', ')}

JOIN ZOOM MEETING
${meeting.joinUrl}

Meeting ID: ${meeting.id}
${meeting.password ? `Password: ${meeting.password}` : ''}

Phone Access: Available via Zoom dial-in numbers

SECURITY NOTE: This meeting includes enhanced security settings for pharmaceutical discussions. Please ensure you're in a private location.

If you have any questions about this meeting, please contact ${organizer.name} at ${organizer.email}.
    `.trim();
  }

  /**
   * Generate ICS calendar file
   * @param {Object} meeting - Meeting details
   * @param {Object} appointment - Appointment data
   * @param {Object} context - Additional context
   * @returns {string} ICS file content
   */
  generateICSInvitation(meeting, appointment, context) {
    const { startDateTime, endDateTime, organizer, attendees } = context;
    
    const startDate = new Date(startDateTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endDate = new Date(endDateTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const created = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PharmaDOC//Zoom Meeting//EN
BEGIN:VEVENT
UID:zoom-${meeting.id}-${appointment.id}@pharmadoc.com
DTSTART:${startDate}
DTEND:${endDate}
DTSTAMP:${created}
ORGANIZER;CN=${organizer.name}:mailto:${organizer.email}
${attendees.map(a => `ATTENDEE;CN=${a.name}:mailto:${a.email}`).join('\n')}
SUMMARY:${meeting.topic}
DESCRIPTION:Join Zoom Meeting\\n${meeting.joinUrl}\\n\\nMeeting ID: ${meeting.id}${meeting.password ? `\\nPassword: ${meeting.password}` : ''}
LOCATION:Zoom Meeting
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
  }

  /**
   * Get dial-in numbers for meeting
   * @param {Object} meeting - Meeting details
   * @returns {Array} Dial-in numbers
   */
  getDialInNumbers(meeting) {
    // Note: In a real implementation, you would fetch these from Zoom API
    return [
      { country: 'US', number: '+1 646 558 8656' },
      { country: 'US', number: '+1 301 715 8592' },
      { country: 'UK', number: '+44 203 481 5237' },
      { country: 'Global', number: 'Find your local number: https://zoom.us/u/axxxxxxxx' }
    ];
  }

  /**
   * Generate secure meeting password
   * @returns {string} Meeting password
   */
  generateMeetingPassword() {
    // Generate a 6-digit numeric password for easy entry
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Store meeting data in database
   * @param {string} appointmentId - Appointment ID
   * @param {Object} meeting - Meeting details
   * @param {string} accessToken - Access token for future operations
   */
  async storeMeetingData(appointmentId, meeting, accessToken) {
    try {
      await this.supabase
        .from('appointments')
        .update({
          meeting_link: meeting.joinUrl,
          meeting_id: meeting.id,
          meeting_password: meeting.password,
          video_provider: 'zoom',
          integration_data: {
            zoom: {
              meetingId: meeting.id,
              uuid: meeting.uuid,
              hostId: meeting.hostId,
              createdAt: meeting.createdAt,
              settings: meeting.settings
            }
          }
        })
        .eq('id', appointmentId);
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_storage_failed', error, {
        appointmentId,
        meetingId: meeting.id
      });
      throw error;
    }
  }

  /**
   * Update meeting data in database
   * @param {string} appointmentId - Appointment ID
   * @param {Object} meeting - Updated meeting details
   */
  async updateMeetingData(appointmentId, meeting) {
    try {
      await this.supabase
        .from('appointments')
        .update({
          meeting_link: meeting.joinUrl,
          meeting_password: meeting.password,
          integration_data: {
            zoom: {
              meetingId: meeting.id,
              uuid: meeting.uuid,
              hostId: meeting.hostId,
              updatedAt: new Date().toISOString(),
              settings: meeting.settings
            }
          }
        })
        .eq('id', appointmentId);
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_update_storage_failed', error, {
        appointmentId,
        meetingId: meeting.id
      });
      throw error;
    }
  }

  /**
   * Remove meeting data from database
   * @param {string} appointmentId - Appointment ID
   */
  async removeMeetingData(appointmentId) {
    try {
      await this.supabase
        .from('appointments')
        .update({
          meeting_link: null,
          meeting_id: null,
          meeting_password: null,
          video_provider: null,
          integration_data: null
        })
        .eq('id', appointmentId);
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_removal_failed', error, { appointmentId });
      throw error;
    }
  }

  /**
   * Cache meeting for performance
   * @param {string} meetingId - Meeting ID
   * @param {Object} meeting - Meeting data
   */
  cacheMeeting(meetingId, meeting) {
    this.meetingCache.set(meetingId, {
      ...meeting,
      cachedAt: Date.now()
    });

    // Clean up old cache entries
    setTimeout(() => {
      this.meetingCache.delete(meetingId);
    }, this.cacheTimeout);
  }

  /**
   * Get cached meeting
   * @param {string} meetingId - Meeting ID
   * @returns {Object|null} Cached meeting or null
   */
  getCachedMeeting(meetingId) {
    const cached = this.meetingCache.get(meetingId);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.cachedAt > this.cacheTimeout) {
      this.meetingCache.delete(meetingId);
      return null;
    }

    return cached;
  }

  /**
   * Clear meeting cache
   */
  clearCache() {
    this.meetingCache.clear();
  }
}

module.exports = ZoomMeetingService; 