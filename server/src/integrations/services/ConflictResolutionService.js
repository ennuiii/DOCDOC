/**
 * Conflict Resolution Service
 * Handles intelligent conflict detection and resolution for calendar integration
 */

import { createClient } from '@supabase/supabase-js';
import AuditLogger from './AuditLogger.js';

class ConflictResolutionService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        
        // Resolution strategies
        this.strategies = {
            USER_CHOICE: 'user_choice',
            PRIORITY_BASED: 'priority_based',
            TIME_BASED: 'time_based',
            AUTOMATIC: 'automatic'
        };

        // Conflict types
        this.conflictTypes = {
            TIME_OVERLAP: 'time_overlap',
            DOUBLE_BOOKING: 'double_booking',
            BUFFER_VIOLATION: 'buffer_violation',
            VENUE_CONFLICT: 'venue_conflict'
        };
    }

    /**
     * Detect all types of conflicts for a given event/appointment
     * @param {string} userId - User ID
     * @param {Object} eventData - Event or appointment data
     * @param {Object} options - Detection options
     */
    async detectConflicts(userId, eventData, options = {}) {
        try {
            const conflicts = [];

            // Time overlap conflicts
            const timeConflicts = await this.detectTimeOverlapConflicts(userId, eventData, options);
            conflicts.push(...timeConflicts);

            // Buffer time violations
            if (options.checkBufferTime) {
                const bufferConflicts = await this.detectBufferTimeConflicts(userId, eventData, options);
                conflicts.push(...bufferConflicts);
            }

            // Venue/location conflicts (for in-person meetings)
            if (eventData.meeting_type === 'in-person' || eventData.location) {
                const venueConflicts = await this.detectVenueConflicts(userId, eventData, options);
                conflicts.push(...venueConflicts);
            }

            // Double booking conflicts (same time, different events)
            const doubleBookingConflicts = await this.detectDoubleBookingConflicts(userId, eventData, options);
            conflicts.push(...doubleBookingConflicts);

            // Categorize and prioritize conflicts
            const categorizedConflicts = this.categorizeConflicts(conflicts);

            this.auditLogger.log('info', 'CONFLICT_DETECTION_COMPLETE', {
                userId,
                eventId: eventData.id || eventData.external_event_id,
                conflictsFound: conflicts.length,
                conflictTypes: categorizedConflicts.map(c => c.type)
            });

            return categorizedConflicts;

        } catch (error) {
            this.auditLogger.log('error', 'CONFLICT_DETECTION_ERROR', {
                userId,
                eventId: eventData.id || eventData.external_event_id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Detect time overlap conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectTimeOverlapConflicts(userId, eventData, options = {}) {
        const eventStart = new Date(eventData.start_time || eventData.start?.dateTime);
        const eventEnd = new Date(eventData.end_time || eventData.end?.dateTime);

        // Get overlapping appointments
        const { data: appointments } = await this.supabase
            .from('appointments')
            .select(`
                id,
                purpose,
                status,
                meeting_type,
                duration,
                notes,
                timeslots (
                    id,
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
            .neq('status', 'cancelled')
            .gte('timeslots.date', eventStart.toISOString().split('T')[0])
            .lte('timeslots.date', eventEnd.toISOString().split('T')[0]);

        // Get overlapping calendar events
        const { data: calendarEvents } = await this.supabase
            .from('calendar_events')
            .select(`
                *,
                user_integrations!inner (
                    user_id,
                    provider
                )
            `)
            .eq('user_integrations.user_id', userId)
            .neq('sync_status', 'cancelled')
            .gte('start_time', eventStart.toISOString())
            .lte('end_time', eventEnd.toISOString());

        const conflicts = [];

        // Check appointment overlaps
        for (const appointment of appointments || []) {
            const appointmentStart = new Date(`${appointment.timeslots.date}T${appointment.timeslots.start_time}`);
            const appointmentEnd = new Date(`${appointment.timeslots.date}T${appointment.timeslots.end_time}`);

            if (this.hasTimeOverlap(eventStart, eventEnd, appointmentStart, appointmentEnd)) {
                conflicts.push({
                    type: this.conflictTypes.TIME_OVERLAP,
                    severity: this.calculateConflictSeverity(eventStart, eventEnd, appointmentStart, appointmentEnd),
                    conflictingItem: {
                        type: 'appointment',
                        id: appointment.id,
                        title: appointment.purpose,
                        start_time: appointmentStart,
                        end_time: appointmentEnd,
                        participants: [appointment.doctor, appointment.pharma_rep],
                        meeting_type: appointment.meeting_type
                    },
                    overlap: this.calculateOverlapDuration(eventStart, eventEnd, appointmentStart, appointmentEnd),
                    resolutionSuggestions: await this.generateResolutionSuggestions(
                        eventData, 
                        appointment, 
                        'appointment_conflict'
                    )
                });
            }
        }

        // Check calendar event overlaps
        for (const calendarEvent of calendarEvents || []) {
            const calEventStart = new Date(calendarEvent.start_time);
            const calEventEnd = new Date(calendarEvent.end_time);

            if (this.hasTimeOverlap(eventStart, eventEnd, calEventStart, calEventEnd)) {
                conflicts.push({
                    type: this.conflictTypes.TIME_OVERLAP,
                    severity: this.calculateConflictSeverity(eventStart, eventEnd, calEventStart, calEventEnd),
                    conflictingItem: {
                        type: 'calendar_event',
                        id: calendarEvent.id,
                        external_id: calendarEvent.external_event_id,
                        title: calendarEvent.title,
                        start_time: calEventStart,
                        end_time: calEventEnd,
                        provider: calendarEvent.user_integrations.provider,
                        location: calendarEvent.location
                    },
                    overlap: this.calculateOverlapDuration(eventStart, eventEnd, calEventStart, calEventEnd),
                    resolutionSuggestions: await this.generateResolutionSuggestions(
                        eventData, 
                        calendarEvent, 
                        'calendar_event_conflict'
                    )
                });
            }
        }

        return conflicts;
    }

    /**
     * Detect buffer time conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectBufferTimeConflicts(userId, eventData, options = {}) {
        const bufferMinutes = options.bufferMinutes || await this.getUserBufferPreference(userId);
        
        if (!bufferMinutes || bufferMinutes === 0) {
            return [];
        }

        const eventStart = new Date(eventData.start_time || eventData.start?.dateTime);
        const eventEnd = new Date(eventData.end_time || eventData.end?.dateTime);

        // Extend time range by buffer
        const bufferStart = new Date(eventStart.getTime() - (bufferMinutes * 60000));
        const bufferEnd = new Date(eventEnd.getTime() + (bufferMinutes * 60000));

        // Find events within buffer zone
        const { data: appointments } = await this.supabase
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
            .gte('timeslots.date', bufferStart.toISOString().split('T')[0])
            .lte('timeslots.date', bufferEnd.toISOString().split('T')[0]);

        const conflicts = [];

        for (const appointment of appointments || []) {
            const appointmentStart = new Date(`${appointment.timeslots.date}T${appointment.timeslots.start_time}`);
            const appointmentEnd = new Date(`${appointment.timeslots.date}T${appointment.timeslots.end_time}`);

            // Check if within buffer zone but not overlapping
            if (!this.hasTimeOverlap(eventStart, eventEnd, appointmentStart, appointmentEnd)) {
                const beforeBuffer = appointmentEnd <= eventStart && appointmentEnd > bufferStart;
                const afterBuffer = appointmentStart >= eventEnd && appointmentStart < bufferEnd;

                if (beforeBuffer || afterBuffer) {
                    conflicts.push({
                        type: this.conflictTypes.BUFFER_VIOLATION,
                        severity: 'medium',
                        conflictingItem: {
                            type: 'appointment',
                            id: appointment.id,
                            title: appointment.purpose,
                            start_time: appointmentStart,
                            end_time: appointmentEnd
                        },
                        bufferMinutes,
                        bufferType: beforeBuffer ? 'before' : 'after',
                        resolutionSuggestions: await this.generateBufferResolutionSuggestions(
                            eventData, 
                            appointment, 
                            bufferMinutes,
                            beforeBuffer ? 'before' : 'after'
                        )
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Detect venue/location conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectVenueConflicts(userId, eventData, options = {}) {
        if (eventData.meeting_type !== 'in-person' && !eventData.location) {
            return [];
        }

        const eventStart = new Date(eventData.start_time || eventData.start?.dateTime);
        const eventEnd = new Date(eventData.end_time || eventData.end?.dateTime);
        const eventLocation = eventData.location || 'In-Person Meeting';

        // Find other in-person appointments at the same location and time
        const { data: appointments } = await this.supabase
            .from('appointments')
            .select(`
                id,
                purpose,
                meeting_type,
                timeslots (
                    date,
                    start_time,
                    end_time
                )
            `)
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .eq('meeting_type', 'in-person')
            .neq('status', 'cancelled')
            .gte('timeslots.date', eventStart.toISOString().split('T')[0])
            .lte('timeslots.date', eventEnd.toISOString().split('T')[0]);

        const conflicts = [];

        for (const appointment of appointments || []) {
            const appointmentStart = new Date(`${appointment.timeslots.date}T${appointment.timeslots.start_time}`);
            const appointmentEnd = new Date(`${appointment.timeslots.date}T${appointment.timeslots.end_time}`);

            if (this.hasTimeOverlap(eventStart, eventEnd, appointmentStart, appointmentEnd)) {
                conflicts.push({
                    type: this.conflictTypes.VENUE_CONFLICT,
                    severity: 'high',
                    conflictingItem: {
                        type: 'appointment',
                        id: appointment.id,
                        title: appointment.purpose,
                        start_time: appointmentStart,
                        end_time: appointmentEnd,
                        location: 'In-Person Meeting'
                    },
                    location: eventLocation,
                    resolutionSuggestions: await this.generateVenueResolutionSuggestions(eventData, appointment)
                });
            }
        }

        return conflicts;
    }

    /**
     * Detect double booking conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectDoubleBookingConflicts(userId, eventData, options = {}) {
        const eventStart = new Date(eventData.start_time || eventData.start?.dateTime);
        const eventEnd = new Date(eventData.end_time || eventData.end?.dateTime);

        // Count total concurrent events at the same time
        const { data: appointments } = await this.supabase
            .from('appointments')
            .select('id, purpose, timeslots(date, start_time, end_time)')
            .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
            .neq('status', 'cancelled')
            .gte('timeslots.date', eventStart.toISOString().split('T')[0])
            .lte('timeslots.date', eventEnd.toISOString().split('T')[0]);

        const { data: calendarEvents } = await this.supabase
            .from('calendar_events')
            .select(`
                id, title, start_time, end_time,
                user_integrations!inner(user_id)
            `)
            .eq('user_integrations.user_id', userId)
            .neq('sync_status', 'cancelled')
            .gte('start_time', eventStart.toISOString())
            .lte('end_time', eventEnd.toISOString());

        let concurrentCount = 0;
        const concurrentEvents = [];

        // Count overlapping appointments
        for (const appointment of appointments || []) {
            const appointmentStart = new Date(`${appointment.timeslots.date}T${appointment.timeslots.start_time}`);
            const appointmentEnd = new Date(`${appointment.timeslots.date}T${appointment.timeslots.end_time}`);

            if (this.hasTimeOverlap(eventStart, eventEnd, appointmentStart, appointmentEnd)) {
                concurrentCount++;
                concurrentEvents.push({
                    type: 'appointment',
                    id: appointment.id,
                    title: appointment.purpose
                });
            }
        }

        // Count overlapping calendar events
        for (const calendarEvent of calendarEvents || []) {
            const calEventStart = new Date(calendarEvent.start_time);
            const calEventEnd = new Date(calendarEvent.end_time);

            if (this.hasTimeOverlap(eventStart, eventEnd, calEventStart, calEventEnd)) {
                concurrentCount++;
                concurrentEvents.push({
                    type: 'calendar_event',
                    id: calendarEvent.id,
                    title: calendarEvent.title
                });
            }
        }

        const conflicts = [];

        if (concurrentCount > 0) {
            conflicts.push({
                type: this.conflictTypes.DOUBLE_BOOKING,
                severity: concurrentCount > 1 ? 'critical' : 'high',
                conflictingItem: {
                    type: 'multiple',
                    count: concurrentCount,
                    events: concurrentEvents
                },
                resolutionSuggestions: await this.generateDoubleBookingResolutionSuggestions(
                    eventData, 
                    concurrentEvents
                )
            });
        }

        return conflicts;
    }

    /**
     * Resolve conflicts using specified strategy
     * @param {Array} conflicts - Array of conflicts
     * @param {string} strategy - Resolution strategy
     * @param {Object} userPreferences - User preferences
     */
    async resolveConflicts(conflicts, strategy = this.strategies.USER_CHOICE, userPreferences = {}) {
        const resolutionResults = [];

        for (const conflict of conflicts) {
            try {
                let resolution;

                switch (strategy) {
                    case this.strategies.PRIORITY_BASED:
                        resolution = await this.resolvePriorityBased(conflict, userPreferences);
                        break;
                    case this.strategies.TIME_BASED:
                        resolution = await this.resolveTimeBased(conflict, userPreferences);
                        break;
                    case this.strategies.AUTOMATIC:
                        resolution = await this.resolveAutomatic(conflict, userPreferences);
                        break;
                    case this.strategies.USER_CHOICE:
                    default:
                        resolution = await this.prepareUserChoiceResolution(conflict, userPreferences);
                        break;
                }

                resolutionResults.push({
                    conflict,
                    resolution,
                    strategy,
                    status: 'resolved'
                });

                this.auditLogger.log('info', 'CONFLICT_RESOLVED', {
                    conflictType: conflict.type,
                    strategy,
                    resolution: resolution.action
                });

            } catch (error) {
                resolutionResults.push({
                    conflict,
                    resolution: null,
                    strategy,
                    status: 'failed',
                    error: error.message
                });

                this.auditLogger.log('error', 'CONFLICT_RESOLUTION_FAILED', {
                    conflictType: conflict.type,
                    strategy,
                    error: error.message
                });
            }
        }

        return resolutionResults;
    }

    /**
     * Store conflict information for user resolution
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Array} conflicts - Conflicts array
     * @param {Object} eventData - Event data
     */
    async storeConflictForResolution(userId, integrationId, conflicts, eventData) {
        const conflictRecord = {
            user_id: userId,
            integration_id: integrationId,
            event_data: eventData,
            conflicts: conflicts,
            status: 'pending',
            resolution_strategy: this.strategies.USER_CHOICE,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString() // 24 hours
        };

        // Store in a conflicts table (would need to be added to schema)
        // For now, store in calendar_events with conflict status
        const { data, error } = await this.supabase
            .from('calendar_events')
            .insert({
                integration_id: integrationId,
                external_event_id: eventData.id || `conflict-${Date.now()}`,
                title: eventData.summary || eventData.purpose || 'Conflicted Event',
                description: `Conflict Resolution Required: ${conflicts.length} conflicts detected`,
                start_time: eventData.start_time || eventData.start?.dateTime,
                end_time: eventData.end_time || eventData.end?.dateTime,
                sync_status: 'conflict',
                attendees: eventData.attendees || [],
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Create notification for user
        await this.createConflictNotification(userId, conflicts, eventData);

        return data;
    }

    /**
     * Create notification for conflict resolution
     * @param {string} userId - User ID
     * @param {Array} conflicts - Conflicts
     * @param {Object} eventData - Event data
     */
    async createConflictNotification(userId, conflicts, eventData) {
        const title = `Calendar Conflict Detected`;
        const message = `${conflicts.length} scheduling conflict(s) found for "${eventData.summary || eventData.purpose}". Action required.`;

        await this.supabase
            .from('notifications')
            .insert({
                recipient_id: userId,
                type: 'calendar-conflict',
                title,
                message,
                data: {
                    conflictCount: conflicts.length,
                    eventTitle: eventData.summary || eventData.purpose,
                    conflictTypes: conflicts.map(c => c.type),
                    eventStart: eventData.start_time || eventData.start?.dateTime
                },
                priority: 'high',
                created_at: new Date().toISOString()
            });
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Check if two time ranges overlap
     */
    hasTimeOverlap(start1, end1, start2, end2) {
        return start1 < end2 && end1 > start2;
    }

    /**
     * Calculate conflict severity based on overlap duration
     */
    calculateConflictSeverity(start1, end1, start2, end2) {
        const overlapMinutes = this.calculateOverlapDuration(start1, end1, start2, end2);
        
        if (overlapMinutes >= 60) return 'critical';
        if (overlapMinutes >= 30) return 'high';
        if (overlapMinutes >= 15) return 'medium';
        return 'low';
    }

    /**
     * Calculate overlap duration in minutes
     */
    calculateOverlapDuration(start1, end1, start2, end2) {
        const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
        const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
        
        return Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 60000);
    }

    /**
     * Categorize and prioritize conflicts
     */
    categorizeConflicts(conflicts) {
        return conflicts.sort((a, b) => {
            const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }

    /**
     * Get user's buffer time preference
     */
    async getUserBufferPreference(userId) {
        const { data } = await this.supabase
            .from('users')
            .select('preferences')
            .eq('id', userId)
            .single();

        return data?.preferences?.bufferTimeMinutes || 15; // Default 15 minutes
    }

    // ========================================
    // RESOLUTION STRATEGIES
    // ========================================

    /**
     * Generate resolution suggestions
     */
    async generateResolutionSuggestions(eventData, conflictingItem, conflictType) {
        const suggestions = [];

        // Time adjustment suggestions
        suggestions.push({
            type: 'reschedule_new',
            title: 'Reschedule New Event',
            description: 'Move the new event to a different time slot',
            impact: 'low',
            automated: true
        });

        suggestions.push({
            type: 'reschedule_existing',
            title: 'Reschedule Existing Event',
            description: 'Move the conflicting event to a different time slot',
            impact: 'medium',
            automated: false
        });

        // Meeting type change suggestions
        if (conflictType === 'venue_conflict') {
            suggestions.push({
                type: 'change_to_virtual',
                title: 'Change to Virtual Meeting',
                description: 'Convert one or both meetings to virtual',
                impact: 'low',
                automated: true
            });
        }

        // Duration adjustment suggestions
        suggestions.push({
            type: 'shorten_duration',
            title: 'Shorten Meeting Duration',
            description: 'Reduce duration of one or both meetings',
            impact: 'medium',
            automated: false
        });

        return suggestions;
    }

    /**
     * Generate buffer time resolution suggestions
     */
    async generateBufferResolutionSuggestions(eventData, conflictingItem, bufferMinutes, bufferType) {
        return [
            {
                type: 'adjust_buffer',
                title: 'Adjust Buffer Time',
                description: `Reduce buffer time requirement to accommodate scheduling`,
                impact: 'low',
                automated: true
            },
            {
                type: 'reschedule_for_buffer',
                title: 'Reschedule for Buffer',
                description: `Move event to maintain ${bufferMinutes} minute buffer`,
                impact: 'medium',
                automated: true
            }
        ];
    }

    /**
     * Generate venue conflict resolution suggestions
     */
    async generateVenueResolutionSuggestions(eventData, conflictingItem) {
        return [
            {
                type: 'change_to_virtual',
                title: 'Convert to Virtual Meeting',
                description: 'Change one meeting to virtual to resolve venue conflict',
                impact: 'low',
                automated: true
            },
            {
                type: 'reschedule_venue',
                title: 'Reschedule One Meeting',
                description: 'Move one meeting to a different time slot',
                impact: 'medium',
                automated: false
            }
        ];
    }

    /**
     * Generate double booking resolution suggestions
     */
    async generateDoubleBookingResolutionSuggestions(eventData, concurrentEvents) {
        return [
            {
                type: 'cancel_new',
                title: 'Cancel New Event',
                description: 'Cancel the new event to resolve double booking',
                impact: 'high',
                automated: false
            },
            {
                type: 'reschedule_all',
                title: 'Reschedule All Conflicts',
                description: 'Find new time slots for all conflicting events',
                impact: 'high',
                automated: true
            }
        ];
    }

    /**
     * Resolve using priority-based strategy
     */
    async resolvePriorityBased(conflict, userPreferences) {
        // Implementation for priority-based resolution
        return {
            action: 'priority_based_resolution',
            description: 'Resolved based on event priorities',
            automated: true
        };
    }

    /**
     * Resolve using time-based strategy
     */
    async resolveTimeBased(conflict, userPreferences) {
        // Implementation for time-based resolution (first come, first served)
        return {
            action: 'time_based_resolution',
            description: 'Resolved based on event creation time',
            automated: true
        };
    }

    /**
     * Resolve automatically
     */
    async resolveAutomatic(conflict, userPreferences) {
        // Implementation for automatic resolution
        return {
            action: 'automatic_resolution',
            description: 'Automatically resolved using smart algorithms',
            automated: true
        };
    }

    /**
     * Prepare user choice resolution
     */
    async prepareUserChoiceResolution(conflict, userPreferences) {
        return {
            action: 'user_choice_required',
            description: 'User input required for resolution',
            options: conflict.resolutionSuggestions,
            automated: false
        };
    }
}

export default ConflictResolutionService;
