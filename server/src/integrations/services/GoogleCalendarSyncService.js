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
        
        // Simple console logger for testing - can be replaced with full AuditLogger later
        this.auditLogger = {
            logEvent: async (eventType, data, context) => {
                console.log(`📊 [${eventType}]`, { 
                    ...data, 
                    userId: context?.userId, 
                    integrationId: context?.integrationId 
                });
            },
            log: async (level, eventType, data) => {
                console.log(`📊 [${level.toUpperCase()}] [${eventType}]`, data);
            }
        };
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
            await this.auditLogger.logEvent('GOOGLE_SYNC_START', {
                syncType: 'full',
                options
            }, {
                userId,
                integrationId
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
            
            await this.auditLogger.logEvent('GOOGLE_SYNC_COMPLETE', {
                duration,
                pharmaToGoogle: pharmaToGoogleResult,
                googleToPharma: googleToPharmaResult
            }, {
                userId,
                integrationId
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
            
            await this.auditLogger.logEvent('GOOGLE_SYNC_ERROR', {
                error: error.message,
                duration: Date.now() - startTime
            }, {
                userId,
                integrationId
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
            await this.auditLogger.logEvent('GOOGLE_INCREMENTAL_SYNC_START', {
                options
            }, {
                userId,
                integrationId
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
            
            await this.auditLogger.logEvent('GOOGLE_INCREMENTAL_SYNC_COMPLETE', {
                duration,
                pharmaChanges,
                googleChanges
            }, {
                userId,
                integrationId
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
            
            await this.auditLogger.logEvent('GOOGLE_INCREMENTAL_SYNC_ERROR', {
                error: error.message,
                duration: Date.now() - startTime
            }, {
                userId,
                integrationId
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
            console.log(`🔄 [SYNC_DEBUG] Starting PharmaDOC to Google sync for user ${userId}`);
            
            // Get PharmaDOC appointments in timeframe (confirmed only for creation/update)
            const appointments = await this.getPharmaDOCAppointments(userId, timeframe);
            console.log(`📋 [SYNC_DEBUG] Found ${appointments.length} appointments for user ${userId}:`);
            appointments.forEach(apt => {
                console.log(`  - ${apt.id}: ${apt.status} | ${apt.purpose} | Meet: ${apt.meeting_link ? 'YES' : 'NO'} | Provider: ${apt.video_provider}`);
            });
            
            // Also get cancelled appointments that might have existing calendar events to delete
            const cancelledAppointments = await this.getCancelledAppointmentsWithEvents(userId, integrationId, timeframe);
            console.log(`❌ [SYNC_DEBUG] Found ${cancelledAppointments.length} cancelled appointments with events`);
            
            const results = {
                processed: 0,
                created: 0,
                updated: 0,
                deleted: 0,
                cancelled: 0,
                errors: []
            };

            // Process regular appointments (create/update calendar events)
            for (const appointment of appointments) {
                try {
                    console.log(`\n🔍 [SYNC_DEBUG] Processing appointment ${appointment.id} (${appointment.status})`);
                    console.log(`  - Purpose: ${appointment.purpose}`);
                    console.log(`  - Video Provider: ${appointment.video_provider}`);
                    console.log(`  - Meeting Link: ${appointment.meeting_link}`);
                    console.log(`  - Start: ${appointment.start_time}`);
                    
                    results.processed++;

                    // Check if calendar event already exists
                    const existingEvent = await this.getCalendarEventByAppointment(integrationId, appointment.id);
                    console.log(`  - Existing calendar event: ${existingEvent ? `YES (${existingEvent.external_event_id})` : 'NO'}`);

                    if (existingEvent) {
                        // Update existing event
                        console.log(`📝 [SYNC_DEBUG] Updating existing calendar event ${existingEvent.external_event_id}`);
                        const googleEvent = await this.updateGoogleCalendarEvent(tokens, existingEvent, appointment);
                        await this.updateCalendarEventRecord(existingEvent.id, googleEvent);
                        results.updated++;
                        console.log(`✅ [SYNC_DEBUG] Updated calendar event for appointment ${appointment.id}`);
                    } else {
                        // Create new event
                        console.log(`📅 [SYNC_DEBUG] Creating new calendar event for appointment ${appointment.id}`);
                        const googleEvent = await this.createGoogleCalendarEvent(tokens, appointment, integrationId);
                        console.log(`  - Created Google event ID: ${googleEvent.id}`);
                        console.log(`  - Google Meet link: ${googleEvent.hangoutLink || googleEvent.conferenceData?.entryPoints?.[0]?.uri || 'NONE'}`);
                        
                        await this.createCalendarEventRecord(googleEvent, appointment.id, integrationId);
                        results.created++;
                        console.log(`✅ [SYNC_DEBUG] Created calendar event for appointment ${appointment.id}`);
                    }

                    // Update appointment sync status
                    await this.updateAppointmentSyncStatus(appointment.id, 'synced');

                } catch (error) {
                    console.error(`❌ [SYNC_DEBUG] Error processing appointment ${appointment.id}:`, error.message);
                    results.errors.push({
                        appointmentId: appointment.id,
                        error: error.message
                    });
                    await this.updateAppointmentSyncStatus(appointment.id, 'failed', error.message);
                }
            }

            // Process cancelled appointments (mark calendar events as cancelled)
            for (const appointment of cancelledAppointments) {
                try {
                    console.log(`\n❌ [SYNC_DEBUG] Processing cancelled appointment ${appointment.id}`);
                    results.processed++;

                    const existingEvent = await this.getCalendarEventByAppointment(integrationId, appointment.id);
                    if (existingEvent) {
                        console.log(`🚨 [SYNC_DEBUG] CANCELLATION DETECTED for appointment ${appointment.id}`);
                        console.log(`   - Existing event: ${existingEvent.external_event_id}`);
                        console.log(`   - Will call markGoogleCalendarEventAsCancelled instead of deletion`);
                        
                        // Mark the appointment as cancelled instead of deleting it
                        const updatedGoogleEvent = await this.markGoogleCalendarEventAsCancelled(tokens, existingEvent, appointment);
                        await this.updateCalendarEventRecord(existingEvent.id, updatedGoogleEvent);
                        results.cancelled++;
                        
                        console.log(`✅ [SYNC_DEBUG] SUCCESSFULLY CANCELLED appointment ${appointment.id}`);
                    } else {
                        console.log(`⚠️  [SYNC_DEBUG] No calendar event found for cancelled appointment ${appointment.id}`);
                    }

                    await this.updateAppointmentSyncStatus(appointment.id, 'synced');

                } catch (error) {
                    console.error(`❌ [SYNC_DEBUG] Error processing cancelled appointment ${appointment.id}:`, error.message);
                    results.errors.push({
                        appointmentId: appointment.id,
                        error: error.message
                    });
                }
            }

            console.log(`\n📊 [SYNC_DEBUG] PharmaDOC to Google sync completed:`, results);
            return results;

        } catch (error) {
            console.error(`❌ [SYNC_DEBUG] Critical error in PharmaDOC to Google sync:`, error);
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
                timeslot:timeslots!timeslot_id (
                    id,
                    date,
                    start_time,
                    end_time,
                    duration
                ),
                doctor:users!doctor_id (
                    id,
                    first_name,
                    last_name,
                    email
                ),
                pharma_rep:users!pharma_rep_id (
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .in('status', ['confirmed', 'cancelled'])  // Include both confirmed and cancelled appointments
            .not('timeslot_id', 'is', null)  // Only appointments with timeslots
            .gte('updated_at', new Date(lastSyncTime).toISOString())
            .order('updated_at', { ascending: false });

        const results = { updated: 0, created: 0, deleted: 0, cancelled: 0, errors: [] };

        // Filter out appointments without required user data and timeslot info
        const validAppointments = (appointments || []).filter(appointment => {
            return appointment.doctor && appointment.pharma_rep && appointment.timeslot && appointment.timeslot.date;
        });

        for (const appointment of validAppointments) {
            try {
                const existingEvent = await this.getCalendarEventByAppointment(
                    integrationId, 
                    appointment.id
                );

                if (appointment.status === 'cancelled' && existingEvent) {
                    console.log(`🚨 [SYNC_DEBUG] CANCELLATION DETECTED for appointment ${appointment.id}`);
                    console.log(`   - Existing event: ${existingEvent.external_event_id}`);
                    console.log(`   - Will call markGoogleCalendarEventAsCancelled instead of deletion`);
                    
                    // Mark the appointment as cancelled instead of deleting it
                    const updatedGoogleEvent = await this.markGoogleCalendarEventAsCancelled(tokens, existingEvent, appointment);
                    await this.updateCalendarEventRecord(existingEvent.id, updatedGoogleEvent);
                    results.cancelled++;
                    
                    console.log(`✅ [SYNC_DEBUG] SUCCESSFULLY CANCELLED appointment ${appointment.id}`);
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
            updatedMin: new Date(lastSyncTime).toISOString(),
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
        const { timeslot, doctor, pharma_rep } = appointment;
        
        // Construct event start and end times from timeslot data
        const eventDate = timeslot.date;
        const startTime = new Date(`${eventDate}T${timeslot.start_time}`);
        const endTime = new Date(`${eventDate}T${timeslot.end_time}`);

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
                    displayName: `${doctor.first_name} ${doctor.last_name}`,
                    responseStatus: 'accepted'
                },
                {
                    email: pharma_rep.email,
                    displayName: `${pharma_rep.first_name} ${pharma_rep.last_name}`,
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
            // Only create new Google Meet link if appointment doesn't already have one
            if (!appointment.meeting_link) {
                eventData.conferenceData = {
                    createRequest: {
                        requestId: `pharmadoc-${appointment.id}-${Date.now()}`,
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet'
                        }
                    }
                };
            }
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
        description += `Doctor: ${doctor.first_name} ${doctor.last_name} (${doctor.email})\n`;
        description += `Pharma Rep: ${pharma_rep.first_name} ${pharma_rep.last_name} (${pharma_rep.email})\n`;
        
        if (appointment.notes) {
            description += `\nNotes: ${appointment.notes}`;
        }
        
        if (appointment.meeting_link) {
            description += `\nMeeting Link: ${appointment.meeting_link}`;
        }

        return description;
    }

    /**
     * Build cancelled event description
     * @param {Object} appointment - Appointment data
     * @param {string} originalDescription - Original event description
     * @returns {string} Cancelled event description
     */
    buildCancelledEventDescription(appointment, originalDescription) {
        const cancelDate = new Date().toLocaleString();
        
        const cancellationInfo = [
            `❌ APPOINTMENT CANCELLED`,
            `🕒 Cancelled on: ${cancelDate}`,
            ``,
            `--- Original Appointment Details ---`,
            originalDescription || this.buildEventDescription(
                appointment, 
                appointment.doctor, 
                appointment.pharma_rep
            )
        ];

        return cancellationInfo.join('\n');
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
        // Default timeframe: 30 days in the past, 90 days in the future
        const now = new Date();
        const start = new Date(now.getTime() - (options.pastDays || 30) * 24 * 60 * 60 * 1000);
        const end = new Date(now.getTime() + (options.futureDays || 90) * 24 * 60 * 60 * 1000);
        
        const timeframe = {
            start: start.toISOString(),
            end: end.toISOString()
        };
        
        console.log(`📅 [SYNC_DEBUG] Calculated sync timeframe:`, {
            start: timeframe.start,
            end: timeframe.end,
            pastDays: options.pastDays || 30,
            futureDays: options.futureDays || 90,
            now: now.toISOString()
        });
        
        return timeframe;
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
        console.log(`🔍 [SYNC_DEBUG] Getting PharmaDOC appointments for user ${userId}`);
        console.log(`  - Timeframe: ${timeframe.start} to ${timeframe.end}`);
        
        const { data: appointments, error } = await this.supabase
            .from('appointments')
            .select(`
                *,
                doctor:doctor_id(id, email, first_name, last_name),
                pharma_rep:pharma_rep_id(id, email, first_name, last_name),
                timeslot:timeslot_id(start_time, end_time)
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .gte('timeslot.start_time', timeframe.start)
            .lte('timeslot.start_time', timeframe.end)
            .in('status', ['confirmed', 'scheduled']) // Only sync confirmed and scheduled appointments
            .order('timeslot.start_time');

        if (error) {
            console.error(`❌ [SYNC_DEBUG] Error getting appointments:`, error);
            throw error;
        }

        console.log(`📋 [SYNC_DEBUG] Raw appointments query returned ${appointments?.length || 0} records`);
        
        // Transform appointments to include flattened timeslot data
        const transformedAppointments = appointments.map(apt => {
            const transformed = {
                ...apt,
                start_time: apt.timeslot?.start_time,
                end_time: apt.timeslot?.end_time,
                doctor_email: apt.doctor?.email,
                doctor_name: `${apt.doctor?.first_name} ${apt.doctor?.last_name}`.trim(),
                pharma_rep_email: apt.pharma_rep?.email,
                pharma_rep_name: `${apt.pharma_rep?.first_name} ${apt.pharma_rep?.last_name}`.trim()
            };
            
            console.log(`  📅 [SYNC_DEBUG] Appointment ${apt.id}:`);
            console.log(`     - Status: ${apt.status}`);
            console.log(`     - Purpose: ${apt.purpose}`);
            console.log(`     - Start: ${transformed.start_time}`);
            console.log(`     - Video Provider: ${apt.video_provider}`);
            console.log(`     - Meeting Link: ${apt.meeting_link ? 'YES' : 'NO'}`);
            console.log(`     - Calendar Sync Status: ${apt.calendar_sync_status}`);
            
            return transformed;
        });

        console.log(`✅ [SYNC_DEBUG] Returning ${transformedAppointments.length} transformed appointments for sync`);
        return transformedAppointments;
    }

    /**
     * Get cancelled appointments that have existing calendar events to be deleted
     */
    async getCancelledAppointmentsWithEvents(userId, integrationId, timeframe) {
        // First get all cancelled appointments for the user in the timeframe
        const { data: cancelledAppointments, error: appointmentsError } = await this.supabase
            .from('appointments')
            .select(`
                *,
                timeslot:timeslots!timeslot_id (
                    id,
                    date,
                    start_time,
                    end_time,
                    duration
                ),
                doctor:users!doctor_id (
                    id,
                    first_name,
                    last_name,
                    email
                ),
                pharma_rep:users!pharma_rep_id (
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .eq('status', 'cancelled')  // Only cancelled appointments
            .not('timeslot_id', 'is', null)  // Only appointments with timeslots
            .gte('timeslot.date', timeframe.start.toISOString().split('T')[0])
            .lte('timeslot.date', timeframe.end.toISOString().split('T')[0])
            .order('updated_at', { ascending: false });

        if (appointmentsError) throw appointmentsError;

        // Filter to only those that have existing calendar events
        const appointmentsWithEvents = [];
        for (const appointment of cancelledAppointments || []) {
            const existingEvent = await this.getCalendarEventByAppointment(integrationId, appointment.id);
            if (existingEvent) {
                appointmentsWithEvents.push(appointment);
            }
        }

        return appointmentsWithEvents;
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
            console.log(`\n🎯 [GOOGLE_EVENT_DEBUG] Creating calendar event for appointment ${appointment.id}`);
            console.log(`  - Video Provider: ${appointment.video_provider}`);
            console.log(`  - Existing Meeting Link: ${appointment.meeting_link}`);
            
            // Prepare event data
            const eventData = this.appointmentToGoogleEvent(appointment);
            console.log(`📝 [GOOGLE_EVENT_DEBUG] Generated event data:`, {
                summary: eventData.summary,
                start: eventData.start,
                end: eventData.end,
                attendees: eventData.attendees?.map(a => a.email)
            });
            
            // Create the calendar event with Google Meet integration if needed
            let googleEvent;
            if (appointment.video_provider === 'google_meet') {
                console.log(`🎥 [GOOGLE_EVENT_DEBUG] Creating Google Meet event...`);
                
                // Use GoogleMeetService for enhanced Google Meet integration
                const meetingData = {
                    userId: appointment.pharma_rep_id,
                    subject: eventData.summary,
                    startDateTime: eventData.start.dateTime,
                    endDateTime: eventData.end.dateTime,
                    attendees: [appointment.doctor_email, appointment.pharma_rep_email].filter(Boolean),
                    description: eventData.description,
                    timeZone: eventData.start.timeZone || 'UTC',
                    conferenceRequestId: `pharmadoc-${appointment.id}-${Date.now()}`,
                    meetingSettings: {
                        guestsCanInvite: appointment.integration_data?.google_meet?.allow_external_guests !== false,
                        guestsCanModify: false,
                        guestsCanSeeOthers: true
                    }
                };

                console.log(`📊 [GOOGLE_EVENT_DEBUG] Google Meet data:`, {
                    userId: meetingData.userId,
                    subject: meetingData.subject,
                    attendees: meetingData.attendees,
                    timeZone: meetingData.timeZone
                });

                const meetingResult = await this.googleMeetService.createGoogleMeet(
                    tokens.access_token,
                    meetingData,
                    tokens.refresh_token
                );

                console.log(`📹 [GOOGLE_EVENT_DEBUG] Google Meet creation result:`, {
                    success: meetingResult.success,
                    meetingId: meetingResult.meeting?.meetingId,
                    joinUrl: meetingResult.meeting?.joinUrl,
                    eventId: meetingResult.calendarEvent?.id
                });

                googleEvent = meetingResult.calendarEvent;

                // Update appointment with Google Meet link if created successfully
                if (meetingResult.meeting?.joinUrl) {
                    console.log(`🔗 [GOOGLE_EVENT_DEBUG] Updating appointment with Meet link: ${meetingResult.meeting.joinUrl}`);
                    await this.updateAppointmentMeetingLink(appointment.id, meetingResult.meeting.joinUrl);
                    
                    this.auditLogger.log('info', 'GOOGLE_MEET_CREATED', {
                        appointmentId: appointment.id,
                        integrationId,
                        meetingUrl: meetingResult.meeting.joinUrl,
                        eventId: googleEvent.id
                    });
                } else {
                    console.warn(`⚠️ [GOOGLE_EVENT_DEBUG] No Google Meet link in result`);
                }
            } else {
                console.log(`📅 [GOOGLE_EVENT_DEBUG] Creating regular calendar event (no Google Meet)`);
                // Create regular calendar event without Google Meet
                googleEvent = await this.googleProvider.createEvent(tokens.access_token, eventData);
                console.log(`✅ [GOOGLE_EVENT_DEBUG] Regular event created: ${googleEvent.id}`);
            }

            console.log(`🎉 [GOOGLE_EVENT_DEBUG] Final Google Event:`, {
                id: googleEvent.id,
                summary: googleEvent.summary,
                hangoutLink: googleEvent.hangoutLink,
                conferenceData: googleEvent.conferenceData ? 'Present' : 'None',
                status: googleEvent.status
            });

            return googleEvent;

        } catch (error) {
            console.error(`❌ [GOOGLE_EVENT_DEBUG] Error creating calendar event for appointment ${appointment.id}:`, error);
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
                // For updates, we'll use the regular Google Provider since GoogleMeetService 
                // doesn't have an update method yet. This preserves existing Meet links.
                googleEvent = await this.googleProvider.updateEvent(
                    tokens.access_token,
                    existingEvent.external_event_id,
                    eventData,
                    {
                        calendarId: existingEvent.external_calendar_id || 'primary'
                    }
                );

                this.auditLogger.log('info', 'GOOGLE_MEET_UPDATED', {
                    appointmentId: appointment.id,
                    eventId: googleEvent.id
                });
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
     * Mark Google Calendar event as cancelled instead of deleting it
     */
    async markGoogleCalendarEventAsCancelled(tokens, existingEvent, appointment) {
        try {
            console.log(`🚨 [CANCEL_DEBUG] Starting cancellation process for appointment ${appointment.id}`);
            console.log(`   - Event ID: ${existingEvent.external_event_id}`);
            console.log(`   - Calendar ID: ${existingEvent.external_calendar_id || 'primary'}`);
            
            const originalEvent = this.appointmentToGoogleEvent(appointment);
            console.log(`   - Original event title: ${originalEvent.summary}`);
            
            // Create cancelled version of the event - keep it visible but mark as declined
            const cancelledEventData = {
                ...originalEvent,
                summary: `[CANCELLED] ${originalEvent.summary}`,
                description: `${originalEvent.description || ''}\n\n--- APPOINTMENT CANCELLED ---\nReason: ${appointment.cancellation_reason || 'No reason provided'}\nCancelled at: ${new Date().toLocaleString()}`,
                // DON'T set status to 'cancelled' - this moves to trash
                // status: 'cancelled', // <-- This is what was causing the trash issue
                transparency: 'transparent', // Make it transparent to show as free time
                // Instead, we'll handle attendee responses to show as declined
            };
            
            console.log(`   - Cancelled event title: ${cancelledEventData.summary}`);
            console.log(`   - Setting transparency to: ${cancelledEventData.transparency}`);
            console.log(`   - Will mark attendees as declined instead of cancelling event`);
            
            // Add attendees and mark them as declined to keep event visible
            const attendees = [];
            
            // Add doctor as attendee with declined status
            if (appointment.doctor && appointment.doctor.email) {
                attendees.push({
                    email: appointment.doctor.email,
                    displayName: `Dr. ${appointment.doctor.first_name} ${appointment.doctor.last_name}`,
                    responseStatus: 'declined',
                    comment: 'Appointment cancelled'
                });
            }
            
            // Add pharma rep as attendee with declined status  
            if (appointment.pharma_rep && appointment.pharma_rep.email) {
                attendees.push({
                    email: appointment.pharma_rep.email,
                    displayName: `${appointment.pharma_rep.first_name} ${appointment.pharma_rep.last_name}`,
                    responseStatus: 'declined',
                    comment: 'Appointment cancelled'
                });
            }
            
            if (attendees.length > 0) {
                cancelledEventData.attendees = attendees;
                console.log(`   - Added ${attendees.length} attendees with 'declined' status`);
            }

            console.log(`🔄 [CANCEL_DEBUG] Making Google API call to update event...`);
            
            const updatedEvent = await this.googleProvider.updateEvent(
                tokens.access_token,
                existingEvent.external_event_id,
                cancelledEventData,
                {
                    calendarId: existingEvent.external_calendar_id || 'primary'
                }
            );

            console.log(`✅ [CANCEL_DEBUG] Google API call successful!`);
            console.log(`   - Updated event ID: ${updatedEvent.id}`);
            console.log(`   - Event kept visible (not moved to trash)`);
            console.log(`   - Attendees marked as declined`);
            console.log(`   - Title: ${updatedEvent.summary}`);

            return updatedEvent;

        } catch (error) {
            console.error(`❌ [CANCEL_DEBUG] Failed to mark Google Calendar event as cancelled:`, error);
            throw error;
        }
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

        // Use upsert to handle potential duplicates from the unique constraint
        const { data, error } = await this.supabase
            .from('calendar_events')
            .upsert(eventRecord, {
                onConflict: 'integration_id,external_event_id',
                returning: 'minimal'
            })
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

        // Check for overlapping appointments using timeslot data
        const { data: conflicts } = await this.supabase
            .from('appointments')
            .select(`
                id,
                purpose,
                timeslot:timeslots!timeslot_id (
                    date,
                    start_time,
                    end_time
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .neq('status', 'cancelled')
            .not('timeslot_id', 'is', null)
            .gte('timeslot.date', eventStart.toISOString().split('T')[0])
            .lte('timeslot.date', eventEnd.toISOString().split('T')[0]);

        const conflictingAppointments = [];

        for (const appointment of conflicts || []) {
            // Skip appointments without timeslot data (silently)
            if (!appointment.timeslot || !appointment.timeslot.date) {
                continue;
            }

            const appointmentStart = new Date(`${appointment.timeslot.date}T${appointment.timeslot.start_time}`);
            const appointmentEnd = new Date(`${appointment.timeslot.date}T${appointment.timeslot.end_time}`);

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
            .upsert(conflictRecord, {
                onConflict: 'integration_id,external_event_id',
                returning: 'minimal'
            });

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
        // Use upsert to handle create or update automatically
        const eventRecord = {
            integration_id: integrationId,
            appointment_id: null, // For non-PharmaDOC events
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
            is_all_day: !googleEvent.start.dateTime,
            updated_at: new Date().toISOString()
        };

        const { error } = await this.supabase
            .from('calendar_events')
            .upsert(eventRecord, {
                onConflict: 'integration_id,external_event_id',
                returning: 'minimal'
            });

        if (error) throw error;
    }
}

export default GoogleCalendarSyncService;
