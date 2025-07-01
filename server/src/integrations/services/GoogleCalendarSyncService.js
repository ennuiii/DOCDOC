/**
 * Google Calendar Synchronization Service
 * Handles two-way sync between PharmaDOC appointments and Google Calendar events
 * Enhanced with Google Meet integration
 */

import { createClient } from '@supabase/supabase-js';
import GoogleOAuthProvider from '../providers/google/GoogleOAuthProvider.js';
import GoogleMeetService from './GoogleMeetService.js';
import AuditLogger from './AuditLogger.js';

class GoogleCalendarSyncService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.googleProvider = new GoogleOAuthProvider();
        this.googleMeetService = new GoogleMeetService();
        this.auditLogger = new AuditLogger();
    }

    /**
     * Perform full synchronization for a user's Google Calendar integration
     * @param {string} userId - PharmaDOC user ID
     * @param {string} integrationId - Google integration ID
     * @param {Object} options - Sync options
     */
    async performFullSync(userId, integrationId, options = {}) {
        const startTime = Date.now();
        
        try {
            this.auditLogger.log('info', 'GOOGLE_SYNC_START', {
                userId,
                integrationId,
                syncType: 'full',
                options
            });

            // Get integration details and tokens
            const integration = await this.getIntegration(integrationId);
            if (!integration || integration.user_id !== userId) {
                throw new Error('Integration not found or access denied');
            }

            // Ensure tokens are valid
            const tokens = await this.ensureValidTokens(integration);

            // Get sync timeframe (default: 30 days past, 90 days future)
            const timeframe = this.getSyncTimeframe(options);

            // Perform bidirectional sync
            const results = await Promise.all([
                this.syncPharmaDOCToGoogle(userId, integrationId, tokens, timeframe),
                this.syncGoogleToPharmaDOC(userId, integrationId, tokens, timeframe)
            ]);

            const [pharmaToGoogleResult, googleToPharmaResult] = results;

            // Update integration sync status
            await this.updateIntegrationSyncStatus(integrationId, 'synced', null);

            const duration = Date.now() - startTime;
            
            this.auditLogger.log('info', 'GOOGLE_SYNC_COMPLETE', {
                userId,
                integrationId,
                duration,
                pharmaToGoogle: pharmaToGoogleResult,
                googleToPharma: googleToPharmaResult
            });

            return {
                success: true,
                duration,
                results: {
                    pharmaToGoogle: pharmaToGoogleResult,
                    googleToPharma: googleToPharmaResult
                }
            };

        } catch (error) {
            await this.updateIntegrationSyncStatus(integrationId, 'failed', error.message);
            
            this.auditLogger.log('error', 'GOOGLE_SYNC_ERROR', {
                userId,
                integrationId,
                error: error.message,
                duration: Date.now() - startTime
            });

            throw error;
        }
    }

    /**
     * Perform incremental synchronization (only changes since last sync)
     * @param {string} userId - PharmaDOC user ID
     * @param {string} integrationId - Google integration ID
     * @param {Object} options - Sync options
     */
    async performIncrementalSync(userId, integrationId, options = {}) {
        const startTime = Date.now();
        
        try {
            this.auditLogger.log('info', 'GOOGLE_INCREMENTAL_SYNC_START', {
                userId,
                integrationId,
                options
            });

            const integration = await this.getIntegration(integrationId);
            if (!integration || integration.user_id !== userId) {
                throw new Error('Integration not found or access denied');
            }

            const tokens = await this.ensureValidTokens(integration);
            const lastSyncTime = integration.last_sync_at || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: 24 hours ago

            // Get changes since last sync
            const results = await Promise.all([
                this.syncRecentPharmaDOCChanges(userId, integrationId, tokens, lastSyncTime),
                this.syncRecentGoogleChanges(userId, integrationId, tokens, lastSyncTime)
            ]);

            const [pharmaChanges, googleChanges] = results;

            await this.updateIntegrationSyncStatus(integrationId, 'synced', null);

            const duration = Date.now() - startTime;
            
            this.auditLogger.log('info', 'GOOGLE_INCREMENTAL_SYNC_COMPLETE', {
                userId,
                integrationId,
                duration,
                pharmaChanges,
                googleChanges
            });

            return {
                success: true,
                duration,
                results: {
                    pharmaChanges,
                    googleChanges
                }
            };

        } catch (error) {
            await this.updateIntegrationSyncStatus(integrationId, 'failed', error.message);
            
            this.auditLogger.log('error', 'GOOGLE_INCREMENTAL_SYNC_ERROR', {
                userId,
                integrationId,
                error: error.message,
                duration: Date.now() - startTime
            });

            throw error;
        }
    }

    /**
     * Sync PharmaDOC appointments to Google Calendar
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} tokens - OAuth tokens
     * @param {Object} timeframe - Sync timeframe
     */
    async syncPharmaDOCToGoogle(userId, integrationId, tokens, timeframe) {
        try {
            // Get PharmaDOC appointments in timeframe
            const appointments = await this.getPharmaDOCAppointments(userId, timeframe);
            
            const results = {
                processed: 0,
                created: 0,
                updated: 0,
                deleted: 0,
                errors: []
            };

            for (const appointment of appointments) {
                try {
                    results.processed++;
                    
                    // Check if appointment already has a Google Calendar event
                    const existingEvent = await this.getCalendarEventByAppointment(
                        integrationId, 
                        appointment.id
                    );

                    if (appointment.status === 'cancelled') {
                        // Delete from Google Calendar if it exists
                        if (existingEvent) {
                            await this.deleteGoogleCalendarEvent(tokens, existingEvent);
                            await this.deleteCalendarEventRecord(existingEvent.id);
                            results.deleted++;
                        }
                    } else if (existingEvent) {
                        // Update existing Google Calendar event
                        const updatedEvent = await this.updateGoogleCalendarEvent(
                            tokens, 
                            existingEvent, 
                            appointment
                        );
                        await this.updateCalendarEventRecord(existingEvent.id, updatedEvent);
                        results.updated++;
                    } else {
                        // Create new Google Calendar event
                        const newEvent = await this.createGoogleCalendarEvent(
                            tokens, 
                            appointment, 
                            integrationId
                        );
                        await this.createCalendarEventRecord(newEvent, appointment.id, integrationId);
                        results.created++;
                    }

                    // Update appointment sync status
                    await this.updateAppointmentSyncStatus(appointment.id, 'synced');

                } catch (error) {
                    results.errors.push({
                        appointmentId: appointment.id,
                        error: error.message
                    });
                    
                    await this.updateAppointmentSyncStatus(appointment.id, 'failed', error.message);
                }
            }

            return results;

        } catch (error) {
            this.auditLogger.log('error', 'PHARMA_TO_GOOGLE_SYNC_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Sync Google Calendar events to PharmaDOC appointments
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} tokens - OAuth tokens
     * @param {Object} timeframe - Sync timeframe
     */
    async syncGoogleToPharmaDOC(userId, integrationId, tokens, timeframe) {
        try {
            // Get Google Calendar events in timeframe
            const calendarEvents = await this.getGoogleCalendarEvents(tokens, timeframe);
            
            const results = {
                processed: 0,
                imported: 0,
                conflicts: 0,
                skipped: 0,
                errors: []
            };

            for (const event of calendarEvents) {
                try {
                    results.processed++;
                    
                    // Skip if this is a PharmaDOC-created event
                    if (this.isPharmaDOCCreatedEvent(event)) {
                        results.skipped++;
                        continue;
                    }

                    // Check for conflicts with existing PharmaDOC appointments
                    const conflicts = await this.checkForConflicts(userId, event);
                    
                    if (conflicts.length > 0) {
                        results.conflicts++;
                        
                        // Store conflict information for resolution
                        await this.storeConflictInfo(integrationId, event, conflicts);
                        
                        this.auditLogger.log('warn', 'GOOGLE_CALENDAR_CONFLICT', {
                            userId,
                            integrationId,
                            eventId: event.id,
                            conflicts: conflicts.length
                        });
                        
                        continue;
                    }

                    // Create calendar event record for tracking
                    await this.createCalendarEventRecord(event, null, integrationId);
                    results.imported++;

                } catch (error) {
                    results.errors.push({
                        eventId: event.id,
                        error: error.message
                    });
                }
            }

            return results;

        } catch (error) {
            this.auditLogger.log('error', 'GOOGLE_TO_PHARMA_SYNC_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Sync recent PharmaDOC changes to Google
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} tokens - OAuth tokens
     * @param {Date} lastSyncTime - Last sync timestamp
     */
    async syncRecentPharmaDOCChanges(userId, integrationId, tokens, lastSyncTime) {
        const { data: appointments } = await this.supabase
            .from('appointments')
            .select(`
                *,
                timeslots (
                    date,
                    start_time,
                    end_time,
                    doctor_id
                ),
                doctor:users!doctor_id (
                    id,
                    name,
                    email
                ),
                pharma_rep:users!pharma_rep_id (
                    id,
                    name,
                    email
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .gte('updated_at', lastSyncTime.toISOString())
            .order('updated_at', { ascending: false });

        const results = { updated: 0, created: 0, deleted: 0, errors: [] };

        for (const appointment of appointments || []) {
            try {
                const existingEvent = await this.getCalendarEventByAppointment(
                    integrationId, 
                    appointment.id
                );

                if (appointment.status === 'cancelled' && existingEvent) {
                    await this.deleteGoogleCalendarEvent(tokens, existingEvent);
                    await this.deleteCalendarEventRecord(existingEvent.id);
                    results.deleted++;
                } else if (existingEvent) {
                    const updatedEvent = await this.updateGoogleCalendarEvent(
                        tokens, 
                        existingEvent, 
                        appointment
                    );
                    await this.updateCalendarEventRecord(existingEvent.id, updatedEvent);
                    results.updated++;
                } else if (appointment.status !== 'cancelled') {
                    const newEvent = await this.createGoogleCalendarEvent(
                        tokens, 
                        appointment, 
                        integrationId
                    );
                    await this.createCalendarEventRecord(newEvent, appointment.id, integrationId);
                    results.created++;
                }
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
     * Sync recent Google Calendar changes to PharmaDOC
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} tokens - OAuth tokens
     * @param {Date} lastSyncTime - Last sync timestamp
     */
    async syncRecentGoogleChanges(userId, integrationId, tokens, lastSyncTime) {
        // Use Google Calendar sync token for efficient incremental sync
        const integration = await this.getIntegration(integrationId);
        const syncToken = integration.config?.syncToken;

        const events = await this.googleProvider.getEvents(tokens.access_token, {
            updatedMin: lastSyncTime.toISOString(),
            syncToken: syncToken,
            showDeleted: true
        });

        const results = { processed: 0, updated: 0, deleted: 0, conflicts: 0 };

        for (const event of events) {
            results.processed++;
            
            if (event.status === 'cancelled') {
                // Handle deleted Google Calendar events
                await this.handleDeletedGoogleEvent(integrationId, event);
                results.deleted++;
            } else {
                // Handle updated Google Calendar events
                const conflicts = await this.checkForConflicts(userId, event);
                
                if (conflicts.length > 0) {
                    await this.storeConflictInfo(integrationId, event, conflicts);
                    results.conflicts++;
                } else {
                    await this.updateOrCreateCalendarEventRecord(event, integrationId);
                    results.updated++;
                }
            }
        }

        // Store new sync token for next incremental sync
        if (events.nextSyncToken) {
            await this.updateIntegrationConfig(integrationId, {
                syncToken: events.nextSyncToken
            });
        }

        return results;
    }

    /**
     * Convert PharmaDOC appointment to Google Calendar event format
     * @param {Object} appointment - PharmaDOC appointment
     * @returns {Object} Google Calendar event data
     */
    appointmentToGoogleEvent(appointment) {
        const { timeslots: timeslot, doctor, pharma_rep } = appointment;
        
        // Construct event start and end times
        const eventDate = timeslot.date;
        const startTime = new Date(`${eventDate}T${timeslot.start_time}`);
        const endTime = new Date(startTime.getTime() + (appointment.duration * 60000)); // duration in minutes

        const eventData = {
            summary: `PharmaDOC: ${appointment.purpose}`,
            description: this.buildEventDescription(appointment, doctor, pharma_rep),
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'UTC' // Will be handled by timezone service
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'UTC'
            },
            attendees: [
                {
                    email: doctor.email,
                    displayName: doctor.name,
                    responseStatus: 'accepted'
                },
                {
                    email: pharma_rep.email,
                    displayName: pharma_rep.name,
                    responseStatus: 'accepted'
                }
            ],
            location: appointment.meeting_type === 'in-person' ? 'In-Person Meeting' : appointment.meeting_link,
            extendedProperties: {
                private: {
                    pharmaDocAppointmentId: appointment.id,
                    pharmaDocSource: 'true',
                    meetingType: appointment.meeting_type
                }
            }
        };

        // Add video conferencing if applicable
        if (appointment.meeting_type === 'virtual' && appointment.video_provider === 'google_meet') {
            eventData.conferenceData = {
                createRequest: {
                    requestId: `pharmadoc-${appointment.id}-${Date.now()}`,
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    }
                }
            };
        }

        return eventData;
    }

    /**
     * Build event description from appointment data
     * @param {Object} appointment - Appointment data
     * @param {Object} doctor - Doctor data
     * @param {Object} pharma_rep - Pharma rep data
     * @returns {string} Event description
     */
    buildEventDescription(appointment, doctor, pharma_rep) {
        let description = `PharmaDOC Appointment\n\n`;
        description += `Purpose: ${appointment.purpose}\n`;
        description += `Duration: ${appointment.duration} minutes\n`;
        description += `Meeting Type: ${appointment.meeting_type}\n\n`;
        description += `Doctor: ${doctor.name} (${doctor.email})\n`;
        description += `Pharma Rep: ${pharma_rep.name} (${pharma_rep.email})\n`;
        
        if (appointment.notes) {
            description += `\nNotes: ${appointment.notes}`;
        }
        
        if (appointment.meeting_link) {
            description += `\nMeeting Link: ${appointment.meeting_link}`;
        }

        return description;
    }

    /**
     * Check if a Google Calendar event was created by PharmaDOC
     * @param {Object} event - Google Calendar event
     * @returns {boolean} True if created by PharmaDOC
     */
    isPharmaDOCCreatedEvent(event) {
        return event.extendedProperties?.private?.pharmaDocSource === 'true';
    }

    /**
     * Get sync timeframe based on options
     * @param {Object} options - Sync options
     * @returns {Object} Timeframe with start and end dates
     */
    getSyncTimeframe(options) {
        const now = new Date();
        
        return {
            start: options.startDate || new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)), // 30 days ago
            end: options.endDate || new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)) // 90 days future
        };
    }

    // ========================================
    // DATABASE HELPER METHODS
    // ========================================

    /**
     * Get integration details
     */
    async getIntegration(integrationId) {
        const { data, error } = await this.supabase
            .from('user_integrations')
            .select('*')
            .eq('id', integrationId)
            .eq('provider', 'google')
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Ensure tokens are valid and refresh if necessary
     */
    async ensureValidTokens(integration) {
        const now = new Date();
        const expiresAt = new Date(integration.token_expires_at);

        if (expiresAt <= now) {
            // Token is expired, refresh it
            const newTokens = await this.googleProvider.refreshToken(integration.refresh_token);
            
            // Update integration with new tokens
            await this.supabase
                .from('user_integrations')
                .update({
                    access_token: newTokens.access_token,
                    refresh_token: newTokens.refresh_token,
                    token_expires_at: newTokens.expires_at,
                    updated_at: new Date().toISOString()
                })
                .eq('id', integration.id);

            return newTokens;
        }

        return {
            access_token: integration.access_token,
            refresh_token: integration.refresh_token,
            expires_at: integration.token_expires_at
        };
    }

    /**
     * Get PharmaDOC appointments in timeframe
     */
    async getPharmaDOCAppointments(userId, timeframe) {
        const { data, error } = await this.supabase
            .from('appointments')
            .select(`
                *,
                timeslots (
                    date,
                    start_time,
                    end_time,
                    doctor_id
                ),
                doctor:users!doctor_id (
                    id,
                    name,
                    email
                ),
                pharma_rep:users!pharma_rep_id (
                    id,
                    name,
                    email
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .gte('timeslots.date', timeframe.start.toISOString().split('T')[0])
            .lte('timeslots.date', timeframe.end.toISOString().split('T')[0])
            .order('timeslots.date', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get Google Calendar events in timeframe
     */
    async getGoogleCalendarEvents(tokens, timeframe) {
        return await this.googleProvider.getEvents(tokens.access_token, {
            timeMin: timeframe.start.toISOString(),
            timeMax: timeframe.end.toISOString(),
            maxResults: 2500
        });
    }

    /**
     * Get calendar event by appointment ID
     */
    async getCalendarEventByAppointment(integrationId, appointmentId) {
        const { data, error } = await this.supabase
            .from('calendar_events')
            .select('*')
            .eq('integration_id', integrationId)
            .eq('appointment_id', appointmentId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
        return data;
    }

    /**
     * Create Google Calendar event with enhanced Google Meet integration
     */
    async createGoogleCalendarEvent(tokens, appointment, integrationId) {
        try {
            // Prepare event data
            const eventData = this.appointmentToGoogleEvent(appointment);
            
            // Create the calendar event with Google Meet integration if needed
            let googleEvent;
            if (appointment.video_provider === 'google_meet') {
                // Use GoogleMeetService for enhanced Google Meet integration
                googleEvent = await this.googleMeetService.createMeetingWithCalendarEvent(
                    tokens.access_token,
                    eventData,
                    {
                        conferenceRequestId: `pharmadoc-${appointment.id}-${Date.now()}`,
                        enableRecording: appointment.integration_data?.google_meet?.enable_recording || false,
                        allowExternalGuests: appointment.integration_data?.google_meet?.allow_external_guests !== false
                    }
                );

                // Update appointment with Google Meet link if created successfully
                if (googleEvent.hangoutLink) {
                    await this.updateAppointmentMeetingLink(appointment.id, googleEvent.hangoutLink);
                    
                    this.auditLogger.log('info', 'GOOGLE_MEET_CREATED', {
                        appointmentId: appointment.id,
                        integrationId,
                        meetingUrl: googleEvent.hangoutLink,
                        eventId: googleEvent.id
                    });
                }
            } else {
                // Create regular calendar event without Google Meet
                googleEvent = await this.googleProvider.createEvent(tokens.access_token, eventData);
            }

            return googleEvent;

        } catch (error) {
            this.auditLogger.log('error', 'GOOGLE_CALENDAR_EVENT_CREATE_ERROR', {
                appointmentId: appointment.id,
                integrationId,
                error: error.message,
                videoProvider: appointment.video_provider
            });
            throw error;
        }
    }

    /**
     * Update Google Calendar event with enhanced Google Meet integration
     */
    async updateGoogleCalendarEvent(tokens, existingEvent, appointment) {
        try {
            const eventData = this.appointmentToGoogleEvent(appointment);
            
            let googleEvent;
            if (appointment.video_provider === 'google_meet') {
                // Use GoogleMeetService for enhanced Google Meet integration
                googleEvent = await this.googleMeetService.updateMeetingWithCalendarEvent(
                    tokens.access_token,
                    existingEvent.external_event_id,
                    eventData,
                    {
                        calendarId: existingEvent.external_calendar_id || 'primary',
                        conferenceRequestId: `pharmadoc-${appointment.id}-${Date.now()}`,
                        enableRecording: appointment.integration_data?.google_meet?.enable_recording || false,
                        allowExternalGuests: appointment.integration_data?.google_meet?.allow_external_guests !== false
                    }
                );

                // Update appointment with Google Meet link if updated successfully
                if (googleEvent.hangoutLink) {
                    await this.updateAppointmentMeetingLink(appointment.id, googleEvent.hangoutLink);
                    
                    this.auditLogger.log('info', 'GOOGLE_MEET_UPDATED', {
                        appointmentId: appointment.id,
                        meetingUrl: googleEvent.hangoutLink,
                        eventId: googleEvent.id
                    });
                }
            } else {
                // Update regular calendar event without Google Meet
                googleEvent = await this.googleProvider.updateEvent(
                    tokens.access_token,
                    existingEvent.external_event_id,
                    eventData,
                    {
                        calendarId: existingEvent.external_calendar_id || 'primary'
                    }
                );
            }

            return googleEvent;

        } catch (error) {
            this.auditLogger.log('error', 'GOOGLE_CALENDAR_EVENT_UPDATE_ERROR', {
                appointmentId: appointment.id,
                eventId: existingEvent.external_event_id,
                error: error.message,
                videoProvider: appointment.video_provider
            });
            throw error;
        }
    }

    /**
     * Delete Google Calendar event
     */
    async deleteGoogleCalendarEvent(tokens, calendarEvent) {
        return await this.googleProvider.deleteEvent(
            tokens.access_token,
            calendarEvent.external_event_id,
            {
                calendarId: calendarEvent.external_calendar_id || 'primary'
            }
        );
    }

    /**
     * Create calendar event record in database
     */
    async createCalendarEventRecord(googleEvent, appointmentId, integrationId) {
        const eventRecord = {
            integration_id: integrationId,
            appointment_id: appointmentId,
            external_event_id: googleEvent.id,
            external_calendar_id: googleEvent.organizer?.email || 'primary',
            title: googleEvent.summary,
            description: googleEvent.description,
            start_time: googleEvent.start.dateTime || googleEvent.start.date,
            end_time: googleEvent.end.dateTime || googleEvent.end.date,
            timezone: googleEvent.start.timeZone || 'UTC',
            location: googleEvent.location,
            meeting_url: googleEvent.hangoutLink,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            etag: googleEvent.etag,
            attendees: googleEvent.attendees || [],
            is_all_day: !googleEvent.start.dateTime
        };

        const { data, error } = await this.supabase
            .from('calendar_events')
            .insert(eventRecord)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Update calendar event record
     */
    async updateCalendarEventRecord(eventId, googleEvent) {
        const { error } = await this.supabase
            .from('calendar_events')
            .update({
                title: googleEvent.summary,
                description: googleEvent.description,
                start_time: googleEvent.start.dateTime || googleEvent.start.date,
                end_time: googleEvent.end.dateTime || googleEvent.end.date,
                timezone: googleEvent.start.timeZone || 'UTC',
                location: googleEvent.location,
                meeting_url: googleEvent.hangoutLink,
                sync_status: 'synced',
                last_synced_at: new Date().toISOString(),
                etag: googleEvent.etag,
                attendees: googleEvent.attendees || [],
                updated_at: new Date().toISOString()
            })
            .eq('id', eventId);

        if (error) throw error;
    }

    /**
     * Delete calendar event record
     */
    async deleteCalendarEventRecord(eventId) {
        const { error } = await this.supabase
            .from('calendar_events')
            .delete()
            .eq('id', eventId);

        if (error) throw error;
    }

    /**
     * Update appointment sync status
     */
    async updateAppointmentSyncStatus(appointmentId, status, error = null) {
        const updateData = {
            calendar_sync_status: status,
            updated_at: new Date().toISOString()
        };

        if (error) {
            updateData.integration_data = {
                ...(updateData.integration_data || {}),
                last_sync_error: error,
                last_sync_attempt: new Date().toISOString()
            };
        }

        const { error: dbError } = await this.supabase
            .from('appointments')
            .update(updateData)
            .eq('id', appointmentId);

        if (dbError) throw dbError;
    }

    /**
     * Update integration sync status
     */
    async updateIntegrationSyncStatus(integrationId, status, error = null) {
        const updateData = {
            status: status === 'synced' ? 'connected' : 'error',
            last_sync_at: new Date().toISOString(),
            last_error: error,
            updated_at: new Date().toISOString()
        };

        if (!error) {
            updateData.error_count = 0;
        }

        const { error: dbError } = await this.supabase
            .from('user_integrations')
            .update(updateData)
            .eq('id', integrationId);

        if (dbError) throw dbError;
    }

    /**
     * Update integration configuration
     */
    async updateIntegrationConfig(integrationId, configUpdate) {
        const { data: integration } = await this.supabase
            .from('user_integrations')
            .select('config')
            .eq('id', integrationId)
            .single();

        const newConfig = {
            ...(integration.config || {}),
            ...configUpdate
        };

        const { error } = await this.supabase
            .from('user_integrations')
            .update({
                config: newConfig,
                updated_at: new Date().toISOString()
            })
            .eq('id', integrationId);

        if (error) throw error;
    }

    /**
     * Update appointment with meeting link from Google Meet
     */
    async updateAppointmentMeetingLink(appointmentId, meetingUrl) {
        const { error } = await this.supabase
            .from('appointments')
            .update({
                meeting_link: meetingUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', appointmentId);

        if (error) {
            this.auditLogger.log('error', 'APPOINTMENT_MEETING_LINK_UPDATE_ERROR', {
                appointmentId,
                meetingUrl,
                error: error.message
            });
            throw error;
        }

        this.auditLogger.log('info', 'APPOINTMENT_MEETING_LINK_UPDATED', {
            appointmentId,
            meetingUrl
        });
    }

    /**
     * Check for scheduling conflicts
     */
    async checkForConflicts(userId, googleEvent) {
        const eventStart = new Date(googleEvent.start.dateTime || googleEvent.start.date);
        const eventEnd = new Date(googleEvent.end.dateTime || googleEvent.end.date);

        // Check for overlapping appointments
        const { data: conflicts } = await this.supabase
            .from('appointments')
            .select(`
                id,
                purpose,
                timeslots (
                    date,
                    start_time,
                    end_time
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .neq('status', 'cancelled')
            .gte('timeslots.date', eventStart.toISOString().split('T')[0])
            .lte('timeslots.date', eventEnd.toISOString().split('T')[0]);

        const conflictingAppointments = [];

        for (const appointment of conflicts || []) {
            const appointmentStart = new Date(`${appointment.timeslots.date}T${appointment.timeslots.start_time}`);
            const appointmentEnd = new Date(`${appointment.timeslots.date}T${appointment.timeslots.end_time}`);

            // Check for time overlap
            if (eventStart < appointmentEnd && eventEnd > appointmentStart) {
                conflictingAppointments.push(appointment);
            }
        }

        return conflictingAppointments;
    }

    /**
     * Store conflict information for resolution
     */
    async storeConflictInfo(integrationId, googleEvent, conflicts) {
        // Store in calendar_events with conflict status
        const conflictRecord = {
            integration_id: integrationId,
            external_event_id: googleEvent.id,
            external_calendar_id: googleEvent.organizer?.email || 'primary',
            title: googleEvent.summary,
            description: googleEvent.description,
            start_time: googleEvent.start.dateTime || googleEvent.start.date,
            end_time: googleEvent.end.dateTime || googleEvent.end.date,
            timezone: googleEvent.start.timeZone || 'UTC',
            location: googleEvent.location,
            meeting_url: googleEvent.hangoutLink,
            sync_status: 'conflict',
            last_synced_at: new Date().toISOString(),
            etag: googleEvent.etag,
            attendees: googleEvent.attendees || [],
            is_all_day: !googleEvent.start.dateTime
        };

        const { error } = await this.supabase
            .from('calendar_events')
            .insert(conflictRecord);

        if (error) throw error;

        // Log conflict for audit trail
        this.auditLogger.log('warn', 'CALENDAR_CONFLICT_DETECTED', {
            integrationId,
            googleEventId: googleEvent.id,
            conflictingAppointments: conflicts.map(c => c.id)
        });
    }

    /**
     * Handle deleted Google Calendar event
     */
    async handleDeletedGoogleEvent(integrationId, deletedEvent) {
        // Find and remove the calendar event record
        const { error } = await this.supabase
            .from('calendar_events')
            .delete()
            .eq('integration_id', integrationId)
            .eq('external_event_id', deletedEvent.id);

        if (error) throw error;
    }

    /**
     * Update or create calendar event record
     */
    async updateOrCreateCalendarEventRecord(googleEvent, integrationId) {
        // Check if record exists
        const { data: existing } = await this.supabase
            .from('calendar_events')
            .select('id')
            .eq('integration_id', integrationId)
            .eq('external_event_id', googleEvent.id)
            .single();

        if (existing) {
            // Update existing record
            await this.updateCalendarEventRecord(existing.id, googleEvent);
        } else {
            // Create new record
            await this.createCalendarEventRecord(googleEvent, null, integrationId);
        }
    }
}

export default GoogleCalendarSyncService;
