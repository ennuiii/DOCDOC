/**
 * Alternative Timeslot Suggestion Service
 * Provides intelligent alternative timeslot suggestions when conflicts are detected
 */

const { supabase } = require('../../config/supabase');

class AlternativeTimeslotSuggestionService {
    constructor() {
        this.maxSuggestions = 10;
        this.defaultSearchDays = 14;
        this.businessHours = {
            start: 8, // 8 AM
            end: 18,  // 6 PM
            days: [1, 2, 3, 4, 5] // Monday to Friday
        };
        this.preferredSlotTypes = [
            'morning',   // 8-12
            'afternoon', // 12-17
            'evening'    // 17-19
        ];
        this.timeSlotIncrement = 30; // minutes
        this.minBufferTime = 15; // minutes between appointments
    }

    /**
     * Find alternative timeslots for a conflicted appointment
     * @param {Object} conflictedAppointment - The appointment that has conflicts
     * @param {Array} participants - List of participants to consider
     * @param {Object} options - Search options
     * @returns {Object} Alternative suggestions with scoring
     */
    async findAlternativeTimeslots(conflictedAppointment, participants = [], options = {}) {
        try {
            const {
                daysAhead = this.defaultSearchDays,
                maxSuggestions = this.maxSuggestions,
                preferTimeOfDay = null,
                respectBusinessHours = true,
                includeWeekends = false,
                bufferTime = this.minBufferTime
            } = options;

            console.log(`Finding alternative timeslots for appointment ${conflictedAppointment.id}`);

            // Get participant availability
            const participantAvailability = await this.getParticipantAvailability(participants, daysAhead);

            // Generate candidate timeslots
            const candidateSlots = await this.generateCandidateTimeslots(
                conflictedAppointment, 
                participantAvailability, 
                {
                    daysAhead,
                    respectBusinessHours,
                    includeWeekends,
                    bufferTime,
                    preferTimeOfDay
                }
            );

            // Score and rank suggestions
            const rankedSuggestions = await this.scoreAndRankSuggestions(
                candidateSlots,
                conflictedAppointment,
                participantAvailability,
                options
            );

            // Return top suggestions
            const topSuggestions = rankedSuggestions.slice(0, maxSuggestions);

            return {
                success: true,
                suggestions: topSuggestions,
                participantCount: participants.length,
                searchRange: `${daysAhead} days`,
                originalAppointment: conflictedAppointment,
                metadata: {
                    totalCandidatesEvaluated: candidateSlots.length,
                    averageScore: topSuggestions.reduce((sum, s) => sum + s.score, 0) / topSuggestions.length || 0,
                    searchCriteria: {
                        daysAhead,
                        respectBusinessHours,
                        includeWeekends,
                        bufferTime
                    }
                }
            };

        } catch (error) {
            console.error('Error finding alternative timeslots:', error);
            return {
                success: false,
                error: error.message,
                suggestions: []
            };
        }
    }

    /**
     * Get availability data for all participants
     * @param {Array} participants - List of participants
     * @param {number} daysAhead - Days to look ahead
     * @returns {Object} Participant availability data
     */
    async getParticipantAvailability(participants, daysAhead) {
        const availability = {};
        
        for (const participant of participants) {
            try {
                const calendarData = await this.getParticipantCalendarData(participant, daysAhead);
                availability[participant.id || participant.email] = {
                    ...participant,
                    calendarData,
                    busyTimes: calendarData.busyTimes || [],
                    workingHours: calendarData.workingHours || this.businessHours,
                    preferences: calendarData.preferences || {}
                };

            } catch (error) {
                console.error(`Error getting availability for ${participant.email}:`, error);
                // Set default availability if error
                availability[participant.id || participant.email] = {
                    ...participant,
                    calendarData: { busyTimes: [], workingHours: this.businessHours },
                    busyTimes: [],
                    workingHours: this.businessHours,
                    preferences: {}
                };
            }
        }

        return availability;
    }

    /**
     * Get calendar data for a specific participant
     * @param {Object} participant - Participant object
     * @param {number} daysAhead - Days to look ahead
     * @returns {Object} Calendar data including busy times
     */
    async getParticipantCalendarData(participant, daysAhead) {
        try {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + daysAhead);

            // Get participant's integrations
            const { data: integrations } = await supabase
                .from('integrations')
                .select('*')
                .eq('user_id', participant.id || participant.user_id)
                .eq('status', 'connected');

            let allBusyTimes = [];

            // Fetch calendar data from each integration
            for (const integration of integrations || []) {
                try {
                    const calendarData = await this.fetchProviderCalendarData(integration, startDate, endDate);
                    allBusyTimes = allBusyTimes.concat(calendarData.busyTimes || []);
                } catch (error) {
                    console.error(`Error fetching from ${integration.provider}:`, error);
                }
            }

            // Merge overlapping busy times
            const mergedBusyTimes = this.mergeBusyTimes(allBusyTimes);

            // Calculate availability score
            const availabilityScore = this.calculateAvailabilityScore({
                busyTimes: mergedBusyTimes,
                searchPeriod: { startDate, endDate }
            });

            return {
                busyTimes: mergedBusyTimes,
                workingHours: participant.workingHours || this.businessHours,
                preferences: participant.preferences || {},
                availabilityScore,
                lastUpdated: new Date()
            };

        } catch (error) {
            console.error('Error getting participant calendar data:', error);
            return {
                busyTimes: [],
                workingHours: this.businessHours,
                preferences: {},
                availabilityScore: 0.5,
                lastUpdated: new Date()
            };
        }
    }

    /**
     * Fetch calendar data from a specific provider
     * @param {Object} integration - Integration configuration
     * @param {Date} startDate - Start date for search
     * @param {Date} endDate - End date for search
     * @returns {Object} Calendar data from provider
     */
    async fetchProviderCalendarData(integration, startDate, endDate) {
        // This would integrate with the actual provider services
        // For now, return mock data structure
        return {
            busyTimes: [],
            events: [],
            lastSync: new Date()
        };
    }

    /**
     * Merge overlapping busy time periods
     * @param {Array} busyTimes - Array of busy time periods
     * @returns {Array} Merged busy time periods
     */
    mergeBusyTimes(busyTimes) {
        if (busyTimes.length === 0) return [];

        // Sort by start time
        const sorted = busyTimes.sort((a, b) => new Date(a.start) - new Date(b.start));
        const merged = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const lastMerged = merged[merged.length - 1];

            if (new Date(current.start) <= new Date(lastMerged.end)) {
                // Overlapping periods, merge them
                lastMerged.end = new Date(Math.max(
                    new Date(lastMerged.end).getTime(),
                    new Date(current.end).getTime()
                )).toISOString();
            } else {
                // Non-overlapping period, add to merged list
                merged.push(current);
            }
        }

        return merged;
    }

    /**
     * Calculate availability score for a participant
     * @param {Object} calendarData - Calendar data including busy times
     * @returns {number} Availability score (0-1)
     */
    calculateAvailabilityScore(calendarData) {
        const { busyTimes, searchPeriod } = calendarData;
        const totalSearchHours = (new Date(searchPeriod.endDate) - new Date(searchPeriod.startDate)) / (1000 * 60 * 60);
        const busyHours = busyTimes.reduce((total, busy) => {
            return total + (new Date(busy.end) - new Date(busy.start)) / (1000 * 60 * 60);
        }, 0);

        return Math.max(0, Math.min(1, 1 - (busyHours / totalSearchHours)));
    }

    /**
     * Generate candidate timeslots based on constraints
     * @param {Object} appointment - Original appointment
     * @param {Object} participantAvailability - Participant availability data
     * @param {Object} options - Generation options
     * @returns {Array} Array of candidate timeslots
     */
    async generateCandidateTimeslots(appointment, participantAvailability, options) {
        const candidates = [];
        const originalStart = new Date(appointment.start_time || appointment.start?.dateTime);
        const duration = appointment.duration || 60; // minutes

        // Generate time slots for each day in the search range
        for (let day = 1; day <= options.daysAhead; day++) {
            const searchDate = new Date(originalStart);
            searchDate.setDate(searchDate.getDate() + day);

            // Skip weekends if not included
            if (!options.includeWeekends && (searchDate.getDay() === 0 || searchDate.getDay() === 6)) {
                continue;
            }

            const daySlots = this.generateDaySlots(searchDate, duration, options);
            
            // Filter slots that work for all participants
            const availableSlots = daySlots.filter(slot => 
                this.isSlotAvailableForAllParticipants(slot, participantAvailability)
            );

            candidates.push(...availableSlots);
        }

        return candidates;
    }

    /**
     * Generate time slots for a specific day
     * @param {Date} date - Target date
     * @param {number} duration - Appointment duration in minutes
     * @param {Object} options - Generation options
     * @returns {Array} Time slots for the day
     */
    generateDaySlots(date, duration, options) {
        const slots = [];
        const { respectBusinessHours, bufferTime } = options;

        let startHour = respectBusinessHours ? this.businessHours.start : 0;
        let endHour = respectBusinessHours ? this.businessHours.end : 24;

        // Generate slots in increments
        for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += this.timeSlotIncrement) {
                const slotStart = new Date(date);
                slotStart.setHours(hour, minute, 0, 0);

                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + duration + bufferTime);

                // Check if slot fits within the day
                if (slotEnd.getHours() < endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() === 0)) {
                    slots.push({
                        start: slotStart.toISOString(),
                        end: slotEnd.toISOString(),
                        duration,
                        timeOfDay: this.categorizeTimeOfDay(slotStart)
                    });
                }
            }
        }

        return slots;
    }

    /**
     * Check if a slot is available for all participants
     * @param {Object} slot - Time slot to check
     * @param {Object} participantAvailability - Participant availability data
     * @returns {boolean} True if available for all participants
     */
    isSlotAvailableForAllParticipants(slot, participantAvailability) {
        for (const participantId of Object.keys(participantAvailability)) {
            if (!this.isSlotAvailableForParticipant(slot, participantAvailability[participantId])) {
                return false;
            }
        }
        return true;
    }

    /**
     * Check if a slot is available for a specific participant
     * @param {Object} slot - Time slot to check
     * @param {Object} availability - Participant availability data
     * @returns {boolean} True if available for the participant
     */
    isSlotAvailableForParticipant(slot, availability) {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);

        // Check against busy times
        for (const busyTime of availability.busyTimes || []) {
            const busyStart = new Date(busyTime.start);
            const busyEnd = new Date(busyTime.end);

            // Check for overlap
            if (slotStart < busyEnd && slotEnd > busyStart) {
                return false;
            }
        }

        // Check working hours if specified
        if (availability.workingHours) {
            const { start: workStart, end: workEnd, days: workDays } = availability.workingHours;
            const dayOfWeek = slotStart.getDay();
            const hourOfDay = slotStart.getHours();

            if (workDays && !workDays.includes(dayOfWeek)) {
                return false;
            }

            if (hourOfDay < workStart || hourOfDay >= workEnd) {
                return false;
            }
        }

        return true;
    }

    /**
     * Score and rank alternative suggestions
     * @param {Array} candidates - Candidate timeslots
     * @param {Object} originalAppointment - Original appointment data
     * @param {Object} participantAvailability - Participant availability
     * @param {Object} options - Scoring options
     * @returns {Array} Ranked suggestions with scores
     */
    async scoreAndRankSuggestions(candidates, originalAppointment, participantAvailability, options) {
        const scoredCandidates = [];

        for (const candidate of candidates) {
            const score = await this.calculateSuggestionScore(
                candidate,
                originalAppointment,
                participantAvailability,
                options
            );

            scoredCandidates.push({
                ...candidate,
                score,
                reasoning: this.generateSuggestionReasoning(candidate)
            });
        }

        // Sort by score descending
        return scoredCandidates.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate suggestion score based on various factors
     * @param {Object} candidate - Candidate timeslot
     * @param {Object} originalAppointment - Original appointment
     * @param {Object} participantAvailability - Participant availability
     * @param {Object} options - Scoring options
     * @returns {number} Score (0-1)
     */
    async calculateSuggestionScore(candidate, originalAppointment, participantAvailability, options) {
        let score = 0;
        let factors = 0;

        // Factor 1: Proximity to original time (30% weight)
        const originalTime = new Date(originalAppointment.start_time || originalAppointment.start?.dateTime);
        const candidateTime = new Date(candidate.start);
        const timeDifferenceHours = Math.abs(candidateTime - originalTime) / (1000 * 60 * 60);
        const proximityScore = Math.max(0, 1 - (timeDifferenceHours / (24 * 7))); // Decay over week
        score += proximityScore * 0.3;
        factors++;

        // Factor 2: Time of day preference (20% weight)
        const timeOfDayScore = this.scoreTimeOfDay(candidate, options.preferTimeOfDay);
        score += timeOfDayScore * 0.2;
        factors++;

        // Factor 3: Participant availability quality (30% weight)
        const participantScore = this.scoreParticipantAvailability(candidate, participantAvailability);
        score += participantScore * 0.3;
        factors++;

        // Factor 4: Business hours alignment (20% weight)
        const businessHoursScore = this.scoreBusinessHoursAlignment(candidate);
        score += businessHoursScore * 0.2;
        factors++;

        return score / factors;
    }

    /**
     * Format datetime for display
     * @param {string} datetime - ISO datetime string
     * @returns {string} Formatted datetime
     */
    formatDateTime(datetime) {
        return new Date(datetime).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    /**
     * Generate reasoning text for a suggestion
     * @param {Object} suggestion - Suggestion object
     * @returns {string} Human-readable reasoning
     */
    generateSuggestionReasoning(suggestion) {
        const reasons = [];
        
        if (suggestion.score > 0.8) {
            reasons.push('Excellent match for all participants');
        } else if (suggestion.score > 0.6) {
            reasons.push('Good alternative with minor trade-offs');
        } else {
            reasons.push('Available option with some compromises');
        }

        if (suggestion.timeOfDay === 'morning') {
            reasons.push('Morning slot typically has high attendance');
        } else if (suggestion.timeOfDay === 'afternoon') {
            reasons.push('Afternoon timing works well for most schedules');
        }

        return reasons.join('. ') + '.';
    }

    /**
     * Find alternative timeslots for multiple conflicted appointments
     * @param {Array} conflictedAppointments - Multiple appointments with conflicts
     * @param {Object} options - Search options
     * @returns {Object} Bulk alternative suggestions
     */
    async findBulkAlternativeTimeslots(conflictedAppointments, options = {}) {
        const results = {};
        
        for (const appointment of conflictedAppointments) {
            const participants = appointment.participants || [];
            results[appointment.id] = await this.findAlternativeTimeslots(
                appointment,
                participants,
                options
            );
        }

        return {
            success: true,
            results,
            totalAppointments: conflictedAppointments.length,
            successfulResults: Object.values(results).filter(r => r.success).length
        };
    }

    // Helper methods for scoring
    categorizeTimeOfDay(date) {
        const hour = date.getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }

    scoreTimeOfDay(candidate, preferTimeOfDay) {
        if (!preferTimeOfDay) return 0.5;
        return candidate.timeOfDay === preferTimeOfDay ? 1 : 0.3;
    }

    scoreParticipantAvailability(candidate, participantAvailability) {
        const participants = Object.values(participantAvailability);
        if (participants.length === 0) return 1;

        const avgAvailabilityScore = participants.reduce((sum, p) => 
            sum + (p.availabilityScore || 0.5), 0) / participants.length;
        
        return avgAvailabilityScore;
    }

    scoreBusinessHoursAlignment(candidate) {
        const hour = new Date(candidate.start).getHours();
        const { start, end } = this.businessHours;
        
        if (hour >= start && hour < end) return 1;
        if (hour >= start - 1 || hour < end + 1) return 0.7;
        return 0.3;
    }
}

module.exports = AlternativeTimeslotSuggestionService;
