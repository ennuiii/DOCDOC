import AuditLogger from './AuditLogger.js';
import RateLimitManager from './RateLimitManager.js';
import GoogleOAuthProvider from '../providers/google/GoogleOAuthProvider.js';
import { google } from 'googleapis';

/**
 * Google Meet Service
 * Handles Google Meet integration through Google Calendar API conferenceData
 * Supports both personal Gmail and Google Workspace accounts
 */
export class GoogleMeetService {
  constructor() {
    this.auditLogger = new AuditLogger('GoogleMeetService');
    this.rateLimiter = new RateLimitManager({
      requests: 100,
      window: 100000, // 100 seconds
      burstLimit: 10
    });
    
    this.oauthProvider = new GoogleOAuthProvider();
    
    // Google Meet configuration
    this.conferenceTypes = {
      HANGOUTS_MEET: 'hangoutsMeet',
      GOOGLE_MEET: 'googleMeet' // For newer accounts
    };
    
    // Meeting cache for performance
    this.meetingCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Create a Google Meet meeting through Calendar API
   * @param {string} accessToken - Google access token
   * @param {Object} meetingData - Meeting configuration
   * @returns {Object} Created meeting details with Meet link
   */
  async createGoogleMeet(accessToken, meetingData) {
    try {
      await this.rateLimiter.checkLimit('create_meet');
      
      this.auditLogger.logInfo('Creating Google Meet meeting', {
        userId: meetingData.userId,
        subject: meetingData.subject
      });

      const {
        userId,
        subject,
        startDateTime,
        endDateTime,
        attendees = [],
        description = '',
        timeZone = 'UTC',
        calendarId = 'primary',
        conferenceRequestId,
        meetingSettings = {}
      } = meetingData;

      // Get Google Calendar client
      const calendar = await this.getCalendarClient(accessToken);

      // Prepare conference data for Google Meet
      const conferenceData = {
        createRequest: {
          requestId: conferenceRequestId || this.generateConferenceRequestId(),
          conferenceSolutionKey: {
            type: this.conferenceTypes.HANGOUTS_MEET
          }
        }
      };

      // Apply meeting settings if provided
      if (meetingSettings.entryPointAccess) {
        conferenceData.createRequest.conferenceSolutionKey.entryPointAccess = meetingSettings.entryPointAccess;
      }

      // Create calendar event with conference data
      const eventData = {
        summary: subject,
        description: description,
        start: {
          dateTime: startDateTime,
          timeZone: timeZone
        },
        end: {
          dateTime: endDateTime,
          timeZone: timeZone
        },
        attendees: attendees.map(email => ({ email })),
        conferenceData: conferenceData,
        // Enable guest access by default for PharmaDOC meetings
        guestsCanInviteOthers: meetingSettings.guestsCanInvite !== undefined ? meetingSettings.guestsCanInvite : false,
        guestsCanModify: meetingSettings.guestsCanModify !== undefined ? meetingSettings.guestsCanModify : false,
        guestsCanSeeOtherGuests: meetingSettings.guestsCanSeeOthers !== undefined ? meetingSettings.guestsCanSeeOthers : true
      };

      // Create the event with conference data
      const response = await calendar.events.insert({
        calendarId: calendarId,
        resource: eventData,
        conferenceDataVersion: 1, // Required for conference data
        sendUpdates: 'all' // Send invitations to attendees
      });

      const createdEvent = response.data;
      
      // Extract Google Meet details
      const meetingDetails = this.extractMeetingDetails(createdEvent);
      
      // Cache the meeting details
      this.cacheMeeting(meetingDetails.meetingId, meetingDetails);

      this.auditLogger.logInfo('Google Meet meeting created successfully', {
        eventId: createdEvent.id,
        meetingId: meetingDetails.meetingId,
        meetUrl: meetingDetails.joinUrl
      });

      return {
        success: true,
        meeting: meetingDetails,
        calendarEvent: createdEvent
      };

    } catch (error) {
      this.auditLogger.logError('Failed to create Google Meet meeting', {
        error: error.message,
        userId: meetingData.userId
      });
      throw error;
    }
  }

  /**
   * Extract meeting details from calendar event
   * @param {Object} event - Calendar event
   * @returns {Object} Meeting details
   */
  extractMeetingDetails(event) {
    const conferenceData = event.conferenceData;
    const joinUrl = conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;
    
    return {
      meetingId: conferenceData?.conferenceId || event.id,
      joinUrl: joinUrl || '',
      meetingCode: conferenceData?.conferenceId,
      dialInNumbers: conferenceData?.entryPoints?.filter(ep => ep.entryPointType === 'phone') || [],
      eventId: event.id,
      htmlLink: event.htmlLink,
      calendarId: event.organizer?.email
    };
  }

  /**
   * Generate conference request ID
   * @returns {string} Conference request ID
   */
  generateConferenceRequestId() {
    return `pharmadoc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get Google Calendar client
   * @param {string} accessToken - Access token
   * @returns {Object} Calendar client
   */
  async getCalendarClient(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Cache meeting details
   * @param {string} meetingId - Meeting ID
   * @param {Object} meetingDetails - Meeting details
   */
  cacheMeeting(meetingId, meetingDetails) {
    this.meetingCache.set(meetingId, {
      ...meetingDetails,
      cachedAt: Date.now()
    });

    // Clean up expired cache entries
    this.cleanupCache();
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.meetingCache.entries()) {
      if (now - value.cachedAt > this.cacheTimeout) {
        this.meetingCache.delete(key);
      }
    }
  }

  /**
   * Get cached meeting
   * @param {string} meetingId - Meeting ID
   * @returns {Object|null} Cached meeting details
   */
  getCachedMeeting(meetingId) {
    const cached = this.meetingCache.get(meetingId);
    if (cached && Date.now() - cached.cachedAt < this.cacheTimeout) {
      return cached;
    }
    return null;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.meetingCache.clear();
  }

  /**
   * Get service statistics
   * @returns {Object} Service stats
   */
  getStats() {
    return {
      cacheSize: this.meetingCache.size,
      cacheTimeout: this.cacheTimeout
    };
  }
}

export default GoogleMeetService; 