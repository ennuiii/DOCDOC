import AuditLogger from './AuditLogger.js';
import RateLimitManager from './RateLimitManager.js';
import GoogleOAuthProvider from '../providers/google/GoogleOAuthProvider.js';
import { google } from 'googleapis';
import { supabaseAdmin } from '../../config/supabase.js';

/**
 * Google Meet Service
 * Handles Google Meet integration through Google Calendar API conferenceData
 * Supports both personal Gmail and Google Workspace accounts
 */
export class GoogleMeetService {
  constructor() {
    this.auditLogger = new AuditLogger('GoogleMeetService');
    this.rateLimiter = new RateLimitManager();
    this.supabase = supabaseAdmin();
    
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
   * @param {string} refreshToken - Google refresh token for automatic refresh
   * @returns {Object} Created meeting details with Meet link
   */
  async createGoogleMeet(accessToken, meetingData, refreshToken = null) {
    try {
      const rateLimitCheck = await this.rateLimiter.checkRateLimit('google', meetingData.userId, 'calendar.events.insert');
      if (!rateLimitCheck.allowed) {
        throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
      }
      
      await this.auditLogger.logEvent('GOOGLE_MEET_CREATION_START', {
        userId: meetingData.userId,
        subject: meetingData.subject,
        startDateTime: meetingData.startDateTime,
        attendeeCount: meetingData.attendees?.length || 0
      }, { userId: meetingData.userId, provider: 'google-meet' });

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

      // Get Google Calendar client with token refresh capability
      const calendar = await this.getCalendarClient(accessToken, refreshToken, meetingData.userId);

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

      // Record the successful request for rate limiting
      await this.rateLimiter.recordRequest('google', meetingData.userId, 'calendar.events.insert');

      const createdEvent = response.data;
      
      // Extract Google Meet details
      const meetingDetails = this.extractMeetingDetails(createdEvent);
      
      // Cache the meeting details
      this.cacheMeeting(meetingDetails.meetingId, meetingDetails);

      await this.auditLogger.logEvent('GOOGLE_MEET_CREATION_SUCCESS', {
        eventId: createdEvent.id,
        meetingId: meetingDetails.meetingId,
        meetUrl: meetingDetails.joinUrl,
        calendarId: createdEvent.organizer?.email
      }, { userId: meetingData.userId, provider: 'google-meet' });

      return {
        success: true,
        meeting: meetingDetails,
        calendarEvent: createdEvent
      };

    } catch (error) {
      await this.auditLogger.logEvent('GOOGLE_MEET_CREATION_ERROR', {
        error: error.message,
        stack: error.stack,
        userId: meetingData.userId
      }, { userId: meetingData.userId, provider: 'google-meet' });
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
   * Get Google Calendar client with automatic token refresh
   * @param {string} accessToken - Access token
   * @param {string} refreshToken - Refresh token
   * @param {string} userId - User ID for token updates
   * @returns {Object} Calendar client
   */
  async getCalendarClient(accessToken, refreshToken = null, userId = null) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken
    });
    
    // Handle token refresh automatically
    if (refreshToken && userId) {
      oauth2Client.on('tokens', async (tokens) => {
        console.log('🔄 Google tokens refreshed automatically');
        
        try {
          // Update tokens in database
          const { error } = await this.supabase
            .from('user_integrations')
            .update({
              access_token: tokens.access_token,
              expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
              refresh_token: tokens.refresh_token || refreshToken,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('provider', 'google');
            
          if (error) {
            console.error('❌ Failed to update refreshed tokens:', error);
          } else {
            console.log('✅ Refreshed tokens saved to database');
          }
        } catch (error) {
          console.error('❌ Token refresh database update error:', error);
        }
      });
    }
    
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