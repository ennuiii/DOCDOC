import { AuditLogger } from './AuditLogger.js';
import { RateLimitManager } from './RateLimitManager.js';
import { TimezoneService } from './TimezoneService.js';
import { ConflictResolutionService } from './ConflictResolutionService.js';
import { BufferTimeService } from './BufferTimeService.js';
import MicrosoftOAuthProvider from '../providers/microsoft/MicrosoftOAuthProvider.js';

/**
 * Outlook Calendar Synchronization Service
 * Handles bidirectional synchronization between PharmaDOC and Outlook calendars
 * via Microsoft Graph API
 */
export class OutlookCalendarSyncService {
  constructor() {
    this.auditLogger = new AuditLogger('OutlookCalendarSync');
    this.rateLimiter = new RateLimitManager({
      requests: 2000,
      window: 300000, // 5 minutes for Microsoft Graph
      burstLimit: 100
    });
    
    this.timezoneService = new TimezoneService();
    this.conflictResolver = new ConflictResolutionService();
    this.bufferTimeService = new BufferTimeService();
    this.oauthProvider = new MicrosoftOAuthProvider();
    
    // Microsoft Graph API endpoints
    this.graphUrl = 'https://graph.microsoft.com/v1.0';
    this.betaGraphUrl = 'https://graph.microsoft.com/beta';
    
    // Sync state management
    this.syncStates = new Map();
    this.syncIntervals = new Map();
  }

  /**
   * Initialize sync for a user
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @param {Object} syncSettings - Sync configuration
   */
  async initializeSync(userId, accessToken, syncSettings = {}) {
    try {
      this.auditLogger.log('info', 'Initializing Outlook sync', { userId });

      const {
        syncDirection = 'bidirectional', // 'to-outlook', 'from-outlook', 'bidirectional'
        selectedCalendars = ['primary'],
        syncInterval = 300000, // 5 minutes
        enableConflictResolution = true,
        enableBufferTime = true,
        includeTeamsMeetings = true
      } = syncSettings;

      // Validate token
      const isValidToken = await this.oauthProvider.validateToken(accessToken);
      if (!isValidToken) {
        throw new Error('Invalid Microsoft access token');
      }

      // Get user profile and primary calendar
      const userProfile = await this.oauthProvider.getUserProfile(accessToken);
      const calendars = await this.getCalendars(accessToken);

      // Initialize sync state
      this.syncStates.set(userId, {
        accessToken,
        userProfile,
        calendars,
        syncSettings,
        lastSync: null,
        lastDeltaToken: null,
        isActive: true,
        syncErrors: [],
        syncStats: {
          appointmentsToOutlook: 0,
          appointmentsFromOutlook: 0,
          conflicts: 0,
          errors: 0
        }
      });

      // Set up automatic sync interval
      if (syncInterval > 0) {
        const intervalId = setInterval(async () => {
          try {
            await this.performSync(userId);
          } catch (error) {
            this.auditLogger.log('error', 'Automatic sync failed', { userId, error: error.message });
          }
        }, syncInterval);

        this.syncIntervals.set(userId, intervalId);
      }

      // Perform initial sync
      await this.performSync(userId);

      this.auditLogger.log('info', 'Outlook sync initialized successfully', {
        userId,
        calendarsCount: calendars.length,
        syncDirection,
        includeTeamsMeetings
      });

      return {
        success: true,
        calendars,
        userProfile,
        syncSettings
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to initialize Outlook sync', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Perform bidirectional sync between PharmaDOC and Outlook
   * @param {string} userId - User ID
   */
  async performSync(userId) {
    const syncState = this.syncStates.get(userId);
    if (!syncState || !syncState.isActive) {
      throw new Error('Sync not initialized for user');
    }

    try {
      await this.rateLimiter.checkLimit(`sync_${userId}`);
      
      this.auditLogger.log('info', 'Starting Outlook sync', { userId });

      const { syncSettings, lastSync } = syncState;
      const syncStartTime = new Date();

      // Get PharmaDOC appointments and Outlook events
      const [appointments, outlookEvents] = await Promise.all([
        this.getPharmaDOCAppointments(userId, lastSync),
        this.getOutlookEvents(syncState.accessToken, {
          selectedCalendars: syncSettings.selectedCalendars,
          since: lastSync,
          deltaToken: syncState.lastDeltaToken
        })
      ]);

      // Perform sync based on direction settings
      const syncResults = {
        appointmentsToOutlook: 0,
        appointmentsFromOutlook: 0,
        conflicts: [],
        errors: []
      };

      if (syncSettings.syncDirection === 'to-outlook' || syncSettings.syncDirection === 'bidirectional') {
        const toOutlookResults = await this.syncAppointmentsToOutlook(
          userId,
          appointments,
          syncState.accessToken,
          syncSettings
        );
        syncResults.appointmentsToOutlook = toOutlookResults.synced;
        syncResults.conflicts.push(...toOutlookResults.conflicts);
        syncResults.errors.push(...toOutlookResults.errors);
      }

      if (syncSettings.syncDirection === 'from-outlook' || syncSettings.syncDirection === 'bidirectional') {
        const fromOutlookResults = await this.syncEventsFromOutlook(
          userId,
          outlookEvents.events,
          syncSettings
        );
        syncResults.appointmentsFromOutlook = fromOutlookResults.synced;
        syncResults.conflicts.push(...fromOutlookResults.conflicts);
        syncResults.errors.push(...fromOutlookResults.errors);
      }

      // Handle conflicts if enabled
      if (syncSettings.enableConflictResolution && syncResults.conflicts.length > 0) {
        await this.handleSyncConflicts(userId, syncResults.conflicts);
      }

      // Update sync state
      syncState.lastSync = syncStartTime;
      syncState.lastDeltaToken = outlookEvents.deltaToken;
      syncState.syncStats = {
        ...syncState.syncStats,
        appointmentsToOutlook: syncState.syncStats.appointmentsToOutlook + syncResults.appointmentsToOutlook,
        appointmentsFromOutlook: syncState.syncStats.appointmentsFromOutlook + syncResults.appointmentsFromOutlook,
        conflicts: syncState.syncStats.conflicts + syncResults.conflicts.length,
        errors: syncState.syncStats.errors + syncResults.errors.length
      };

      this.auditLogger.log('info', 'Outlook sync completed', {
        userId,
        duration: Date.now() - syncStartTime.getTime(),
        results: syncResults
      });

      return syncResults;
    } catch (error) {
      this.auditLogger.log('error', 'Outlook sync failed', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's Outlook calendars
   * @param {string} accessToken - Microsoft access token
   * @returns {Array} List of calendars
   */
  async getCalendars(accessToken) {
    try {
      await this.rateLimiter.checkLimit('get_calendars');

      const response = await fetch(`${this.graphUrl}/me/calendars`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Get calendars');
      }

      const data = await response.json();
      
      const calendars = (data.value || []).map(calendar => ({
        id: calendar.id,
        name: calendar.name,
        description: calendar.description,
        color: calendar.color,
        isDefault: calendar.isDefaultCalendar,
        canEdit: calendar.canEdit,
        canShare: calendar.canShare,
        canViewPrivateItems: calendar.canViewPrivateItems,
        changeKey: calendar.changeKey,
        owner: calendar.owner
      }));

      this.auditLogger.log('info', 'Retrieved Outlook calendars', {
        count: calendars.length
      });

      return calendars;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to get Outlook calendars', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get Outlook calendar events
   * @param {string} accessToken - Microsoft access token
   * @param {Object} options - Query options
   * @returns {Object} Events and sync metadata
   */
  async getOutlookEvents(accessToken, options = {}) {
    try {
      await this.rateLimiter.checkLimit('get_events');

      const {
        selectedCalendars = ['primary'],
        since,
        deltaToken,
        timeMin,
        timeMax,
        maxResults = 250
      } = options;

      let allEvents = [];
      let newDeltaToken = null;

      // Get events from each selected calendar
      for (const calendarId of selectedCalendars) {
        const apiPath = calendarId === 'primary' ? '/me/calendar/events' : `/me/calendars/${calendarId}/events`;
        
        let url = `${this.graphUrl}${apiPath}`;
        const params = new URLSearchParams();

        if (deltaToken && !since) {
          // Use delta query for incremental sync
          url += '/delta';
          params.append('$deltatoken', deltaToken);
        } else {
          // Full query with time filters
          params.append('$top', maxResults.toString());
          params.append('$orderby', 'start/dateTime');
          
          if (since) {
            const sinceISO = new Date(since).toISOString();
            params.append('$filter', `lastModifiedDateTime ge ${sinceISO}`);
          } else if (timeMin || timeMax) {
            const filters = [];
            if (timeMin) {
              filters.push(`start/dateTime ge '${new Date(timeMin).toISOString()}'`);
            }
            if (timeMax) {
              filters.push(`end/dateTime le '${new Date(timeMax).toISOString()}'`);
            }
            if (filters.length > 0) {
              params.append('$filter', filters.join(' and '));
            }
          }
        }

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Prefer': 'outlook.timezone="UTC"'
          }
        });

        if (!response.ok) {
          await this.oauthProvider.handleApiError(response, 'Get events');
        }

        const data = await response.json();
        
        const events = (data.value || []).map(event => this.mapOutlookEventToAppointment(event, calendarId));
        allEvents.push(...events);

        // Extract delta token from response for future incremental syncs
        if (data['@odata.deltaLink']) {
          const deltaUrl = new URL(data['@odata.deltaLink']);
          newDeltaToken = deltaUrl.searchParams.get('$deltatoken');
        }
      }

      this.auditLogger.log('info', 'Retrieved Outlook events', {
        calendars: selectedCalendars.length,
        events: allEvents.length,
        hasDeltaToken: !!newDeltaToken
      });

      return {
        events: allEvents,
        deltaToken: newDeltaToken
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to get Outlook events', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create or update Outlook calendar event
   * @param {string} accessToken - Microsoft access token
   * @param {Object} appointment - PharmaDOC appointment
   * @param {string} calendarId - Target calendar ID
   * @param {Object} options - Creation options
   * @returns {Object} Created/updated event
   */
  async createOrUpdateOutlookEvent(accessToken, appointment, calendarId = 'primary', options = {}) {
    try {
      await this.rateLimiter.checkLimit('create_event');

      const eventData = await this.mapAppointmentToOutlookEvent(appointment, options);
      
      const apiPath = calendarId === 'primary' ? '/me/calendar/events' : `/me/calendars/${calendarId}/events`;
      
      let response;
      
      if (appointment.outlookEventId) {
        // Update existing event
        const updatePath = `${apiPath}/${appointment.outlookEventId}`;
        response = await fetch(`${this.graphUrl}${updatePath}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(eventData)
        });
      } else {
        // Create new event
        response = await fetch(`${this.graphUrl}${apiPath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(eventData)
        });
      }

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Create/Update event');
      }

      const event = await response.json();

      this.auditLogger.log('info', 'Outlook event created/updated', {
        appointmentId: appointment.id,
        eventId: event.id,
        action: appointment.outlookEventId ? 'updated' : 'created'
      });

      return event;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to create/update Outlook event', {
        appointmentId: appointment.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete Outlook calendar event
   * @param {string} accessToken - Microsoft access token
   * @param {string} eventId - Event ID to delete
   * @param {string} calendarId - Calendar ID
   */
  async deleteOutlookEvent(accessToken, eventId, calendarId = 'primary') {
    try {
      await this.rateLimiter.checkLimit('delete_event');

      const apiPath = calendarId === 'primary' ? '/me/calendar/events' : `/me/calendars/${calendarId}/events`;
      
      const response = await fetch(`${this.graphUrl}${apiPath}/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok && response.status !== 404) {
        await this.oauthProvider.handleApiError(response, 'Delete event');
      }

      this.auditLogger.log('info', 'Outlook event deleted', { eventId });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to delete Outlook event', {
        eventId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync PharmaDOC appointments to Outlook
   * @param {string} userId - User ID
   * @param {Array} appointments - PharmaDOC appointments
   * @param {string} accessToken - Microsoft access token
   * @param {Object} syncSettings - Sync configuration
   * @returns {Object} Sync results
   */
  async syncAppointmentsToOutlook(userId, appointments, accessToken, syncSettings) {
    const results = {
      synced: 0,
      conflicts: [],
      errors: []
    };

    for (const appointment of appointments) {
      try {
        // Apply buffer time if enabled
        let processedAppointment = appointment;
        if (syncSettings.enableBufferTime) {
          processedAppointment = await this.bufferTimeService.applyBufferTime(appointment, userId);
        }

        // Check for conflicts
        if (syncSettings.enableConflictResolution) {
          const conflicts = await this.checkOutlookConflicts(accessToken, processedAppointment);
          if (conflicts.length > 0) {
            results.conflicts.push({
              appointment: processedAppointment,
              conflicts,
              type: 'appointment_to_outlook'
            });
            continue;
          }
        }

        // Create or update in Outlook
        const outlookEvent = await this.createOrUpdateOutlookEvent(
          accessToken,
          processedAppointment,
          syncSettings.selectedCalendars[0] || 'primary',
          {
            includeTeamsMeeting: syncSettings.includeTeamsMeetings && appointment.requiresVideoCall
          }
        );

        // Update appointment with Outlook event ID
        await this.updateAppointmentOutlookId(appointment.id, outlookEvent.id);

        results.synced++;
      } catch (error) {
        results.errors.push({
          appointmentId: appointment.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Sync Outlook events to PharmaDOC appointments
   * @param {string} userId - User ID
   * @param {Array} events - Outlook events
   * @param {Object} syncSettings - Sync configuration
   * @returns {Object} Sync results
   */
  async syncEventsFromOutlook(userId, events, syncSettings) {
    const results = {
      synced: 0,
      conflicts: [],
      errors: []
    };

    for (const event of events) {
      try {
        // Skip events that are already managed by PharmaDOC
        if (event.categories && event.categories.includes('PharmaDOC')) {
          continue;
        }

        // Check for conflicts with existing appointments
        if (syncSettings.enableConflictResolution) {
          const conflicts = await this.checkPharmaDOCConflicts(userId, event);
          if (conflicts.length > 0) {
            results.conflicts.push({
              event,
              conflicts,
              type: 'outlook_to_appointment'
            });
            continue;
          }
        }

        // Create or update PharmaDOC appointment
        const appointment = await this.createOrUpdatePharmaDOCAppointment(userId, event);

        results.synced++;
      } catch (error) {
        results.errors.push({
          eventId: event.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Map PharmaDOC appointment to Outlook event format
   * @param {Object} appointment - PharmaDOC appointment
   * @param {Object} options - Mapping options
   * @returns {Object} Outlook event data
   */
  async mapAppointmentToOutlookEvent(appointment, options = {}) {
    const {
      includeTeamsMeeting = false,
      includeAttendees = true
    } = options;

    // Convert times to UTC for Microsoft Graph
    const startDateTime = await this.timezoneService.convertToUtc(
      appointment.startTime,
      appointment.timezone || 'UTC'
    );
    const endDateTime = await this.timezoneService.convertToUtc(
      appointment.endTime,
      appointment.timezone || 'UTC'
    );

    const eventData = {
      subject: appointment.title,
      body: {
        contentType: 'text',
        content: appointment.description || appointment.notes || ''
      },
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'UTC'
      },
      location: {
        displayName: appointment.location || ''
      },
      categories: ['PharmaDOC'],
      showAs: 'busy',
      sensitivity: 'normal'
    };

    // Add attendees
    if (includeAttendees && appointment.attendees) {
      eventData.attendees = appointment.attendees.map(attendee => ({
        emailAddress: {
          address: attendee.email,
          name: attendee.name
        },
        type: attendee.type || 'required'
      }));
    }

    // Add Teams meeting if requested
    if (includeTeamsMeeting) {
      eventData.isOnlineMeeting = true;
      eventData.onlineMeetingProvider = 'teamsForBusiness';
    }

    // Add custom properties for sync tracking
    eventData.transactionId = `pharmadoc-${appointment.id}`;

    return eventData;
  }

  /**
   * Map Outlook event to PharmaDOC appointment format
   * @param {Object} event - Outlook event
   * @param {string} calendarId - Source calendar ID
   * @returns {Object} PharmaDOC appointment data
   */
  mapOutlookEventToAppointment(event, calendarId) {
    return {
      id: null, // Will be assigned when created
      outlookEventId: event.id,
      calendarId,
      title: event.subject,
      description: event.body?.content || '',
      startTime: new Date(event.start.dateTime),
      endTime: new Date(event.end.dateTime),
      timezone: event.start.timeZone || 'UTC',
      location: event.location?.displayName || '',
      status: this.mapOutlookStatusToPharmaDOC(event.showAs),
      attendees: (event.attendees || []).map(attendee => ({
        email: attendee.emailAddress.address,
        name: attendee.emailAddress.name,
        type: attendee.type,
        responseStatus: attendee.status?.response || 'needsAction'
      })),
      videoCallLink: event.onlineMeeting?.joinUrl || '',
      lastModified: new Date(event.lastModifiedDateTime),
      changeKey: event.changeKey,
      isFromOutlook: true
    };
  }

  /**
   * Map Outlook status to PharmaDOC status
   * @param {string} outlookStatus - Outlook event status
   * @returns {string} PharmaDOC status
   */
  mapOutlookStatusToPharmaDOC(outlookStatus) {
    const statusMap = {
      'free': 'available',
      'tentative': 'tentative',
      'busy': 'booked',
      'oof': 'unavailable',
      'workingElsewhere': 'busy'
    };

    return statusMap[outlookStatus] || 'booked';
  }

  /**
   * Check for conflicts with Outlook events
   * @param {string} accessToken - Microsoft access token
   * @param {Object} appointment - PharmaDOC appointment
   * @returns {Array} List of conflicting events
   */
  async checkOutlookConflicts(accessToken, appointment) {
    try {
      const conflictingEvents = await this.getOutlookEvents(accessToken, {
        timeMin: appointment.startTime,
        timeMax: appointment.endTime
      });

      return conflictingEvents.events.filter(event => 
        event.showAs === 'busy' && 
        !event.categories?.includes('PharmaDOC')
      );
    } catch (error) {
      this.auditLogger.log('error', 'Failed to check Outlook conflicts', {
        appointmentId: appointment.id,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check for conflicts with PharmaDOC appointments
   * @param {string} userId - User ID
   * @param {Object} event - Outlook event
   * @returns {Array} List of conflicting appointments
   */
  async checkPharmaDOCConflicts(userId, event) {
    try {
      // This would integrate with your PharmaDOC appointment service
      // For now, returning empty array
      return [];
    } catch (error) {
      this.auditLogger.log('error', 'Failed to check PharmaDOC conflicts', {
        eventId: event.id,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Handle sync conflicts
   * @param {string} userId - User ID
   * @param {Array} conflicts - List of conflicts
   */
  async handleSyncConflicts(userId, conflicts) {
    for (const conflict of conflicts) {
      try {
        const resolution = await this.conflictResolver.resolveConflict({
          userId,
          conflict,
          strategy: 'user_choice' // Let user decide
        });

        this.auditLogger.log('info', 'Sync conflict resolved', {
          userId,
          conflictType: conflict.type,
          resolution: resolution.action
        });
      } catch (error) {
        this.auditLogger.log('error', 'Failed to resolve sync conflict', {
          userId,
          error: error.message
        });
      }
    }
  }

  /**
   * Get PharmaDOC appointments for sync
   * @param {string} userId - User ID
   * @param {Date} since - Get appointments modified since this date
   * @returns {Array} List of appointments
   */
  async getPharmaDOCAppointments(userId, since) {
    try {
      // This would integrate with your PharmaDOC appointment service
      // For now, returning empty array
      return [];
    } catch (error) {
      this.auditLogger.log('error', 'Failed to get PharmaDOC appointments', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Update appointment with Outlook event ID
   * @param {string} appointmentId - Appointment ID
   * @param {string} outlookEventId - Outlook event ID
   */
  async updateAppointmentOutlookId(appointmentId, outlookEventId) {
    try {
      // This would update the appointment in your database
      this.auditLogger.log('info', 'Updated appointment with Outlook event ID', {
        appointmentId,
        outlookEventId
      });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to update appointment Outlook ID', {
        appointmentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create or update PharmaDOC appointment from Outlook event
   * @param {string} userId - User ID
   * @param {Object} event - Outlook event
   * @returns {Object} Created/updated appointment
   */
  async createOrUpdatePharmaDOCAppointment(userId, event) {
    try {
      // This would integrate with your PharmaDOC appointment service
      this.auditLogger.log('info', 'Created/updated PharmaDOC appointment from Outlook', {
        userId,
        eventId: event.id
      });
      
      return { id: 'temp-id' }; // Placeholder
    } catch (error) {
      this.auditLogger.log('error', 'Failed to create/update PharmaDOC appointment', {
        userId,
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop sync for a user
   * @param {string} userId - User ID
   */
  async stopSync(userId) {
    try {
      // Clear sync interval
      const intervalId = this.syncIntervals.get(userId);
      if (intervalId) {
        clearInterval(intervalId);
        this.syncIntervals.delete(userId);
      }

      // Mark sync as inactive
      const syncState = this.syncStates.get(userId);
      if (syncState) {
        syncState.isActive = false;
      }

      this.auditLogger.log('info', 'Outlook sync stopped', { userId });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to stop Outlook sync', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get sync status for a user
   * @param {string} userId - User ID
   * @returns {Object} Sync status
   */
  getSyncStatus(userId) {
    const syncState = this.syncStates.get(userId);
    if (!syncState) {
      return { active: false };
    }

    return {
      active: syncState.isActive,
      lastSync: syncState.lastSync,
      stats: syncState.syncStats,
      errors: syncState.syncErrors,
      settings: syncState.syncSettings
    };
  }

  /**
   * Update sync settings for a user
   * @param {string} userId - User ID
   * @param {Object} newSettings - New sync settings
   */
  async updateSyncSettings(userId, newSettings) {
    const syncState = this.syncStates.get(userId);
    if (!syncState) {
      throw new Error('Sync not initialized for user');
    }

    syncState.syncSettings = {
      ...syncState.syncSettings,
      ...newSettings
    };

    this.auditLogger.log('info', 'Sync settings updated', {
      userId,
      newSettings
    });

    // Restart sync with new settings if needed
    if (syncState.isActive) {
      await this.stopSync(userId);
      await this.initializeSync(userId, syncState.accessToken, syncState.syncSettings);
    }
  }
} 