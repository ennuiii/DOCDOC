/**
 * Google OAuth Provider
 * Handles Google Calendar and Google Meet OAuth authentication
 */

import { google } from 'googleapis';
import { OAuthProvider } from '../../types/OAuthProvider.js';

class GoogleOAuthProvider extends OAuthProvider {
    constructor() {
        super();
        this.clientId = process.env.GOOGLE_CLIENT_ID;
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        this.redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:5000'}/api/integrations/google/callback`;
        
        // Google OAuth scopes for calendar and meet access
        this.scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ];

        this.oauth2Client = new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );
    }

    /**
     * Get authorization URL for OAuth flow
     * @param {Object} options - OAuth options
     * @returns {string} Authorization URL
     */
    async getAuthorizationUrl(options = {}) {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: options.scopes || this.scopes,
            state: options.state,
            prompt: 'consent', // Force consent to get refresh token
            include_granted_scopes: true
        });

        return authUrl;
    }

    /**
     * Exchange authorization code for tokens
     * @param {string} code - Authorization code
     * @param {string} state - State parameter
     * @returns {Object} Token data
     */
    async exchangeCodeForTokens(code, state) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);

            return {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: new Date(tokens.expiry_date).toISOString(),
                scope: tokens.scope ? tokens.scope.split(' ') : this.scopes,
                token_type: tokens.token_type || 'Bearer'
            };
        } catch (error) {
            console.error('Google token exchange error:', error);
            throw new Error(`Failed to exchange code for tokens: ${error.message}`);
        }
    }

    /**
     * Refresh access token
     * @param {string} refreshToken - Refresh token
     * @returns {Object} New token data
     */
    async refreshToken(refreshToken) {
        try {
            this.oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const { credentials } = await this.oauth2Client.refreshAccessToken();

            return {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token || refreshToken,
                expires_at: new Date(credentials.expiry_date).toISOString(),
                scope: credentials.scope ? credentials.scope.split(' ') : this.scopes,
                token_type: credentials.token_type || 'Bearer'
            };
        } catch (error) {
            console.error('Google token refresh error:', error);
            throw new Error(`Failed to refresh token: ${error.message}`);
        }
    }

    /**
     * Revoke access token
     * @param {string} accessToken - Access token to revoke
     */
    async revokeToken(accessToken) {
        try {
            this.oauth2Client.setCredentials({
                access_token: accessToken
            });

            await this.oauth2Client.revokeCredentials();
        } catch (error) {
            console.error('Google token revocation error:', error);
            throw new Error(`Failed to revoke token: ${error.message}`);
        }
    }

    /**
     * Get user information
     * @param {string} accessToken - Access token
     * @returns {Object} User info
     */
    async getUser(accessToken) {
        try {
            this.oauth2Client.setCredentials({
                access_token: accessToken
            });

            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const { data } = await oauth2.userinfo.get();

            return {
                id: data.id,
                email: data.email,
                name: data.name,
                picture: data.picture,
                avatar_url: data.picture,
                verified_email: data.verified_email,
                locale: data.locale
            };
        } catch (error) {
            console.error('Google user info error:', error);
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    /**
     * Health check for the provider
     * @param {string} accessToken - Access token
     * @returns {Object} Health status
     */
    async healthCheck(accessToken) {
        try {
            // Test calendar API access
            this.oauth2Client.setCredentials({
                access_token: accessToken
            });

            const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
            
            // Try to get calendar list
            await calendar.calendarList.list({
                maxResults: 1
            });

            return {
                healthy: true,
                provider: 'google',
                capabilities: ['calendar', 'events', 'meet'],
                lastCheck: new Date().toISOString()
            };
        } catch (error) {
            console.error('Google health check error:', error);
            
            let errorType = 'unknown';
            if (error.code === 401) {
                errorType = 'authentication';
            } else if (error.code === 403) {
                errorType = 'authorization';
            } else if (error.code >= 500) {
                errorType = 'server';
            }

            return {
                healthy: false,
                provider: 'google',
                error: error.message,
                errorType,
                errorCode: error.code,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * Get calendar client with authentication
     * @param {string} accessToken - Access token
     * @param {string} refreshToken - Refresh token (optional)
     * @returns {Object} Google Calendar client
     */
    getCalendarClient(accessToken, refreshToken = null) {
        const authClient = new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );

        authClient.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken
        });

        return google.calendar({ version: 'v3', auth: authClient });
    }

    /**
     * Create a Google Meet event
     * @param {Object} calendarClient - Google Calendar client
     * @param {Object} eventData - Event data
     * @returns {Object} Created event with Google Meet link
     */
    async createMeetEvent(calendarClient, eventData) {
        try {
            // Create calendar event with Google Meet
            const event = {
                summary: eventData.summary,
                description: eventData.description,
                start: eventData.start,
                end: eventData.end,
                attendees: eventData.attendees || [],
                conferenceData: {
                    createRequest: {
                        requestId: `meet-${Date.now()}`,
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet'
                        }
                    }
                }
            };

            const response = await calendarClient.events.insert({
                calendarId: 'primary',
                resource: event,
                conferenceDataVersion: 1
            });

            return response.data;
        } catch (error) {
            console.error('Google Meet event creation error:', error);
            throw new Error(`Failed to create Google Meet event: ${error.message}`);
        }
    }

    /**
     * Get available calendars for the user
     * @param {string} accessToken - Access token
     * @returns {Array} List of calendars
     */
    async getCalendars(accessToken) {
        try {
            const calendar = this.getCalendarClient(accessToken);
            const response = await calendar.calendarList.list();
            
            return response.data.items || [];
        } catch (error) {
            console.error('Google calendars fetch error:', error);
            throw new Error(`Failed to get calendars: ${error.message}`);
        }
    }

    /**
     * Get events from calendar
     * @param {string} accessToken - Access token
     * @param {Object} options - Query options
     * @returns {Array} List of events
     */
    async getEvents(accessToken, options = {}) {
        try {
            const calendar = this.getCalendarClient(accessToken);
            
            const queryOptions = {
                calendarId: options.calendarId || 'primary',
                timeMin: options.timeMin || new Date().toISOString(),
                timeMax: options.timeMax,
                maxResults: options.maxResults || 250,
                singleEvents: true,
                orderBy: 'startTime'
            };

            const response = await calendar.events.list(queryOptions);
            return response.data.items || [];
        } catch (error) {
            console.error('Google events fetch error:', error);
            throw new Error(`Failed to get events: ${error.message}`);
        }
    }

    /**
     * Create a calendar event
     * @param {string} accessToken - Access token
     * @param {Object} eventData - Event data
     * @param {Object} options - Creation options
     * @returns {Object} Created event
     */
    async createEvent(accessToken, eventData, options = {}) {
        try {
            const calendar = this.getCalendarClient(accessToken);
            
            const event = {
                summary: eventData.summary,
                description: eventData.description,
                start: eventData.start,
                end: eventData.end,
                location: eventData.location,
                attendees: eventData.attendees || []
            };

            // Add Google Meet if requested
            if (options.createMeet) {
                event.conferenceData = {
                    createRequest: {
                        requestId: `meet-${Date.now()}`,
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet'
                        }
                    }
                };
            }

            const response = await calendar.events.insert({
                calendarId: options.calendarId || 'primary',
                resource: event,
                conferenceDataVersion: options.createMeet ? 1 : 0
            });

            return response.data;
        } catch (error) {
            console.error('Google event creation error:', error);
            throw new Error(`Failed to create event: ${error.message}`);
        }
    }

    /**
     * Update a calendar event
     * @param {string} accessToken - Access token
     * @param {string} eventId - Event ID to update
     * @param {Object} eventData - Updated event data
     * @param {Object} options - Update options
     * @returns {Object} Updated event
     */
    async updateEvent(accessToken, eventId, eventData, options = {}) {
        try {
            const calendar = this.getCalendarClient(accessToken);
            
            const response = await calendar.events.update({
                calendarId: options.calendarId || 'primary',
                eventId: eventId,
                resource: eventData
            });

            return response.data;
        } catch (error) {
            console.error('Google event update error:', error);
            throw new Error(`Failed to update event: ${error.message}`);
        }
    }

    /**
     * Delete a calendar event
     * @param {string} accessToken - Access token
     * @param {string} eventId - Event ID to delete
     * @param {Object} options - Delete options
     * @returns {boolean} Success status
     */
    async deleteEvent(accessToken, eventId, options = {}) {
        try {
            const calendar = this.getCalendarClient(accessToken);
            
            await calendar.events.delete({
                calendarId: options.calendarId || 'primary',
                eventId: eventId
            });

            return true;
        } catch (error) {
            console.error('Google event deletion error:', error);
            throw new Error(`Failed to delete event: ${error.message}`);
        }
    }
}

export default GoogleOAuthProvider; 