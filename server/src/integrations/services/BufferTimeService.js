/**
 * Buffer Time Service
 * Implements smart scheduling with configurable buffer times between appointments
 */

const { createClient } = require('@supabase/supabase-js');
const AuditLogger = require('./AuditLogger');
const TimezoneService = require('./TimezoneService');

class BufferTimeService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        this.timezoneService = new TimezoneService();
        
        // Default buffer time settings
        this.defaultBufferSettings = {
            beforeAppointment: 15, // minutes
            afterAppointment: 15, // minutes
            enableSmartBuffering: true,
            respectCalendarBuffers: true,
            minimumBufferTime: 5, // minutes
            maximumBufferTime: 60, // minutes
            bufferTimeStrategy: 'fixed', // fixed, percentage, adaptive
            adaptiveFactors: {
                appointmentDuration: true,
                appointmentType: true,
                providerPreferences: true,
                timeOfDay: true
            },
            overrideSettings: {
                allowUserOverride: true,
                allowProviderOverride: true,
                requireApproval: false
            }
        };

        // Buffer time strategies
        this.bufferStrategies = {
            FIXED: 'fixed',
            PERCENTAGE: 'percentage',
            ADAPTIVE: 'adaptive',
            DYNAMIC: 'dynamic'
        };

        // Appointment type buffer overrides
        this.appointmentTypeBuffers = {
            'consultation': { before: 10, after: 10 },
            'procedure': { before: 30, after: 20 },
            'surgery': { before: 60, after: 30 },
            'emergency': { before: 5, after: 5 },
            'follow-up': { before: 10, after: 10 },
            'telemedicine': { before: 5, after: 5 }
        };
    }

    /**
     * Get user's buffer time preferences
     * @param {string} userId - User ID
     * @returns {Object} Buffer time preferences
     */
    async getUserBufferPreferences(userId) {
        try {
            const { data: preferences } = await this.supabase
                .from('user_preferences')
                .select('buffer_time_settings')
                .eq('user_id', userId)
                .single();

            const bufferSettings = preferences?.buffer_time_settings || {};
            
            return {
                ...this.defaultBufferSettings,
                ...bufferSettings,
                userId,
                lastUpdated: bufferSettings.lastUpdated
            };

        } catch (error) {
            this.auditLogger.log('error', 'GET_BUFFER_PREFERENCES_ERROR', {
                userId,
                error: error.message
            });
            return this.defaultBufferSettings;
        }
    }

    /**
     * Update user's buffer time preferences
     * @param {string} userId - User ID
     * @param {Object} bufferSettings - Buffer time settings
     */
    async updateUserBufferPreferences(userId, bufferSettings) {
        try {
            // Validate buffer settings
            this.validateBufferSettings(bufferSettings);

            // Get existing preferences
            const { data: existingPrefs } = await this.supabase
                .from('user_preferences')
                .select('buffer_time_settings')
                .eq('user_id', userId)
                .single();

            const updatedSettings = {
                ...this.defaultBufferSettings,
                ...existingPrefs?.buffer_time_settings || {},
                ...bufferSettings,
                lastUpdated: new Date().toISOString()
            };

            // Update in database
            const { error } = await this.supabase
                .from('user_preferences')
                .upsert({
                    user_id: userId,
                    buffer_time_settings: updatedSettings
                }, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                });

            if (error) throw error;

            this.auditLogger.log('info', 'BUFFER_PREFERENCES_UPDATED', {
                userId,
                bufferSettings
            });

            return updatedSettings;

        } catch (error) {
            this.auditLogger.log('error', 'UPDATE_BUFFER_PREFERENCES_ERROR', {
                userId,
                bufferSettings,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Calculate buffer times for an appointment
     * @param {Object} appointment - Appointment details
     * @param {Object} userPreferences - User buffer preferences
     * @param {Object} options - Additional options
     * @returns {Object} Calculated buffer times
     */
    async calculateBufferTimes(appointment, userPreferences, options = {}) {
        try {
            const bufferPrefs = userPreferences || await this.getUserBufferPreferences(appointment.doctor_id);
            
            let beforeBuffer = bufferPrefs.beforeAppointment;
            let afterBuffer = bufferPrefs.afterAppointment;

            // Apply strategy-specific calculations
            switch (bufferPrefs.bufferTimeStrategy) {
                case this.bufferStrategies.PERCENTAGE:
                    const duration = this.getAppointmentDuration(appointment);
                    beforeBuffer = Math.round(duration * (bufferPrefs.beforePercentage || 0.1));
                    afterBuffer = Math.round(duration * (bufferPrefs.afterPercentage || 0.1));
                    break;

                case this.bufferStrategies.ADAPTIVE:
                    const adaptiveBuffers = await this.calculateAdaptiveBuffers(appointment, bufferPrefs);
                    beforeBuffer = adaptiveBuffers.before;
                    afterBuffer = adaptiveBuffers.after;
                    break;

                case this.bufferStrategies.DYNAMIC:
                    const dynamicBuffers = await this.calculateDynamicBuffers(appointment, bufferPrefs, options);
                    beforeBuffer = dynamicBuffers.before;
                    afterBuffer = dynamicBuffers.after;
                    break;

                default: // FIXED
                    // Use default values already set
                    break;
            }

            // Apply appointment type overrides
            if (appointment.appointment_type && this.appointmentTypeBuffers[appointment.appointment_type]) {
                const typeBuffer = this.appointmentTypeBuffers[appointment.appointment_type];
                beforeBuffer = Math.max(beforeBuffer, typeBuffer.before);
                afterBuffer = Math.max(afterBuffer, typeBuffer.after);
            }

            // Apply min/max constraints
            beforeBuffer = Math.max(bufferPrefs.minimumBufferTime, Math.min(beforeBuffer, bufferPrefs.maximumBufferTime));
            afterBuffer = Math.max(bufferPrefs.minimumBufferTime, Math.min(afterBuffer, bufferPrefs.maximumBufferTime));

            // Apply provider-specific overrides
            if (appointment.provider_buffer_settings) {
                const providerBuffers = await this.getProviderBufferOverrides(appointment.doctor_id, appointment);
                if (providerBuffers) {
                    beforeBuffer = providerBuffers.before || beforeBuffer;
                    afterBuffer = providerBuffers.after || afterBuffer;
                }
            }

            const result = {
                beforeBuffer,
                afterBuffer,
                strategy: bufferPrefs.bufferTimeStrategy,
                factors: this.getBufferCalculationFactors(appointment, bufferPrefs),
                effective: {
                    start: new Date(new Date(appointment.start_time).getTime() - (beforeBuffer * 60000)),
                    end: new Date(new Date(appointment.end_time).getTime() + (afterBuffer * 60000))
                },
                metadata: {
                    calculatedAt: new Date().toISOString(),
                    appointmentId: appointment.id,
                    userId: appointment.doctor_id
                }
            };

            return result;

        } catch (error) {
            this.auditLogger.log('error', 'CALCULATE_BUFFER_TIMES_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Apply buffer times to appointment scheduling
     * @param {Object} appointment - Appointment to schedule
     * @param {Object} existingAppointments - Existing appointments to check against
     * @param {Object} options - Scheduling options
     * @returns {Object} Scheduling result with buffer considerations
     */
    async applyBufferTimeScheduling(appointment, existingAppointments = [], options = {}) {
        try {
            const bufferTimes = await this.calculateBufferTimes(appointment, options.userPreferences);
            
            // Create appointment with buffer zones
            const appointmentWithBuffers = {
                ...appointment,
                buffer_before: bufferTimes.beforeBuffer,
                buffer_after: bufferTimes.afterBuffer,
                effective_start: bufferTimes.effective.start,
                effective_end: bufferTimes.effective.end,
                buffer_metadata: bufferTimes.metadata
            };

            // Check for conflicts with buffer times
            const conflicts = await this.detectBufferConflicts(appointmentWithBuffers, existingAppointments);
            
            if (conflicts.length > 0 && !options.allowConflicts) {
                return {
                    success: false,
                    conflicts,
                    suggestedTimes: await this.suggestAlternativeTimes(appointmentWithBuffers, existingAppointments, options),
                    bufferTimes
                };
            }

            // Apply buffer times to sync operations
            if (options.syncToCalendar) {
                await this.syncBufferTimesToCalendar(appointmentWithBuffers, options);
            }

            return {
                success: true,
                appointment: appointmentWithBuffers,
                bufferTimes,
                conflicts: []
            };

        } catch (error) {
            this.auditLogger.log('error', 'APPLY_BUFFER_SCHEDULING_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Detect conflicts considering buffer times
     * @param {Object} appointment - Appointment with buffers
     * @param {Array} existingAppointments - Existing appointments
     * @returns {Array} Detected conflicts
     */
    async detectBufferConflicts(appointment, existingAppointments) {
        try {
            const conflicts = [];
            const appointmentStart = new Date(appointment.effective_start);
            const appointmentEnd = new Date(appointment.effective_end);

            for (const existing of existingAppointments) {
                // Calculate buffer times for existing appointment
                const existingBuffers = await this.calculateBufferTimes(existing);
                const existingStart = new Date(existingBuffers.effective.start);
                const existingEnd = new Date(existingBuffers.effective.end);

                // Check for overlap
                if (this.hasTimeOverlap(appointmentStart, appointmentEnd, existingStart, existingEnd)) {
                    const conflict = {
                        type: 'buffer_conflict',
                        existingAppointment: existing,
                        conflictDetails: {
                            overlapStart: new Date(Math.max(appointmentStart.getTime(), existingStart.getTime())),
                            overlapEnd: new Date(Math.min(appointmentEnd.getTime(), existingEnd.getTime())),
                            bufferZone: this.determineBufferZoneConflict(appointment, existing, existingBuffers)
                        },
                        severity: this.calculateConflictSeverity(appointment, existing, existingBuffers),
                        resolution: await this.suggestConflictResolution(appointment, existing, existingBuffers)
                    };
                    conflicts.push(conflict);
                }
            }

            return conflicts;

        } catch (error) {
            this.auditLogger.log('error', 'DETECT_BUFFER_CONFLICTS_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Suggest alternative appointment times considering buffers
     * @param {Object} appointment - Appointment to reschedule
     * @param {Array} existingAppointments - Existing appointments
     * @param {Object} options - Scheduling options
     * @returns {Array} Suggested alternative times
     */
    async suggestAlternativeTimes(appointment, existingAppointments, options = {}) {
        try {
            const suggestions = [];
            const duration = this.getAppointmentDuration(appointment);
            const bufferTimes = await this.calculateBufferTimes(appointment, options.userPreferences);
            const totalDuration = duration + bufferTimes.beforeBuffer + bufferTimes.afterBuffer;

            // Define search window (default: +/- 3 days)
            const searchStart = new Date(appointment.start_time);
            searchStart.setDate(searchStart.getDate() - (options.searchDays || 3));
            
            const searchEnd = new Date(appointment.start_time);
            searchEnd.setDate(searchEnd.getDate() + (options.searchDays || 3));

            // Find available time slots
            const timeSlots = await this.findAvailableTimeSlots(
                searchStart,
                searchEnd,
                totalDuration,
                existingAppointments,
                options
            );

            // Score and rank suggestions
            for (const slot of timeSlots.slice(0, options.maxSuggestions || 5)) {
                const suggestion = {
                    start_time: slot.start,
                    end_time: slot.end,
                    effective_start: new Date(slot.start.getTime() - (bufferTimes.beforeBuffer * 60000)),
                    effective_end: new Date(slot.end.getTime() + (bufferTimes.afterBuffer * 60000)),
                    score: await this.scoreSuggestion(slot, appointment, options),
                    bufferTimes: bufferTimes,
                    reasons: slot.reasons || []
                };
                suggestions.push(suggestion);
            }

            // Sort by score (highest first)
            suggestions.sort((a, b) => b.score - a.score);

            return suggestions;

        } catch (error) {
            this.auditLogger.log('error', 'SUGGEST_ALTERNATIVE_TIMES_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Sync buffer times to external calendars
     * @param {Object} appointment - Appointment with buffer times
     * @param {Object} options - Sync options
     */
    async syncBufferTimesToCalendar(appointment, options = {}) {
        try {
            if (!options.calendarIntegration) return;

            const bufferEvents = [];

            // Create buffer time blocks if enabled
            if (options.createBufferBlocks) {
                // Before appointment buffer
                if (appointment.buffer_before > 0) {
                    const beforeEvent = {
                        summary: `Buffer: Prep for ${appointment.patient_name}`,
                        description: `Preparation time for upcoming appointment`,
                        start: {
                            dateTime: appointment.effective_start.toISOString(),
                            timeZone: appointment.timezone || 'UTC'
                        },
                        end: {
                            dateTime: appointment.start_time,
                            timeZone: appointment.timezone || 'UTC'
                        },
                        status: 'busy',
                        transparency: 'opaque',
                        visibility: 'private',
                        extendedProperties: {
                            private: {
                                bufferType: 'before',
                                parentAppointmentId: appointment.id,
                                bufferDuration: appointment.buffer_before.toString()
                            }
                        }
                    };
                    bufferEvents.push(beforeEvent);
                }

                // After appointment buffer
                if (appointment.buffer_after > 0) {
                    const afterEvent = {
                        summary: `Buffer: Follow-up from ${appointment.patient_name}`,
                        description: `Follow-up time after completed appointment`,
                        start: {
                            dateTime: appointment.end_time,
                            timeZone: appointment.timezone || 'UTC'
                        },
                        end: {
                            dateTime: appointment.effective_end.toISOString(),
                            timeZone: appointment.timezone || 'UTC'
                        },
                        status: 'busy',
                        transparency: 'opaque',
                        visibility: 'private',
                        extendedProperties: {
                            private: {
                                bufferType: 'after',
                                parentAppointmentId: appointment.id,
                                bufferDuration: appointment.buffer_after.toString()
                            }
                        }
                    };
                    bufferEvents.push(afterEvent);
                }
            }

            // Update main appointment event with buffer metadata
            const mainEvent = {
                extendedProperties: {
                    private: {
                        hasBuffers: 'true',
                        bufferBefore: appointment.buffer_before.toString(),
                        bufferAfter: appointment.buffer_after.toString(),
                        effectiveStart: appointment.effective_start.toISOString(),
                        effectiveEnd: appointment.effective_end.toISOString()
                    }
                }
            };

            return {
                bufferEvents,
                mainEventUpdate: mainEvent,
                syncMetadata: {
                    buffersCreated: bufferEvents.length,
                    syncedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            this.auditLogger.log('error', 'SYNC_BUFFERS_TO_CALENDAR_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            throw error;
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Calculate adaptive buffer times based on various factors
     */
    async calculateAdaptiveBuffers(appointment, bufferPrefs) {
        let beforeBuffer = bufferPrefs.beforeAppointment;
        let afterBuffer = bufferPrefs.afterAppointment;

        const factors = bufferPrefs.adaptiveFactors;

        // Adjust based on appointment duration
        if (factors.appointmentDuration) {
            const duration = this.getAppointmentDuration(appointment);
            if (duration > 60) { // Long appointments need more buffer
                beforeBuffer = Math.round(beforeBuffer * 1.5);
                afterBuffer = Math.round(afterBuffer * 1.3);
            } else if (duration < 30) { // Short appointments need less buffer
                beforeBuffer = Math.round(beforeBuffer * 0.8);
                afterBuffer = Math.round(afterBuffer * 0.8);
            }
        }

        // Adjust based on time of day
        if (factors.timeOfDay) {
            const hour = new Date(appointment.start_time).getHours();
            if (hour < 9 || hour > 17) { // Off-hours might need more buffer
                beforeBuffer = Math.round(beforeBuffer * 1.2);
                afterBuffer = Math.round(afterBuffer * 1.2);
            }
        }

        // Adjust based on appointment type
        if (factors.appointmentType && appointment.appointment_type) {
            const typeMultiplier = this.getAppointmentTypeMultiplier(appointment.appointment_type);
            beforeBuffer = Math.round(beforeBuffer * typeMultiplier.before);
            afterBuffer = Math.round(afterBuffer * typeMultiplier.after);
        }

        return { before: beforeBuffer, after: afterBuffer };
    }

    /**
     * Calculate dynamic buffer times based on real-time factors
     */
    async calculateDynamicBuffers(appointment, bufferPrefs, options) {
        // Start with base buffers
        let beforeBuffer = bufferPrefs.beforeAppointment;
        let afterBuffer = bufferPrefs.afterAppointment;

        // Adjust based on provider's schedule density
        if (options.providerSchedule) {
            const density = this.calculateScheduleDensity(options.providerSchedule, appointment);
            if (density > 0.8) { // Busy schedule
                beforeBuffer = Math.round(beforeBuffer * 0.8); // Reduce buffer
                afterBuffer = Math.round(afterBuffer * 0.8);
            } else if (density < 0.4) { // Light schedule
                beforeBuffer = Math.round(beforeBuffer * 1.3); // Increase buffer
                afterBuffer = Math.round(afterBuffer * 1.3);
            }
        }

        // Adjust based on recent appointment history
        if (options.recentHistory) {
            const averageOverrun = this.calculateAverageOverrun(options.recentHistory);
            if (averageOverrun > 10) { // Frequent overruns
                afterBuffer = Math.round(afterBuffer * 1.5);
            }
        }

        return { before: beforeBuffer, after: afterBuffer };
    }

    /**
     * Get appointment duration in minutes
     */
    getAppointmentDuration(appointment) {
        const start = new Date(appointment.start_time);
        const end = new Date(appointment.end_time);
        return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }

    /**
     * Check if two time ranges overlap
     */
    hasTimeOverlap(start1, end1, start2, end2) {
        return start1 < end2 && start2 < end1;
    }

    /**
     * Determine which buffer zone has the conflict
     */
    determineBufferZoneConflict(appointment1, appointment2, buffers2) {
        const apt1Start = new Date(appointment1.start_time);
        const apt1End = new Date(appointment1.end_time);
        const apt2Start = new Date(appointment2.start_time);
        const apt2End = new Date(appointment2.end_time);

        if (apt1Start >= apt2End && apt1Start < buffers2.effective.end) {
            return 'after_buffer';
        } else if (apt1End <= apt2Start && apt1End > buffers2.effective.start) {
            return 'before_buffer';
        } else {
            return 'appointment_overlap';
        }
    }

    /**
     * Calculate conflict severity
     */
    calculateConflictSeverity(appointment1, appointment2, buffers2) {
        // Implementation for conflict severity calculation
        const overlapDuration = this.calculateOverlapDuration(appointment1, appointment2, buffers2);
        
        if (overlapDuration <= 5) return 'low';
        if (overlapDuration <= 15) return 'medium';
        return 'high';
    }

    /**
     * Find available time slots
     */
    async findAvailableTimeSlots(searchStart, searchEnd, duration, existingAppointments, options) {
        const slots = [];
        const current = new Date(searchStart);
        const slotDuration = duration; // minutes

        while (current < searchEnd) {
            const slotEnd = new Date(current.getTime() + (slotDuration * 60000));
            
            // Check if this slot conflicts with existing appointments
            const hasConflict = existingAppointments.some(apt => {
                const aptStart = new Date(apt.effective_start || apt.start_time);
                const aptEnd = new Date(apt.effective_end || apt.end_time);
                return this.hasTimeOverlap(current, slotEnd, aptStart, aptEnd);
            });

            if (!hasConflict && this.isWithinBusinessHours(current, options)) {
                slots.push({
                    start: new Date(current),
                    end: new Date(slotEnd),
                    reasons: ['available_slot']
                });
            }

            // Move to next 15-minute increment
            current.setMinutes(current.getMinutes() + 15);
        }

        return slots;
    }

    /**
     * Score a suggested time slot
     */
    async scoreSuggestion(slot, originalAppointment, options) {
        let score = 100; // Base score

        // Proximity to original time (closer is better)
        const timeDiff = Math.abs(slot.start.getTime() - new Date(originalAppointment.start_time).getTime());
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        score -= hoursDiff * 2; // Reduce score by 2 points per hour difference

        // Preferred time slots
        const hour = slot.start.getHours();
        if (hour >= 9 && hour <= 17) { // Business hours
            score += 10;
        }

        // Day of week preferences
        const dayOfWeek = slot.start.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekdays
            score += 5;
        }

        return Math.max(0, score);
    }

    /**
     * Check if time is within business hours
     */
    isWithinBusinessHours(dateTime, options = {}) {
        const businessHours = options.businessHours || { start: 9, end: 17 };
        const hour = dateTime.getHours();
        const dayOfWeek = dateTime.getDay();
        
        return dayOfWeek >= 1 && dayOfWeek <= 5 && 
               hour >= businessHours.start && hour < businessHours.end;
    }

    /**
     * Get appointment type multiplier for buffer times
     */
    getAppointmentTypeMultiplier(appointmentType) {
        const multipliers = {
            'consultation': { before: 1.0, after: 1.0 },
            'procedure': { before: 1.5, after: 1.3 },
            'surgery': { before: 2.0, after: 1.5 },
            'emergency': { before: 0.5, after: 0.7 },
            'follow-up': { before: 0.8, after: 0.8 },
            'telemedicine': { before: 0.6, after: 0.6 }
        };
        
        return multipliers[appointmentType] || { before: 1.0, after: 1.0 };
    }

    /**
     * Calculate schedule density
     */
    calculateScheduleDensity(schedule, appointment) {
        // Implementation for calculating how busy the schedule is
        const dayStart = new Date(appointment.start_time);
        dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(appointment.start_time);
        dayEnd.setHours(17, 0, 0, 0);
        
        const totalDayMinutes = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
        const bookedMinutes = schedule.reduce((total, apt) => {
            return total + this.getAppointmentDuration(apt);
        }, 0);
        
        return bookedMinutes / totalDayMinutes;
    }

    /**
     * Validate buffer settings
     */
    validateBufferSettings(settings) {
        const required = ['beforeAppointment', 'afterAppointment'];
        for (const field of required) {
            if (settings[field] !== undefined && (typeof settings[field] !== 'number' || settings[field] < 0)) {
                throw new Error(`Invalid ${field}: must be a non-negative number`);
            }
        }

        if (settings.bufferTimeStrategy && !Object.values(this.bufferStrategies).includes(settings.bufferTimeStrategy)) {
            throw new Error(`Invalid bufferTimeStrategy: ${settings.bufferTimeStrategy}`);
        }
    }

    /**
     * Get buffer calculation factors for audit trail
     */
    getBufferCalculationFactors(appointment, bufferPrefs) {
        return {
            baseBuffers: {
                before: bufferPrefs.beforeAppointment,
                after: bufferPrefs.afterAppointment
            },
            strategy: bufferPrefs.bufferTimeStrategy,
            appointmentDuration: this.getAppointmentDuration(appointment),
            appointmentType: appointment.appointment_type,
            timeOfDay: new Date(appointment.start_time).getHours(),
            adaptiveFactorsEnabled: bufferPrefs.adaptiveFactors
        };
    }
}

module.exports = BufferTimeService; 