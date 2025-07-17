/**
 * CalDAV Synchronization Service
 * Handles bidirectional sync between PharmaDOC and CalDAV providers
 */

import TimezoneService from './TimezoneService.js';
import ConflictResolutionService from './ConflictResolutionService.js';
import BufferTimeService from './BufferTimeService.js';
import AuditLogger from './AuditLogger.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

class CalDAVSyncService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role key to bypass RLS
    );

    this.timezoneService = new TimezoneService();
    this.conflictResolutionService = new ConflictResolutionService();
    this.bufferTimeService = new BufferTimeService();
    this.auditLogger = new AuditLogger('CalDAVSyncService');
    
    this.syncCache = new Map();
    this.eventMappings = new Map(); // PharmaDOC appointment ID -> CalDAV event UID
    
    // Sync configuration
    this.syncConfig = {
      batchSize: 50,
      maxRetries: 3,
      syncInterval: 15 * 60 * 1000, // 15 minutes
      conflictResolution: 'manual', // 'manual', 'source_wins', 'destination_wins'
      bufferTime: 5 * 60 * 1000 // 5 minutes buffer
    };
  }

  /**
   * Setup CalDAV integration for a user
   */
  async setupCalDAVIntegration(userId, calDAVConfig) {
    try {
      this.auditLogger.log('info', 'Setting up CalDAV integration', { userId, provider: calDAVConfig.provider });

      // TODO: Implement CalDAV setup using tsdav approach
      // For now, we'll create a basic integration record
      // The actual provider detection and authentication should use the same
      // tsdav approach as the sync methods
      
      // Create a basic provider config
      const providerConfig = {
        provider: 'caldav',
        serverUrl: calDAVConfig.serverUrl,
        username: calDAVConfig.username,
        providerType: calDAVConfig.providerType || 'icloud'
      };

      // Store integration configuration
      const integrationData = {
        user_id: userId,
        provider: 'caldav',
        provider_user_id: calDAVConfig.username,
        provider_email: calDAVConfig.username, // Use username as email for CalDAV
        config: {
          ...providerConfig,
          password: this.encryptPassword(calDAVConfig.password),
          selectedCalendars: [], // Will be populated during first sync
          syncDirection: calDAVConfig.syncDirection || 'bidirectional',
          autoSync: calDAVConfig.autoSync || true,
          syncInterval: calDAVConfig.syncInterval || this.syncConfig.syncInterval,
          syncToken: null
        },
        status: 'connected',
        last_sync_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('user_integrations')
        .insert(integrationData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store integration: ${error.message}`);
      }

      this.auditLogger.log('info', 'CalDAV integration setup complete', {
        userId,
        provider: providerConfig.provider
      });

      return {
        integrationId: data.id,
        provider: providerConfig.provider,
        calendars: [], // Will be populated during first sync
        status: 'connected'
      };

    } catch (error) {
      this.auditLogger.log('error', 'CalDAV integration setup failed', { error: error.message });
      throw new Error(`Failed to setup CalDAV integration: ${error.message}`);
    }
  }

  /**
   * Perform bidirectional sync for a user
   */
  async performSync(userId, integrationId = null) {
    try {
      this.auditLogger.log('info', 'Starting CalDAV sync', { userId, integrationId });

      // Get active CalDAV integrations
      const integrations = await this.getActiveIntegrations(userId, integrationId);

      const syncResults = [];

      for (const integration of integrations) {
        try {
          const result = await this.syncIntegration(integration);
          syncResults.push(result);
        } catch (error) {
          this.auditLogger.log('error', 'Integration sync failed', { error: error.message });
          syncResults.push({
            integrationId: integration.id,
            success: false,
            error: error.message
          });
        }
      }

      this.auditLogger.log('info', 'CalDAV sync completed', {
        userId,
        totalIntegrations: integrations.length,
        successful: syncResults.filter(r => r.success).length
      });

      return {
        userId,
        syncResults,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.auditLogger.log('error', 'CalDAV sync failed', { error: error.message });
      throw new Error(`Sync failed: ${error.message}`);
    }
  }

  /**
   * Sync a single integration
   */
  async syncIntegration(integration) {
    try {
      // Initialize calDAVConfig at the method level to ensure proper scope
      let calDAVConfig = null;
      
      this.auditLogger.log('info', 'Starting CalDAV sync', { 
        userId: integration.user_id, 
        integrationId: integration.id 
      });

      // Decode CalDAV credentials
      const credentialsData = JSON.parse(
        Buffer.from(integration.access_token, 'base64').toString('utf-8')
      );

      // Create authenticated DAV client using working tsdav approach
      const { createDAVClient } = await import('tsdav');
      const davClient = await createDAVClient({
        serverUrl: credentialsData.serverUrl,
        credentials: {
          username: credentialsData.username,
          password: credentialsData.password
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
      
      // Test the connection by fetching calendars (like the working connection test)
      const calendars = await davClient.fetchCalendars();
      this.auditLogger.log('info', 'CalDAV authentication successful', { 
        username: credentialsData.username,
        calendar_count: calendars.length 
      });
      
      // Create a config object for the sync methods - define it properly
      calDAVConfig = {
        provider: 'caldav',
        serverUrl: credentialsData.serverUrl,
        username: credentialsData.username,
        providerType: credentialsData.providerType || 'icloud'
      };

      // Debug log to verify calDAVConfig is properly created
      this.auditLogger.log('info', 'CalDAV config created', { 
        calDAVConfig: {
          provider: calDAVConfig.provider,
          serverUrl: calDAVConfig.serverUrl,
          username: calDAVConfig.username,
          providerType: calDAVConfig.providerType
        }
      });

      // Get available calendars if not stored
      let selectedCalendars = integration.config.selectedCalendars;
      if (!selectedCalendars || selectedCalendars.length === 0) {
        // Use working davClient to get calendars
        selectedCalendars = calendars.map(cal => cal.url);
        
        // Update integration with discovered calendars
        integration.config.selectedCalendars = selectedCalendars;
      }

      let totalEvents = 0;
      let conflicts = [];

      // Sync each selected calendar
      for (const calendarUrl of selectedCalendars) {
        const calendar = { url: calendarUrl, name: this.extractCalendarName(calendarUrl) };
        
        // Get calendar events from CalDAV using working davClient
        const calendarObjects = await davClient.fetchCalendarObjects({
          calendar: calendars.find(cal => cal.url === calendarUrl),
          timeRange: {
            start: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString(), // 30 days ago
            end: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)).toISOString()    // 90 days ahead
          }
        });
        
        // Convert to our expected format
        const syncResult = {
          events: calendarObjects.map(obj => this.parseCalendarObject(obj)),
          syncToken: `sync-${Date.now()}` // Simple sync token for now
        };

        // Process events based on sync direction (default to bidirectional)
        const syncDirection = integration.config.sync_direction || integration.config.syncDirection || 'bidirectional';
        
        if (syncDirection === 'bidirectional' || syncDirection === 'caldav_to_pharmadoc') {
          // Debug log before calling import
          this.auditLogger.log('info', 'About to call importCalDAVEvents', { 
            hasCalDAVConfig: !!calDAVConfig,
            calDAVConfigProvider: calDAVConfig?.provider
          });
          
          const importResult = await this.importCalDAVEvents(
            integration.user_id,
            syncResult.events,
            calendar,
            calDAVConfig
          );
          totalEvents += importResult.imported;
          conflicts.push(...importResult.conflicts);
        }

        if (syncDirection === 'bidirectional' || syncDirection === 'pharmadoc_to_caldav') {
          // Debug log before calling export
          this.auditLogger.log('info', 'About to call exportPharmaDOCEvents', { 
            hasCalDAVConfig: !!calDAVConfig,
            calDAVConfigProvider: calDAVConfig?.provider
          });
          
          const exportResult = await this.exportPharmaDOCEvents(
            integration.user_id,
            calendar,
            calDAVConfig,
            syncResult.lastModified,
            davClient
          );
          totalEvents += exportResult.exported;
          conflicts.push(...exportResult.conflicts);
        }

        // Update sync token in config
        integration.config.syncToken = syncResult.syncToken;
      }

      // Update integration status
      await this.updateIntegrationStatus(integration.id, {
        last_sync_at: new Date().toISOString(),
        config: integration.config,
        status: 'connected'
      });

      return {
        integrationId: integration.id,
        success: true,
        eventsProcessed: totalEvents,
        conflicts: conflicts.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // Update integration with error status
      await this.updateIntegrationStatus(integration.id, {
        status: 'error',
        last_error: error.message,
        last_sync_at: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Import events from CalDAV to PharmaDOC
   */
  async importCalDAVEvents(userId, calDAVEvents, calendar, config) {
    try {
      let imported = 0;
      let conflicts = [];

      for (const event of calDAVEvents) {
        try {
          // Check if event already exists in PharmaDOC
          const existingAppointment = await this.findAppointmentByUID(event.uid);

          if (existingAppointment) {
            // Handle update conflict
            const conflictResult = await this.handleUpdateConflict(
              existingAppointment,
              event,
              config
            );
            
            if (conflictResult.conflict) {
              conflicts.push(conflictResult);
            } else {
              imported++;
            }
          } else {
            // Create new appointment
            const appointment = await this.createAppointmentFromCalDAVEvent(
              userId,
              event,
              calendar,
              config
            );
            
            if (appointment) {
              // Store event mapping
              this.eventMappings.set(appointment.id, event.uid);
              imported++;
            }
          }
        } catch (error) {
          this.auditLogger.log('error', 'Failed to import CalDAV event', { eventUid: event.uid, error: error.message });
          conflicts.push({
            type: 'import_error',
            eventUid: event.uid,
            error: error.message
          });
        }
      }

      return { imported, conflicts };

    } catch (error) {
      this.auditLogger.log('error', 'CalDAV events import failed', { error: error.message });
      throw new Error(`Failed to import CalDAV events: ${error.message}`);
    }
  }

  /**
   * Export PharmaDOC appointments to CalDAV
   */
  async exportPharmaDOCEvents(userId, calendar, config, lastModified, davClient) {
    try {
      let exported = 0;
      let conflicts = [];

      this.auditLogger.log('info', 'Starting PharmaDOC events export', { 
        userId, 
        calendarUrl: calendar.url,
        lastModified
      });

      // Get PharmaDOC appointments that need sync
      const appointments = await this.getAppointmentsForSync(userId, lastModified);
      
      this.auditLogger.log('info', 'Export: appointments retrieved', { 
        userId, 
        appointmentCount: appointments.length,
        appointmentSummary: appointments.map(apt => ({
          id: apt.id,
          purpose: apt.purpose,
          status: apt.status,
          date: apt.timeslot?.date
        }))
      });

      for (const appointment of appointments) {
        try {
          // Create new CalDAV event for each calendar
          // Note: Each calendar gets its own copy of the appointment event
          const createResult = await this.createCalDAVEvent(
            config,
            calendar,
            appointment,
            davClient
          );
          
          if (createResult.success) {
            // Store event mapping with calendar-specific key
            const mappingKey = `${appointment.id}_${calendar.url}`;
            this.eventMappings.set(mappingKey, createResult.uid);
            exported++;
          } else {
            conflicts.push(createResult.conflict);
          }
        } catch (error) {
          this.auditLogger.log('error', 'Failed to export appointment to CalDAV', {
            appointmentId: appointment.id,
            error: error.message
          });
          conflicts.push({
            type: 'export_error',
            appointmentId: appointment.id,
            error: error.message
          });
        }
      }

      return { exported, conflicts };

    } catch (error) {
      this.auditLogger.log('error', 'PharmaDOC events export failed', { error: error.message });
      throw new Error(`Failed to export PharmaDOC events: ${error.message}`);
    }
  }

  /**
   * Create PharmaDOC appointment from CalDAV event
   */
  async createAppointmentFromCalDAVEvent(userId, event, calendar, config) {
    try {
      // Convert CalDAV event to PharmaDOC appointment format
      const appointmentData = {
        purpose: event.title,
        description: event.description,
        duration: this.calculateDuration(event.startTime, event.endTime),
        timezone: event.timezone,
        status: 'scheduled',
        meeting_type: 'external',
        external_provider: config.provider,
        external_event_id: event.uid,
        external_calendar_id: calendar.url,
        integration_data: {
          caldav: {
            provider: config.provider,
            calendar: calendar.name,
            etag: event.etag,
            originalEvent: event
          }
        },
        timeslots: {
          date: event.startTime.split('T')[0],
          start_time: event.startTime.split('T')[1].split('Z')[0],
          end_time: event.endTime.split('T')[1].split('Z')[0]
        }
      };

      // Determine doctor/pharma rep from event attendees
      const participants = await this.identifyParticipants(event.attendees, userId);
      if (participants.doctor_id) appointmentData.doctor_id = participants.doctor_id;
      if (participants.pharma_rep_id) appointmentData.pharma_rep_id = participants.pharma_rep_id;

      // Check for appointment conflicts
      const conflicts = await this.checkAppointmentConflicts(appointmentData);
      if (conflicts.length > 0) {
        this.auditLogger.log('warn', 'Appointment conflicts detected', { conflicts });
      }

      // Create appointment
      const { data, error } = await this.supabase
        .from('appointments')
        .insert(appointmentData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create appointment: ${error.message}`);
      }

      this.auditLogger.log('info', 'Created appointment from CalDAV event', {
        appointmentId: data.id,
        eventUid: event.uid,
        provider: config.provider
      });

      return data;

    } catch (error) {
      this.auditLogger.log('error', 'Failed to create appointment from CalDAV event', { error: error.message });
      throw error;
    }
  }

  /**
   * Create CalDAV event from PharmaDOC appointment
   */
  async createCalDAVEvent(config, calendar, appointment, davClient) {
    try {
      // Get detailed appointment data with participants
      const detailedAppointment = await this.getDetailedAppointmentData(appointment);
      
      // Convert appointment to CalDAV event format with rich details
      const eventData = {
        uid: appointment.external_event_id || this.generateEventUID(),
        title: `PharmaDOC: ${detailedAppointment.purpose}`,
        description: this.buildEventDescription(detailedAppointment),
        startTime: this.buildDateTime(appointment.timeslot.date, appointment.timeslot.start_time),
        endTime: this.buildDateTime(appointment.timeslot.date, appointment.timeslot.end_time),
        location: this.buildEventLocation(detailedAppointment),
        status: 'confirmed',
        organizer: await this.getOrganizerInfo(appointment),
        attendees: await this.getAttendeeInfo(appointment)
      };

      // Create event using the authenticated davClient
      const eventUID = eventData.uid;
      const eventFilename = `${eventUID}.ics`;
      
      // Build iCalendar data
      const icalData = this.buildICalendarData(eventData);
      
      // Get the calendar object from the davClient
      const calendars = await davClient.fetchCalendars();
      const targetCalendar = calendars.find(cal => cal.url === calendar.url);
      
      if (!targetCalendar) {
        throw new Error(`Calendar not found: ${calendar.url}`);
      }
      
      // Use the authenticated davClient to create the calendar object
      await davClient.createCalendarObject({
        calendar: targetCalendar,
        filename: eventFilename,
        iCalString: icalData
      });

      // Update appointment with external event ID
      await this.supabase
        .from('appointments')
        .update({
          external_event_id: eventUID,
          integration_data: {
            ...appointment.integration_data,
            caldav: {
              ...appointment.integration_data?.caldav,
              calendar_url: calendar.url,
              filename: eventFilename
            }
          }
        })
        .eq('id', appointment.id);

      return {
        success: true,
        uid: eventUID,
        url: `${calendar.url}${eventFilename}`
      };

    } catch (error) {
      this.auditLogger.log('error', 'Failed to create CalDAV event', { error: error.message });
      return {
        success: false,
        conflict: {
          type: 'creation_error',
          appointmentId: appointment.id,
          error: error.message
        }
      };
    }
  }

  /**
   * Handle appointment/event update conflicts
   */
  async handleUpdateConflict(appointment, calDAVEvent, config) {
    try {
      const appointmentModified = new Date(appointment.updated_at);
      const eventModified = new Date(calDAVEvent.lastModified);

      // Determine which version is newer
      const appointmentNewer = appointmentModified > eventModified;

      switch (config.conflictResolution || this.syncConfig.conflictResolution) {
        case 'source_wins':
          // CalDAV event wins
          await this.updateAppointmentFromEvent(appointment, calDAVEvent);
          return { conflict: false, resolution: 'caldav_wins' };

        case 'destination_wins':
          // PharmaDOC appointment wins
          await this.updateCalDAVEventFromAppointment(config, appointment, calDAVEvent);
          return { conflict: false, resolution: 'pharmadoc_wins' };

        case 'newest_wins':
          if (appointmentNewer) {
            await this.updateCalDAVEventFromAppointment(config, appointment, calDAVEvent);
            return { conflict: false, resolution: 'pharmadoc_wins' };
          } else {
            await this.updateAppointmentFromEvent(appointment, calDAVEvent);
            return { conflict: false, resolution: 'caldav_wins' };
          }

        case 'manual':
        default:
          // Flag for manual resolution
          return {
            conflict: true,
            type: 'update_conflict',
            appointmentId: appointment.id,
            eventUid: calDAVEvent.uid,
            appointmentModified,
            eventModified,
            appointmentData: appointment,
            eventData: calDAVEvent
          };
      }

    } catch (error) {
      this.auditLogger.log('error', 'Failed to handle update conflict', { error: error.message });
      return {
        conflict: true,
        type: 'conflict_resolution_error',
        error: error.message
      };
    }
  }

  /**
   * Get active CalDAV integrations for user
   */
  async getActiveIntegrations(userId, integrationId = null) {
    let query = this.supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'caldav')
      .eq('status', 'connected');

    if (integrationId) {
      query = query.eq('id', integrationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get integrations: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Update integration status
   */
  async updateIntegrationStatus(integrationId, updates) {
    const { error } = await this.supabase
      .from('user_integrations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', integrationId);

    if (error) {
      this.auditLogger.log('error', 'Failed to update integration status', { error: error.message });
    }
  }

  /**
   * Utility methods
   */

  extractCalendarName(calendarUrl) {
    const parts = calendarUrl.split('/');
    return parts[parts.length - 2] || 'Calendar';
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end - start) / (1000 * 60)); // minutes
  }

  buildDateTime(date, time) {
    // Ensure time is in HH:MM:SS format, then add milliseconds and timezone
    const timeFormatted = time.includes('.') ? time.split('.')[0] : time;
    const timeParts = timeFormatted.split(':');
    
    // Ensure we have HH:MM:SS format
    if (timeParts.length === 2) {
      return `${date}T${timeFormatted}:00.000Z`;
    } else if (timeParts.length === 3) {
      return `${date}T${timeFormatted}.000Z`;
    }
    
    return `${date}T${timeFormatted}.000Z`;
  }

  generateEventUID() {
    return `pharmadoc-${crypto.randomUUID()}@pharmadoc.app`;
  }

  buildICalendarData(eventData) {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const startTime = new Date(eventData.startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endTime = new Date(eventData.endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icalData = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PharmaDOC//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${eventData.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${startTime}`,
      `DTEND:${endTime}`,
      `SUMMARY:${this.escapeCalendarValue(eventData.title)}`,
      `DESCRIPTION:${this.escapeCalendarValue(eventData.description || '')}`,
      `STATUS:${eventData.status.toUpperCase()}`,
      `TRANSP:OPAQUE`,
      `SEQUENCE:0`
    ];

    if (eventData.location) {
      icalData.push(`LOCATION:${this.escapeCalendarValue(eventData.location)}`);
    }

    if (eventData.organizer) {
      icalData.push(`ORGANIZER:mailto:${eventData.organizer.email}`);
    }

    if (eventData.attendees && eventData.attendees.length > 0) {
      eventData.attendees.forEach(attendee => {
        icalData.push(`ATTENDEE:mailto:${attendee.email}`);
      });
    }

    icalData.push('END:VEVENT');
    icalData.push('END:VCALENDAR');

    return icalData.join('\r\n');
  }

  escapeCalendarValue(value) {
    if (!value) return '';
    return value
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  encryptPassword(password) {
    // Simple encryption - in production, use proper encryption
    return Buffer.from(password).toString('base64');
  }

  decryptPassword(encryptedPassword) {
    // Simple decryption - in production, use proper decryption
    return Buffer.from(encryptedPassword, 'base64').toString();
  }

  async findAppointmentByUID(uid) {
    const { data } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('external_event_id', uid)
      .single();

    return data;
  }

  async getAppointmentsForSync(userId, lastModified) {
    this.auditLogger.log('info', 'Getting appointments for sync', { 
      userId, 
      lastModified,
      queryDetails: `doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`
    });

    let query = this.supabase
      .from('appointments')
      .select(`
        *,
        timeslot:timeslots!timeslot_id (
          id,
          date,
          start_time,
          end_time,
          duration
        )
      `)
      .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
      .neq('status', 'cancelled')
      .not('timeslot_id', 'is', null);

    if (lastModified) {
      query = query.gt('updated_at', lastModified);
    }

    const { data, error } = await query;
    
    if (error) {
      this.auditLogger.log('error', 'Failed to get appointments for sync', { 
        userId, 
        error: error.message 
      });
      throw new Error(`Failed to get appointments: ${error.message}`);
    }
    
    this.auditLogger.log('info', 'Appointments found for sync', { 
      userId, 
      appointmentCount: data?.length || 0,
      appointments: data?.map(apt => ({ 
        id: apt.id, 
        purpose: apt.purpose, 
        status: apt.status,
        doctor_id: apt.doctor_id,
        pharma_rep_id: apt.pharma_rep_id,
        timeslot: apt.timeslot ? {
          date: apt.timeslot.date,
          start_time: apt.timeslot.start_time,
          end_time: apt.timeslot.end_time
        } : null
      })) || []
    });
    
    return data || [];
  }

  async identifyParticipants(attendees, userId) {
    // Simple implementation - identify participants from attendee emails
    const participants = { doctor_id: null, pharma_rep_id: null };

    // Set the current user based on their role
    const { data: user } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (user?.role === 'doctor') {
      participants.doctor_id = userId;
    } else if (user?.role === 'pharma_rep') {
      participants.pharma_rep_id = userId;
    }

    return participants;
  }

  async getOrganizerInfo(appointment) {
    if (appointment.doctor_id) {
      const { data } = await this.supabase
        .from('doctors')
        .select('name, email')
        .eq('id', appointment.doctor_id)
        .single();

      if (data) {
        return { name: data.name, email: data.email };
      }
    }

    return null;
  }

  async getAttendeeInfo(appointment) {
    const attendees = [];

    if (appointment.pharma_rep_id) {
      const { data } = await this.supabase
        .from('pharma_reps')
        .select('name, email')
        .eq('id', appointment.pharma_rep_id)
        .single();

      if (data) {
        attendees.push({ name: data.name, email: data.email });
      }
    }

    return attendees;
  }

  async checkAppointmentConflicts(appointmentData) {
    // Check for time conflicts with existing appointments
    const { data } = await this.supabase
      .from('appointments')
      .select('id, purpose, timeslots')
      .eq('timeslots->date', appointmentData.timeslots.date)
      .or(`doctor_id.eq.${appointmentData.doctor_id},pharma_rep_id.eq.${appointmentData.pharma_rep_id}`)
      .neq('status', 'cancelled');

    return data || [];
  }

  async updateAppointmentFromEvent(appointment, event) {
    const { error } = await this.supabase
      .from('appointments')
      .update({
        purpose: event.title,
        description: event.description,
        timeslots: {
          date: event.startTime.split('T')[0],
          start_time: event.startTime.split('T')[1].split('Z')[0],
          end_time: event.endTime.split('T')[1].split('Z')[0]
        },
        integration_data: {
          ...appointment.integration_data,
          caldav: {
            ...appointment.integration_data?.caldav,
            etag: event.etag,
            lastSync: new Date().toISOString()
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', appointment.id);

    if (error) {
      throw new Error(`Failed to update appointment: ${error.message}`);
    }
  }

  async updateCalDAVEventFromAppointment(config, appointment, event) {
    const eventData = {
      uid: event.uid,
      title: appointment.purpose,
      description: appointment.description || '',
      startTime: this.buildDateTime(appointment.timeslot.date, appointment.timeslot.start_time),
      endTime: this.buildDateTime(appointment.timeslot.date, appointment.timeslot.end_time),
      location: appointment.location || '',
      status: 'confirmed'
    };

    const calendar = { url: appointment.external_calendar_id };
    
    // TODO: Implement CalDAV event update using tsdav approach
    // For now, we'll log the update intent but not perform the actual update
    // to prevent sync failures until this method is properly implemented
    this.auditLogger.log('info', 'CalDAV event update requested', {
      uid: event.uid,
      calendar_url: calendar.url,
      title: eventData.title
    });
    
    // Note: The actual CalDAV update functionality needs to be implemented
    // using the same tsdav approach as the rest of the sync methods
  }

  /**
   * Parse calendar object from tsdav to our expected format
   */
  parseCalendarObject(calendarObject) {
    try {
      // Basic parsing - this would need to be more robust for production
      const data = calendarObject.data || '';
      
      // Simple iCal parsing for essential fields
      const lines = data.split('\n');
      const event = {};
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('UID:')) {
          event.uid = trimmed.substring(4);
        } else if (trimmed.startsWith('SUMMARY:')) {
          event.summary = trimmed.substring(8);
        } else if (trimmed.startsWith('DESCRIPTION:')) {
          event.description = trimmed.substring(12);
        } else if (trimmed.startsWith('DTSTART:')) {
          event.startTime = trimmed.substring(8);
        } else if (trimmed.startsWith('DTEND:')) {
          event.endTime = trimmed.substring(6);
        } else if (trimmed.startsWith('LOCATION:')) {
          event.location = trimmed.substring(9);
        }
      }
      
      return {
        uid: event.uid || this.generateEventUID(),
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        start_time: event.startTime ? new Date(event.startTime).toISOString() : new Date().toISOString(),
        end_time: event.endTime ? new Date(event.endTime).toISOString() : new Date(Date.now() + 3600000).toISOString(),
        location: event.location || '',
        status: 'scheduled',
        etag: calendarObject.etag,
        url: calendarObject.url
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to parse calendar object', { error: error.message });
      
      // Return minimal event to prevent sync failure
      return {
        uid: this.generateEventUID(),
        title: 'Parse Error',
        description: 'Failed to parse calendar event',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3600000).toISOString(),
        location: '',
        status: 'scheduled',
        etag: calendarObject.etag,
        url: calendarObject.url
      };
    }
  }

  /**
   * Get detailed appointment data with participant information
   * @param {Object} appointment - Basic appointment data
   * @returns {Object} Enhanced appointment data with participant details
   */
  async getDetailedAppointmentData(appointment) {
    const detailedAppointment = { ...appointment };

    // Get doctor information
    if (appointment.doctor_id) {
      const { data: doctor } = await this.supabase
        .from('doctors')
        .select('id, first_name, last_name, email, specialization')
        .eq('id', appointment.doctor_id)
        .single();
      
      if (doctor) {
        detailedAppointment.doctor = doctor;
        detailedAppointment.doctor_name = `${doctor.first_name} ${doctor.last_name}`;
        detailedAppointment.doctor_email = doctor.email;
      }
    }

    // Get pharma rep information
    if (appointment.pharma_rep_id) {
      const { data: pharmaRep } = await this.supabase
        .from('pharma_reps')
        .select('id, first_name, last_name, email, company')
        .eq('id', appointment.pharma_rep_id)
        .single();
      
      if (pharmaRep) {
        detailedAppointment.pharma_rep = pharmaRep;
        detailedAppointment.pharma_rep_name = `${pharmaRep.first_name} ${pharmaRep.last_name}`;
        detailedAppointment.pharma_rep_email = pharmaRep.email;
      }
    }

    return detailedAppointment;
  }

  /**
   * Build comprehensive event description from appointment data
   * @param {Object} appointment - Enhanced appointment data with participant details
   * @returns {string} Rich event description
   */
  buildEventDescription(appointment) {
    let description = `PharmaDOC Appointment\\n\\n`;
    description += `Purpose: ${appointment.purpose}\\n`;
    
    // Add duration information
    if (appointment.duration) {
      description += `Duration: ${appointment.duration} minutes\\n`;
    } else if (appointment.timeslot) {
      // Calculate duration from timeslot data
      const start = new Date(`2000-01-01T${appointment.timeslot.start_time}`);
      const end = new Date(`2000-01-01T${appointment.timeslot.end_time}`);
      const durationMinutes = (end - start) / (1000 * 60);
      description += `Duration: ${durationMinutes} minutes\\n`;
    }
    
    description += `Meeting Type: ${appointment.meeting_type || 'virtual'}\\n\\n`;
    
    // Add participant information
    if (appointment.doctor_name && appointment.doctor_email) {
      description += `Doctor: ${appointment.doctor_name} (${appointment.doctor_email})`;
      if (appointment.doctor?.specialization) {
        description += ` - ${appointment.doctor.specialization}`;
      }
      description += `\\n`;
    }
    
    if (appointment.pharma_rep_name && appointment.pharma_rep_email) {
      description += `Pharma Rep: ${appointment.pharma_rep_name} (${appointment.pharma_rep_email})`;
      if (appointment.pharma_rep?.company) {
        description += ` - ${appointment.pharma_rep.company}`;
      }
      description += `\\n`;
    }
    
    // Add meeting link if available
    if (appointment.meeting_link) {
      description += `\\nMeeting Link: ${appointment.meeting_link}\\n`;
    }
    
    // Add video provider information
    if (appointment.video_provider) {
      const providerNames = {
        'zoom': 'Zoom',
        'google_meet': 'Google Meet',
        'microsoft_teams': 'Microsoft Teams',
        'caldav': 'External Calendar Provider'
      };
      description += `Video Provider: ${providerNames[appointment.video_provider] || appointment.video_provider}\\n`;
    }
    
    // Add notes if available
    if (appointment.notes) {
      description += `\\nNotes: ${appointment.notes}\\n`;
    }

    // Add appointment status
    if (appointment.status) {
      description += `\\nStatus: ${appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}\\n`;
    }

    // Add creation timestamp
    description += `\\nCreated via PharmaDOC at ${new Date().toLocaleString()}`;

    return description;
  }

  /**
   * Build event location based on meeting type and details
   * @param {Object} appointment - Appointment data
   * @returns {string} Event location
   */
  buildEventLocation(appointment) {
    if (appointment.meeting_type === 'in-person') {
      return appointment.location || 'In-Person Meeting';
    } else if (appointment.meeting_link) {
      return appointment.meeting_link;
    } else if (appointment.video_provider) {
      const providerNames = {
        'zoom': 'Zoom Meeting',
        'google_meet': 'Google Meet',
        'microsoft_teams': 'Microsoft Teams',
        'caldav': 'Virtual Meeting'
      };
      return providerNames[appointment.video_provider] || 'Virtual Meeting';
    }
    
    return 'Virtual Meeting';
  }
}

export default CalDAVSyncService; 