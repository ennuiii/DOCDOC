import { AuditLogger } from './AuditLogger.js';
import { RateLimitManager } from './RateLimitManager.js';
import { TimezoneService } from './TimezoneService.js';
import { MicrosoftOAuthProvider } from '../providers/microsoft/MicrosoftOAuthProvider.js';

/**
 * Microsoft Teams Meeting Integration Service
 * Handles Teams meeting creation, management, and integration with calendar events
 * via Microsoft Graph API
 */
export class MicrosoftTeamsMeetingService {
  constructor() {
    this.auditLogger = new AuditLogger('TeamsMeetingService');
    this.rateLimiter = new RateLimitManager({
      requests: 2000,
      window: 300000, // 5 minutes for Microsoft Graph
      burstLimit: 50
    });
    
    this.timezoneService = new TimezoneService();
    this.oauthProvider = new MicrosoftOAuthProvider();
    
    // Microsoft Graph API endpoints
    this.graphUrl = 'https://graph.microsoft.com/v1.0';
    this.betaGraphUrl = 'https://graph.microsoft.com/beta';
    
    // Teams meeting cache for quick access
    this.meetingCache = new Map();
    this.cacheExpiry = 3600000; // 1 hour
  }

  /**
   * Create a Teams meeting
   * @param {string} accessToken - Microsoft access token
   * @param {Object} meetingData - Meeting configuration
   * @returns {Object} Created meeting details
   */
  async createMeeting(accessToken, meetingData) {
    try {
      await this.rateLimiter.checkLimit('create_meeting');
      
      this.auditLogger.log('info', 'Creating Teams meeting', {
        subject: meetingData.subject,
        duration: meetingData.duration
      });

      const {
        subject,
        startTime,
        endTime,
        timezone = 'UTC',
        attendees = [],
        allowedPresenters = 'everyone',
        recordAutomatically = false,
        allowTeamsMeetingOptions = {},
        lobbyBypassSettings = {}
      } = meetingData;

      // Convert times to ISO format
      const startDateTime = await this.timezoneService.convertToUtc(startTime, timezone);
      const endDateTime = await this.timezoneService.convertToUtc(endTime, timezone);

      const meetingRequest = {
        subject: subject,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        participants: {
          organizer: {
            upn: await this.getOrganizerEmail(accessToken)
          },
          attendees: attendees.map(attendee => ({
            upn: attendee.email,
            role: attendee.role || 'attendee'
          }))
        },
        meetingOptions: {
          allowedPresenters: allowedPresenters,
          recordAutomatically: recordAutomatically,
          ...allowTeamsMeetingOptions
        },
        lobbyBypassSettings: {
          scope: lobbyBypassSettings.scope || 'organization',
          isDialInBypassEnabled: lobbyBypassSettings.isDialInBypassEnabled || false,
          ...lobbyBypassSettings
        }
      };

      const response = await fetch(`${this.graphUrl}/me/onlineMeetings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetingRequest)
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Create Teams meeting');
      }

      const meeting = await response.json();
      
      // Cache the meeting for quick access
      this.cacheMeeting(meeting.id, meeting);

      this.auditLogger.log('info', 'Teams meeting created successfully', {
        meetingId: meeting.id,
        joinUrl: meeting.joinUrl?.substring(0, 50) + '...',
        subject: meeting.subject
      });

      return this.formatMeetingResponse(meeting);
    } catch (error) {
      this.auditLogger.log('error', 'Failed to create Teams meeting', {
        error: error.message,
        subject: meetingData.subject
      });
      throw error;
    }
  }

  /**
   * Get Teams meeting details
   * @param {string} accessToken - Microsoft access token
   * @param {string} meetingId - Meeting ID
   * @returns {Object} Meeting details
   */
  async getMeeting(accessToken, meetingId) {
    try {
      await this.rateLimiter.checkLimit('get_meeting');

      // Check cache first
      const cachedMeeting = this.getCachedMeeting(meetingId);
      if (cachedMeeting) {
        return cachedMeeting;
      }

      const response = await fetch(`${this.graphUrl}/me/onlineMeetings/${meetingId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Get Teams meeting');
      }

      const meeting = await response.json();
      
      // Cache the meeting
      this.cacheMeeting(meetingId, meeting);

      this.auditLogger.log('info', 'Retrieved Teams meeting', {
        meetingId,
        subject: meeting.subject
      });

      return this.formatMeetingResponse(meeting);
    } catch (error) {
      this.auditLogger.log('error', 'Failed to get Teams meeting', {
        meetingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update Teams meeting
   * @param {string} accessToken - Microsoft access token
   * @param {string} meetingId - Meeting ID
   * @param {Object} updateData - Updated meeting data
   * @returns {Object} Updated meeting details
   */
  async updateMeeting(accessToken, meetingId, updateData) {
    try {
      await this.rateLimiter.checkLimit('update_meeting');

      this.auditLogger.log('info', 'Updating Teams meeting', {
        meetingId,
        updates: Object.keys(updateData)
      });

      const {
        subject,
        startTime,
        endTime,
        timezone,
        attendees,
        allowedPresenters,
        recordAutomatically,
        meetingOptions = {},
        lobbyBypassSettings = {}
      } = updateData;

      const updateRequest = {};

      // Update basic properties
      if (subject !== undefined) updateRequest.subject = subject;
      if (startTime && endTime && timezone) {
        updateRequest.startTime = (await this.timezoneService.convertToUtc(startTime, timezone)).toISOString();
        updateRequest.endTime = (await this.timezoneService.convertToUtc(endTime, timezone)).toISOString();
      }

      // Update participants
      if (attendees) {
        updateRequest.participants = {
          attendees: attendees.map(attendee => ({
            upn: attendee.email,
            role: attendee.role || 'attendee'
          }))
        };
      }

      // Update meeting options
      if (allowedPresenters || recordAutomatically || Object.keys(meetingOptions).length > 0) {
        updateRequest.meetingOptions = {};
        if (allowedPresenters) updateRequest.meetingOptions.allowedPresenters = allowedPresenters;
        if (recordAutomatically !== undefined) updateRequest.meetingOptions.recordAutomatically = recordAutomatically;
        Object.assign(updateRequest.meetingOptions, meetingOptions);
      }

      // Update lobby settings
      if (Object.keys(lobbyBypassSettings).length > 0) {
        updateRequest.lobbyBypassSettings = lobbyBypassSettings;
      }

      const response = await fetch(`${this.graphUrl}/me/onlineMeetings/${meetingId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateRequest)
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Update Teams meeting');
      }

      const meeting = await response.json();
      
      // Update cache
      this.cacheMeeting(meetingId, meeting);

      this.auditLogger.log('info', 'Teams meeting updated successfully', {
        meetingId,
        subject: meeting.subject
      });

      return this.formatMeetingResponse(meeting);
    } catch (error) {
      this.auditLogger.log('error', 'Failed to update Teams meeting', {
        meetingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete Teams meeting
   * @param {string} accessToken - Microsoft access token
   * @param {string} meetingId - Meeting ID
   */
  async deleteMeeting(accessToken, meetingId) {
    try {
      await this.rateLimiter.checkLimit('delete_meeting');

      const response = await fetch(`${this.graphUrl}/me/onlineMeetings/${meetingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok && response.status !== 404) {
        await this.oauthProvider.handleApiError(response, 'Delete Teams meeting');
      }

      // Remove from cache
      this.meetingCache.delete(meetingId);

      this.auditLogger.log('info', 'Teams meeting deleted', { meetingId });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to delete Teams meeting', {
        meetingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List user's Teams meetings
   * @param {string} accessToken - Microsoft access token
   * @param {Object} options - Query options
   * @returns {Array} List of meetings
   */
  async listMeetings(accessToken, options = {}) {
    try {
      await this.rateLimiter.checkLimit('list_meetings');

      const {
        timeMin,
        timeMax,
        maxResults = 50
      } = options;

      let url = `${this.graphUrl}/me/onlineMeetings`;
      const params = new URLSearchParams();

      params.append('$top', maxResults.toString());
      params.append('$orderby', 'creationDateTime desc');

      if (timeMin || timeMax) {
        const filters = [];
        if (timeMin) {
          filters.push(`startTime ge '${new Date(timeMin).toISOString()}'`);
        }
        if (timeMax) {
          filters.push(`endTime le '${new Date(timeMax).toISOString()}'`);
        }
        if (filters.length > 0) {
          params.append('$filter', filters.join(' and '));
        }
      }

      url += `?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'List Teams meetings');
      }

      const data = await response.json();
      const meetings = (data.value || []).map(meeting => this.formatMeetingResponse(meeting));

      this.auditLogger.log('info', 'Retrieved Teams meetings list', {
        count: meetings.length
      });

      return meetings;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to list Teams meetings', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create Teams meeting for appointment
   * @param {string} accessToken - Microsoft access token
   * @param {Object} appointment - PharmaDOC appointment
   * @param {Object} options - Meeting options
   * @returns {Object} Created meeting with appointment integration
   */
  async createMeetingForAppointment(accessToken, appointment, options = {}) {
    try {
      const {
        allowedPresenters = 'organizers',
        recordAutomatically = false,
        enableLobby = true,
        allowDialIn = true
      } = options;

      // Prepare attendees from appointment
      const attendees = [];
      
      if (appointment.attendees) {
        attendees.push(...appointment.attendees.map(attendee => ({
          email: attendee.email,
          role: attendee.type === 'organizer' ? 'presenter' : 'attendee'
        })));
      }

      const meetingData = {
        subject: appointment.title || 'PharmaDOC Appointment',
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        timezone: appointment.timezone || 'UTC',
        attendees,
        allowedPresenters,
        recordAutomatically,
        lobbyBypassSettings: {
          scope: enableLobby ? 'organization' : 'everyone',
          isDialInBypassEnabled: allowDialIn
        }
      };

      const meeting = await this.createMeeting(accessToken, meetingData);

      // Store meeting reference in appointment
      await this.linkMeetingToAppointment(appointment.id, meeting.id, meeting.joinUrl);

      this.auditLogger.log('info', 'Teams meeting created for appointment', {
        appointmentId: appointment.id,
        meetingId: meeting.id
      });

      return {
        ...meeting,
        appointmentId: appointment.id,
        linkedAt: new Date().toISOString()
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to create Teams meeting for appointment', {
        appointmentId: appointment.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate Teams meeting invitation content
   * @param {Object} meeting - Teams meeting details
   * @param {Object} appointment - PharmaDOC appointment (optional)
   * @returns {Object} Invitation content
   */
  generateMeetingInvitation(meeting, appointment = null) {
    const invitationContent = {
      subject: meeting.subject,
      htmlContent: this.generateHtmlInvitation(meeting, appointment),
      textContent: this.generateTextInvitation(meeting, appointment),
      icsContent: this.generateIcsInvitation(meeting, appointment)
    };

    return invitationContent;
  }

  /**
   * Generate HTML invitation content
   * @param {Object} meeting - Teams meeting details
   * @param {Object} appointment - PharmaDOC appointment
   * @returns {string} HTML content
   */
  generateHtmlInvitation(meeting, appointment) {
    const appointmentInfo = appointment ? `
      <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
        <h3 style="margin: 0 0 10px 0; color: #333;">Appointment Details</h3>
        <p><strong>Date:</strong> ${new Date(meeting.startTime).toLocaleDateString()}</p>
        <p><strong>Time:</strong> ${new Date(meeting.startTime).toLocaleTimeString()} - ${new Date(meeting.endTime).toLocaleTimeString()}</p>
        ${appointment.description ? `<p><strong>Description:</strong> ${appointment.description}</p>` : ''}
        ${appointment.location ? `<p><strong>Location:</strong> ${appointment.location}</p>` : ''}
      </div>
    ` : '';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #464775;">Microsoft Teams Meeting Invitation</h2>
        
        ${appointmentInfo}
        
        <div style="margin: 20px 0; padding: 20px; background-color: #464775; color: white; border-radius: 5px; text-align: center;">
          <h3 style="margin: 0 0 15px 0;">Join the Meeting</h3>
          <a href="${meeting.joinUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #6264a7; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Join Microsoft Teams Meeting
          </a>
        </div>
        
        <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
          <h4 style="margin: 0 0 10px 0;">Meeting Details</h4>
          <p><strong>Meeting ID:</strong> ${meeting.conferenceId || 'N/A'}</p>
          <p><strong>Dial-in Number:</strong> ${meeting.dialInUrl ? 'Available' : 'Not available'}</p>
          ${meeting.tollNumber ? `<p><strong>Phone:</strong> ${meeting.tollNumber}</p>` : ''}
        </div>
        
        <div style="margin: 20px 0; font-size: 12px; color: #666;">
          <p><strong>Meeting Options:</strong></p>
          <ul style="margin: 5px 0;">
            <li>Recording: ${meeting.recordAutomatically ? 'Enabled' : 'Disabled'}</li>
            <li>Lobby: ${meeting.lobbyBypassSettings?.scope !== 'everyone' ? 'Enabled' : 'Disabled'}</li>
            <li>Presenters: ${meeting.allowedPresenters || 'Everyone'}</li>
          </ul>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
          <p>This meeting was created through PharmaDOC integration with Microsoft Teams.</p>
        </div>
      </div>
    `;
  }

  /**
   * Generate text invitation content
   * @param {Object} meeting - Teams meeting details
   * @param {Object} appointment - PharmaDOC appointment
   * @returns {string} Text content
   */
  generateTextInvitation(meeting, appointment) {
    const appointmentInfo = appointment ? `
APPOINTMENT DETAILS
Date: ${new Date(meeting.startTime).toLocaleDateString()}
Time: ${new Date(meeting.startTime).toLocaleTimeString()} - ${new Date(meeting.endTime).toLocaleTimeString()}
${appointment.description ? `Description: ${appointment.description}` : ''}
${appointment.location ? `Location: ${appointment.location}` : ''}

` : '';

    return `
Microsoft Teams Meeting Invitation

${appointmentInfo}JOIN THE MEETING
${meeting.joinUrl}

MEETING DETAILS
Meeting ID: ${meeting.conferenceId || 'N/A'}
${meeting.tollNumber ? `Phone: ${meeting.tollNumber}` : ''}

MEETING OPTIONS
- Recording: ${meeting.recordAutomatically ? 'Enabled' : 'Disabled'}
- Lobby: ${meeting.lobbyBypassSettings?.scope !== 'everyone' ? 'Enabled' : 'Disabled'}
- Presenters: ${meeting.allowedPresenters || 'Everyone'}

This meeting was created through PharmaDOC integration with Microsoft Teams.
    `.trim();
  }

  /**
   * Generate ICS calendar invitation
   * @param {Object} meeting - Teams meeting details
   * @param {Object} appointment - PharmaDOC appointment
   * @returns {string} ICS content
   */
  generateIcsInvitation(meeting, appointment) {
    const startTime = new Date(meeting.startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endTime = new Date(meeting.endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const description = appointment?.description ? 
      `${appointment.description}\\n\\nJoin the meeting: ${meeting.joinUrl}` :
      `Join the meeting: ${meeting.joinUrl}`;

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PharmaDOC//Teams Integration//EN
BEGIN:VEVENT
UID:${meeting.id}@pharmadoc.com
DTSTAMP:${now}
DTSTART:${startTime}
DTEND:${endTime}
SUMMARY:${meeting.subject}
DESCRIPTION:${description}
LOCATION:Microsoft Teams Meeting
URL:${meeting.joinUrl}
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;
  }

  /**
   * Get organizer email from access token
   * @param {string} accessToken - Microsoft access token
   * @returns {string} Organizer email
   */
  async getOrganizerEmail(accessToken) {
    try {
      const userProfile = await this.oauthProvider.getUserProfile(accessToken);
      return userProfile.email;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to get organizer email', {
        error: error.message
      });
      throw new Error('Failed to get organizer email');
    }
  }

  /**
   * Format meeting response for consistent API output
   * @param {Object} meeting - Raw Teams meeting data
   * @returns {Object} Formatted meeting data
   */
  formatMeetingResponse(meeting) {
    return {
      id: meeting.id,
      subject: meeting.subject,
      joinUrl: meeting.joinWebUrl || meeting.joinUrl,
      phoneConference: {
        conferenceId: meeting.audioConferencing?.conferenceId,
        tollNumber: meeting.audioConferencing?.tollNumber,
        dialInUrl: meeting.audioConferencing?.dialinUrl
      },
      startTime: meeting.startDateTime || meeting.startTime,
      endTime: meeting.endDateTime || meeting.endTime,
      creationTime: meeting.creationDateTime,
      allowedPresenters: meeting.allowedPresenters,
      recordAutomatically: meeting.recordAutomatically,
      lobbyBypassSettings: meeting.lobbyBypassSettings,
      participants: meeting.participants,
      chatInfo: meeting.chatInfo,
      videoTeleconferenceId: meeting.videoTeleconferenceId
    };
  }

  /**
   * Cache meeting for quick access
   * @param {string} meetingId - Meeting ID
   * @param {Object} meeting - Meeting data
   */
  cacheMeeting(meetingId, meeting) {
    this.meetingCache.set(meetingId, {
      data: this.formatMeetingResponse(meeting),
      timestamp: Date.now()
    });

    // Clean up expired cache entries
    this.cleanupCache();
  }

  /**
   * Get cached meeting if available and not expired
   * @param {string} meetingId - Meeting ID
   * @returns {Object|null} Cached meeting or null
   */
  getCachedMeeting(meetingId) {
    const cached = this.meetingCache.get(meetingId);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.meetingCache.delete(meetingId);
      return null;
    }

    return cached.data;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [meetingId, cached] of this.meetingCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiry) {
        this.meetingCache.delete(meetingId);
      }
    }
  }

  /**
   * Link Teams meeting to PharmaDOC appointment
   * @param {string} appointmentId - Appointment ID
   * @param {string} meetingId - Teams meeting ID
   * @param {string} joinUrl - Meeting join URL
   */
  async linkMeetingToAppointment(appointmentId, meetingId, joinUrl) {
    try {
      // This would update the appointment in your database with meeting details
      this.auditLogger.log('info', 'Linked Teams meeting to appointment', {
        appointmentId,
        meetingId
      });
      
      // Store the association for future reference
      // Implementation would depend on your database structure
    } catch (error) {
      this.auditLogger.log('error', 'Failed to link meeting to appointment', {
        appointmentId,
        meetingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get meeting analytics and usage stats
   * @param {string} accessToken - Microsoft access token
   * @param {string} meetingId - Meeting ID
   * @returns {Object} Meeting analytics
   */
  async getMeetingAnalytics(accessToken, meetingId) {
    try {
      await this.rateLimiter.checkLimit('meeting_analytics');

      // Note: Meeting analytics require additional Graph API permissions
      // This is a placeholder for future implementation
      const response = await fetch(`${this.betaGraphUrl}/me/onlineMeetings/${meetingId}/attendanceReports`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // Analytics might not be available for all meetings
        return {
          available: false,
          reason: 'Analytics not available for this meeting'
        };
      }

      const data = await response.json();
      
      return {
        available: true,
        attendanceCount: data.value?.length || 0,
        reports: data.value || []
      };
    } catch (error) {
      this.auditLogger.log('warn', 'Failed to get meeting analytics', {
        meetingId,
        error: error.message
      });
      
      return {
        available: false,
        reason: error.message
      };
    }
  }
} 