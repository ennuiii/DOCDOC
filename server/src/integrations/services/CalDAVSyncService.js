/**
 * CalDAV Synchronization Service
 * Handles bidirectional sync between PharmaDOC and CalDAV providers
 */

const { CalDAVClient } = require('../providers/caldav/CalDAVClient');
const { TimezoneService } = require('./TimezoneService');
const { ConflictResolutionService } = require('./ConflictResolutionService');
const { BufferTimeService } = require('./BufferTimeService');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../../../utils/logger');
const crypto = require('crypto');

class CalDAVSyncService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    this.calDAVClient = new CalDAVClient();
    this.timezoneService = new TimezoneService();
    this.conflictResolutionService = new ConflictResolutionService();
    this.bufferTimeService = new BufferTimeService();
    
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
      logger.info('Setting up CalDAV integration', { userId, provider: calDAVConfig.provider });

      // Detect and configure provider
      const providerConfig = await this.calDAVClient.detectProvider(
        calDAVConfig.serverUrl,
        calDAVConfig.username
      );

      // Test authentication
      const authSuccess = await this.calDAVClient.authenticate(
        providerConfig,
        calDAVConfig.password
      );

      if (!authSuccess) {
        throw new Error('CalDAV authentication failed');
      }

      // Discover available calendars
      const calendars = await this.calDAVClient.discoverCalendars(providerConfig);

      // Store integration configuration
      const integrationData = {
        user_id: userId,
        provider: 'caldav',
        provider_type: providerConfig.provider,
        config: {
          ...providerConfig,
          password: this.encryptPassword(calDAVConfig.password),
          selectedCalendars: calendars.map(cal => cal.url),
          syncDirection: calDAVConfig.syncDirection || 'bidirectional',
          autoSync: calDAVConfig.autoSync || true,
          syncInterval: calDAVConfig.syncInterval || this.syncConfig.syncInterval
        },
        status: 'active',
        last_sync: null,
        sync_token: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('calendar_integrations')
        .insert(integrationData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store integration: ${error.message}`);
      }

      logger.info('CalDAV integration setup complete', {
        userId,
        provider: providerConfig.provider,
        calendars: calendars.length
      });

      return {
        integrationId: data.id,
        provider: providerConfig.provider,
        calendars,
        status: 'active'
      };

    } catch (error) {
      logger.error('CalDAV integration setup failed', error);
      throw new Error(`Failed to setup CalDAV integration: ${error.message}`);
    }
  }

  /**
   * Perform bidirectional sync for a user
   */
  async performSync(userId, integrationId = null) {
    try {
      logger.info('Starting CalDAV sync', { userId, integrationId });

      // Get active CalDAV integrations
      const integrations = await this.getActiveIntegrations(userId, integrationId);

      const syncResults = [];

      for (const integration of integrations) {
        try {
          const result = await this.syncIntegration(integration);
          syncResults.push(result);
        } catch (error) {
          logger.error('Integration sync failed', error);
          syncResults.push({
            integrationId: integration.id,
            success: false,
            error: error.message
          });
        }
      }

      logger.info('CalDAV sync completed', {
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
      logger.error('CalDAV sync failed', error);
      throw new Error(`Sync failed: ${error.message}`);
    }
  }

  /**
   * Sync a single integration
   */
  async syncIntegration(integration) {
    try {
      const config = integration.config;
      const decryptedPassword = this.decryptPassword(config.password);
      
      // Authenticate with CalDAV server
      const authSuccess = await this.calDAVClient.authenticate(config, decryptedPassword);
      if (!authSuccess) {
        throw new Error('Authentication failed');
      }

      let totalEvents = 0;
      let conflicts = [];

      // Sync each selected calendar
      for (const calendarUrl of config.selectedCalendars) {
        const calendar = { url: calendarUrl, name: this.extractCalendarName(calendarUrl) };
        
        // Get calendar events from CalDAV
        const syncResult = await this.calDAVClient.syncCalendarEvents(
          config,
          calendar,
          integration.sync_token
        );

        // Process events based on sync direction
        if (config.syncDirection === 'bidirectional' || config.syncDirection === 'caldav_to_pharmadoc') {
          const importResult = await this.importCalDAVEvents(
            integration.user_id,
            syncResult.events,
            calendar,
            config
          );
          totalEvents += importResult.imported;
          conflicts.push(...importResult.conflicts);
        }

        if (config.syncDirection === 'bidirectional' || config.syncDirection === 'pharmadoc_to_caldav') {
          const exportResult = await this.exportPharmaDOCEvents(
            integration.user_id,
            calendar,
            config,
            syncResult.lastModified
          );
          totalEvents += exportResult.exported;
          conflicts.push(...exportResult.conflicts);
        }

        // Update sync token
        integration.sync_token = syncResult.syncToken;
      }

      // Update integration status
      await this.updateIntegrationStatus(integration.id, {
        last_sync: new Date().toISOString(),
        sync_token: integration.sync_token,
        status: 'active'
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
        last_sync_attempt: new Date().toISOString()
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
          logger.error('Failed to import CalDAV event', { eventUid: event.uid, error });
          conflicts.push({
            type: 'import_error',
            eventUid: event.uid,
            error: error.message
          });
        }
      }

      return { imported, conflicts };

    } catch (error) {
      logger.error('CalDAV events import failed', error);
      throw new Error(`Failed to import CalDAV events: ${error.message}`);
    }
  }

  /**
   * Export PharmaDOC appointments to CalDAV
   */
  async exportPharmaDOCEvents(userId, calendar, config, lastModified) {
    try {
      let exported = 0;
      let conflicts = [];

      // Get PharmaDOC appointments that need sync
      const appointments = await this.getAppointmentsForSync(userId, lastModified);

      for (const appointment of appointments) {
        try {
          // Check if appointment has corresponding CalDAV event
          const existingEventUid = this.eventMappings.get(appointment.id);

          if (existingEventUid) {
            // Update existing CalDAV event
            const updateResult = await this.updateCalDAVEvent(
              config,
              calendar,
              existingEventUid,
              appointment
            );
            
            if (updateResult.success) {
              exported++;
            } else {
              conflicts.push(updateResult.conflict);
            }
          } else {
            // Create new CalDAV event
            const createResult = await this.createCalDAVEvent(
              config,
              calendar,
              appointment
            );
            
            if (createResult.success) {
              // Store event mapping
              this.eventMappings.set(appointment.id, createResult.uid);
              exported++;
            } else {
              conflicts.push(createResult.conflict);
            }
          }
        } catch (error) {
          logger.error('Failed to export appointment to CalDAV', {
            appointmentId: appointment.id,
            error
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
      logger.error('PharmaDOC events export failed', error);
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
        logger.warn('Appointment conflicts detected', { conflicts });
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

      logger.info('Created appointment from CalDAV event', {
        appointmentId: data.id,
        eventUid: event.uid,
        provider: config.provider
      });

      return data;

    } catch (error) {
      logger.error('Failed to create appointment from CalDAV event', error);
      throw error;
    }
  }

  /**
   * Create CalDAV event from PharmaDOC appointment
   */
  async createCalDAVEvent(config, calendar, appointment) {
    try {
      // Convert appointment to CalDAV event format
      const eventData = {
        uid: appointment.external_event_id || this.generateEventUID(),
        title: appointment.purpose,
        description: appointment.description || '',
        startTime: this.buildDateTime(appointment.timeslots.date, appointment.timeslots.start_time),
        endTime: this.buildDateTime(appointment.timeslots.date, appointment.timeslots.end_time),
        location: appointment.location || '',
        status: 'confirmed',
        organizer: await this.getOrganizerInfo(appointment),
        attendees: await this.getAttendeeInfo(appointment)
      };

      // Create event in CalDAV calendar
      const result = await this.calDAVClient.createEvent(config, calendar, eventData);

      // Update appointment with external event ID
      await this.supabase
        .from('appointments')
        .update({
          external_event_id: result.uid,
          integration_data: {
            ...appointment.integration_data,
            caldav: {
              ...appointment.integration_data?.caldav,
              etag: result.etag,
              url: result.url
            }
          }
        })
        .eq('id', appointment.id);

      return {
        success: true,
        uid: result.uid,
        url: result.url
      };

    } catch (error) {
      logger.error('Failed to create CalDAV event', error);
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
      logger.error('Failed to handle update conflict', error);
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
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'caldav')
      .eq('status', 'active');

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
      .from('calendar_integrations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', integrationId);

    if (error) {
      logger.error('Failed to update integration status', error);
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
    return `${date}T${time}:00.000Z`;
  }

  generateEventUID() {
    return `pharmadoc-${crypto.randomUUID()}@pharmadoc.app`;
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
    let query = this.supabase
      .from('appointments')
      .select('*')
      .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
      .neq('status', 'cancelled');

    if (lastModified) {
      query = query.gt('updated_at', lastModified);
    }

    const { data } = await query;
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
      startTime: this.buildDateTime(appointment.timeslots.date, appointment.timeslots.start_time),
      endTime: this.buildDateTime(appointment.timeslots.date, appointment.timeslots.end_time),
      location: appointment.location || '',
      status: 'confirmed'
    };

    const calendar = { url: appointment.external_calendar_id };
    await this.calDAVClient.updateEvent(config, calendar, event.uid, eventData, event.etag);
  }
}

module.exports = { CalDAVSyncService }; 