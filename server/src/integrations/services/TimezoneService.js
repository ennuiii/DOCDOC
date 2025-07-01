/**
 * Timezone Service
 * Handles comprehensive timezone conversion and management for global users
 */

const { createClient } = require('@supabase/supabase-js');
const AuditLogger = require('./AuditLogger');

class TimezoneService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        
        // Cache for timezone data to reduce API calls
        this.timezoneCache = new Map();
        this.cacheExpiryTime = 24 * 60 * 60 * 1000; // 24 hours
        
        // Common timezone mappings
        this.commonTimezones = {
            'UTC': 'UTC',
            'EST': 'America/New_York',
            'PST': 'America/Los_Angeles',
            'CST': 'America/Chicago',
            'MST': 'America/Denver',
            'GMT': 'Europe/London',
            'CET': 'Europe/Paris',
            'JST': 'Asia/Tokyo',
            'IST': 'Asia/Kolkata',
            'AEST': 'Australia/Sydney'
        };

        // Initialize Intl.DateTimeFormat instances for common timezones
        this.formatters = new Map();
        this.initializeFormatters();
    }

    /**
     * Initialize timezone formatters for common operations
     */
    initializeFormatters() {
        const commonTimezones = [
            'UTC',
            'America/New_York',
            'America/Los_Angeles',
            'America/Chicago',
            'Europe/London',
            'Europe/Paris',
            'Asia/Tokyo',
            'Asia/Kolkata'
        ];

        commonTimezones.forEach(timezone => {
            this.formatters.set(timezone, new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }));
        });
    }

    /**
     * Convert datetime from one timezone to another
     * @param {string|Date} datetime - Input datetime
     * @param {string} fromTimezone - Source timezone
     * @param {string} toTimezone - Target timezone
     * @returns {Object} Conversion result with datetime and timezone info
     */
    async convertTimezone(datetime, fromTimezone, toTimezone) {
        try {
            // Normalize input datetime
            const sourceDate = new Date(datetime);
            if (isNaN(sourceDate.getTime())) {
                throw new Error('Invalid datetime provided');
            }

            // Normalize timezone names
            const normalizedFromTz = this.normalizeTimezone(fromTimezone);
            const normalizedToTz = this.normalizeTimezone(toTimezone);

            // Get timezone information
            const [fromTzInfo, toTzInfo] = await Promise.all([
                this.getTimezoneInfo(normalizedFromTz, sourceDate),
                this.getTimezoneInfo(normalizedToTz, sourceDate)
            ]);

            // Create date objects with proper timezone handling
            const sourceDateTime = this.createTimezoneAwareDate(sourceDate, normalizedFromTz);
            const targetDateTime = this.createTimezoneAwareDate(sourceDate, normalizedToTz);

            // Calculate the conversion
            const convertedDate = new Date(sourceDate.getTime());
            
            // Apply timezone offset differences
            const offsetDifference = fromTzInfo.offset - toTzInfo.offset;
            convertedDate.setMinutes(convertedDate.getMinutes() + offsetDifference);

            return {
                original: {
                    datetime: sourceDate.toISOString(),
                    timezone: normalizedFromTz,
                    offset: fromTzInfo.offset,
                    isDST: fromTzInfo.isDST,
                    displayTime: this.formatDateForTimezone(sourceDate, normalizedFromTz)
                },
                converted: {
                    datetime: convertedDate.toISOString(),
                    timezone: normalizedToTz,
                    offset: toTzInfo.offset,
                    isDST: toTzInfo.isDST,
                    displayTime: this.formatDateForTimezone(convertedDate, normalizedToTz)
                },
                conversionMetadata: {
                    offsetDifference,
                    crossesDSTBoundary: fromTzInfo.isDST !== toTzInfo.isDST,
                    convertedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            this.auditLogger.log('error', 'TIMEZONE_CONVERSION_ERROR', {
                datetime,
                fromTimezone,
                toTimezone,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get comprehensive timezone information for a specific date
     * @param {string} timezone - Timezone identifier
     * @param {Date} date - Date to get timezone info for
     * @returns {Object} Timezone information
     */
    async getTimezoneInfo(timezone, date = new Date()) {
        try {
            const cacheKey = `${timezone}-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            
            // Check cache first
            if (this.timezoneCache.has(cacheKey)) {
                const cached = this.timezoneCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheExpiryTime) {
                    return cached.data;
                }
            }

            const normalizedTz = this.normalizeTimezone(timezone);
            
            // Get timezone offset and DST information
            const tempDate = new Date(date.getTime());
            const utcTime = tempDate.getTime() + (tempDate.getTimezoneOffset() * 60000);
            
            // Create date in target timezone
            const tzDate = new Date(utcTime + this.getTimezoneOffset(normalizedTz, date));
            
            // Check if DST is active
            const january = new Date(date.getFullYear(), 0, 1);
            const july = new Date(date.getFullYear(), 6, 1);
            const janOffset = this.getTimezoneOffset(normalizedTz, january);
            const julOffset = this.getTimezoneOffset(normalizedTz, july);
            
            const isDST = this.getTimezoneOffset(normalizedTz, date) !== Math.max(janOffset, julOffset);
            
            const tzInfo = {
                timezone: normalizedTz,
                offset: this.getTimezoneOffset(normalizedTz, date) / 60000, // Convert to minutes
                isDST,
                abbreviation: this.getTimezoneAbbreviation(normalizedTz, date),
                name: this.getTimezoneName(normalizedTz),
                utcOffset: this.formatUTCOffset(this.getTimezoneOffset(normalizedTz, date) / 60000),
                localTime: this.formatDateForTimezone(date, normalizedTz),
                dstInfo: {
                    observesDST: janOffset !== julOffset,
                    standardOffset: Math.max(janOffset, julOffset) / 60000,
                    dstOffset: Math.min(janOffset, julOffset) / 60000
                }
            };

            // Cache the result
            this.timezoneCache.set(cacheKey, {
                data: tzInfo,
                timestamp: Date.now()
            });

            return tzInfo;

        } catch (error) {
            this.auditLogger.log('error', 'TIMEZONE_INFO_ERROR', {
                timezone,
                date: date.toISOString(),
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get user's timezone preferences
     * @param {string} userId - User ID
     * @returns {Object} User timezone preferences
     */
    async getUserTimezonePreferences(userId) {
        try {
            const { data: preferences } = await this.supabase
                .from('user_preferences')
                .select('timezone_settings')
                .eq('user_id', userId)
                .single();

            if (!preferences?.timezone_settings) {
                // Return default preferences if none exist
                return this.getDefaultTimezonePreferences();
            }

            return {
                ...this.getDefaultTimezonePreferences(),
                ...preferences.timezone_settings
            };

        } catch (error) {
            this.auditLogger.log('error', 'USER_TIMEZONE_PREFERENCES_ERROR', {
                userId,
                error: error.message
            });
            return this.getDefaultTimezonePreferences();
        }
    }

    /**
     * Update user's timezone preferences
     * @param {string} userId - User ID
     * @param {Object} preferences - Timezone preferences
     */
    async updateUserTimezonePreferences(userId, preferences) {
        try {
            // Validate preferences
            this.validateTimezonePreferences(preferences);

            // Update in database
            const { error } = await this.supabase
                .from('user_preferences')
                .upsert({
                    user_id: userId,
                    timezone_settings: {
                        ...this.getDefaultTimezonePreferences(),
                        ...preferences,
                        updatedAt: new Date().toISOString()
                    }
                }, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                });

            if (error) throw error;

            this.auditLogger.log('info', 'USER_TIMEZONE_PREFERENCES_UPDATED', {
                userId,
                preferences
            });

            return true;

        } catch (error) {
            this.auditLogger.log('error', 'USER_TIMEZONE_PREFERENCES_UPDATE_ERROR', {
                userId,
                preferences,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Auto-detect user timezone from various sources
     * @param {Object} context - Context for timezone detection
     * @returns {Object} Detected timezone information
     */
    async autoDetectTimezone(context = {}) {
        try {
            const detectionMethods = [];

            // Method 1: Use client-provided timezone offset
            if (context.timezoneOffset !== undefined) {
                const offsetTimezone = this.getTimezoneFromOffset(context.timezoneOffset);
                if (offsetTimezone) {
                    detectionMethods.push({
                        method: 'client_offset',
                        timezone: offsetTimezone,
                        confidence: 0.7
                    });
                }
            }

            // Method 2: Use Intl.DateTimeFormat if available in context
            if (context.intlTimezone) {
                detectionMethods.push({
                    method: 'intl_api',
                    timezone: context.intlTimezone,
                    confidence: 0.9
                });
            }

            // Method 3: Use IP geolocation if available
            if (context.country && context.region) {
                const geoTimezone = this.getTimezoneFromGeolocation(context.country, context.region);
                if (geoTimezone) {
                    detectionMethods.push({
                        method: 'geolocation',
                        timezone: geoTimezone,
                        confidence: 0.8
                    });
                }
            }

            // Method 4: Use user's previous selections
            if (context.userId) {
                const userPrefs = await this.getUserTimezonePreferences(context.userId);
                if (userPrefs.timezone) {
                    detectionMethods.push({
                        method: 'user_preference',
                        timezone: userPrefs.timezone,
                        confidence: 0.95
                    });
                }
            }

            // Sort by confidence and return the best match
            detectionMethods.sort((a, b) => b.confidence - a.confidence);

            const bestMatch = detectionMethods[0] || {
                method: 'default',
                timezone: 'UTC',
                confidence: 0.5
            };

            // Get full timezone information for the detected timezone
            const timezoneInfo = await this.getTimezoneInfo(bestMatch.timezone);

            return {
                detected: bestMatch,
                alternativesConsidered: detectionMethods.slice(1),
                timezoneInfo,
                detectedAt: new Date().toISOString()
            };

        } catch (error) {
            this.auditLogger.log('error', 'TIMEZONE_AUTO_DETECTION_ERROR', {
                context,
                error: error.message
            });

            // Return UTC as fallback
            return {
                detected: {
                    method: 'fallback',
                    timezone: 'UTC',
                    confidence: 0.5
                },
                timezoneInfo: await this.getTimezoneInfo('UTC'),
                error: error.message
            };
        }
    }

    /**
     * Convert appointment times for different user timezones
     * @param {Object} appointment - Appointment data
     * @param {string} userTimezone - User's timezone
     * @returns {Object} Appointment with converted times
     */
    async convertAppointmentTimezone(appointment, userTimezone) {
        try {
            const convertedAppointment = { ...appointment };

            // Convert start time
            if (appointment.start_time) {
                const startConversion = await this.convertTimezone(
                    appointment.start_time,
                    appointment.timezone || 'UTC',
                    userTimezone
                );
                convertedAppointment.start_time_user_tz = startConversion.converted.datetime;
                convertedAppointment.start_time_display = startConversion.converted.displayTime;
            }

            // Convert end time
            if (appointment.end_time) {
                const endConversion = await this.convertTimezone(
                    appointment.end_time,
                    appointment.timezone || 'UTC',
                    userTimezone
                );
                convertedAppointment.end_time_user_tz = endConversion.converted.datetime;
                convertedAppointment.end_time_display = endConversion.converted.displayTime;
            }

            // Add timezone metadata
            convertedAppointment.timezone_metadata = {
                original_timezone: appointment.timezone || 'UTC',
                user_timezone: userTimezone,
                converted_at: new Date().toISOString()
            };

            return convertedAppointment;

        } catch (error) {
            this.auditLogger.log('error', 'APPOINTMENT_TIMEZONE_CONVERSION_ERROR', {
                appointmentId: appointment.id,
                userTimezone,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Handle DST transitions for recurring appointments
     * @param {Object} recurringAppointment - Recurring appointment data
     * @param {Date} startDate - Start date for checking
     * @param {Date} endDate - End date for checking
     * @returns {Array} Array of appointment instances with DST adjustments
     */
    async handleDSTTransitions(recurringAppointment, startDate, endDate) {
        try {
            const instances = [];
            const timezone = recurringAppointment.timezone || 'UTC';
            
            // Generate all instances between start and end dates
            const currentDate = new Date(startDate);
            
            while (currentDate <= endDate) {
                // Check if DST transition affects this instance
                const instanceDate = new Date(currentDate);
                const originalTime = new Date(recurringAppointment.start_time);
                
                // Set the date while preserving time
                instanceDate.setHours(originalTime.getHours());
                instanceDate.setMinutes(originalTime.getMinutes());
                instanceDate.setSeconds(originalTime.getSeconds());

                // Get timezone info for this specific date
                const tzInfo = await this.getTimezoneInfo(timezone, instanceDate);
                
                // Calculate if DST transition occurred
                const baseDate = new Date(recurringAppointment.start_time);
                const baseTzInfo = await this.getTimezoneInfo(timezone, baseDate);
                
                const dstAdjustment = tzInfo.offset - baseTzInfo.offset;

                // Create appointment instance with DST adjustment
                const adjustedStartTime = new Date(instanceDate.getTime() - (dstAdjustment * 60000));
                const adjustedEndTime = new Date(adjustedStartTime.getTime() + 
                    (new Date(recurringAppointment.end_time).getTime() - new Date(recurringAppointment.start_time).getTime()));

                instances.push({
                    ...recurringAppointment,
                    id: `${recurringAppointment.id}-${instanceDate.toISOString().split('T')[0]}`,
                    start_time: adjustedStartTime.toISOString(),
                    end_time: adjustedEndTime.toISOString(),
                    instance_date: instanceDate.toISOString().split('T')[0],
                    dst_metadata: {
                        base_offset: baseTzInfo.offset,
                        instance_offset: tzInfo.offset,
                        dst_adjustment_minutes: dstAdjustment,
                        crosses_dst_boundary: dstAdjustment !== 0
                    }
                });

                // Move to next recurrence
                currentDate.setDate(currentDate.getDate() + this.getRecurrenceIncrement(recurringAppointment.recurrence_pattern));
            }

            return instances;

        } catch (error) {
            this.auditLogger.log('error', 'DST_TRANSITION_HANDLING_ERROR', {
                recurringAppointmentId: recurringAppointment.id,
                error: error.message
            });
            throw error;
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Normalize timezone identifier
     */
    normalizeTimezone(timezone) {
        if (!timezone) return 'UTC';
        
        // Check if it's a common abbreviation
        if (this.commonTimezones[timezone.toUpperCase()]) {
            return this.commonTimezones[timezone.toUpperCase()];
        }
        
        return timezone;
    }

    /**
     * Get timezone offset in milliseconds
     */
    getTimezoneOffset(timezone, date) {
        try {
            const utcDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
            const tzDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }));
            return tzDate.getTime() - utcDate.getTime();
        } catch (error) {
            return 0; // Default to UTC if timezone is invalid
        }
    }

    /**
     * Format date for specific timezone
     */
    formatDateForTimezone(date, timezone) {
        try {
            let formatter = this.formatters.get(timezone);
            if (!formatter) {
                formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                this.formatters.set(timezone, formatter);
            }
            
            return formatter.format(date);
        } catch (error) {
            return date.toISOString();
        }
    }

    /**
     * Get timezone abbreviation
     */
    getTimezoneAbbreviation(timezone, date) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'short'
            });
            
            const parts = formatter.formatToParts(date);
            const timeZonePart = parts.find(part => part.type === 'timeZoneName');
            return timeZonePart ? timeZonePart.value : timezone;
        } catch (error) {
            return timezone;
        }
    }

    /**
     * Get timezone display name
     */
    getTimezoneName(timezone) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'long'
            });
            
            const parts = formatter.formatToParts(new Date());
            const timeZonePart = parts.find(part => part.type === 'timeZoneName');
            return timeZonePart ? timeZonePart.value : timezone;
        } catch (error) {
            return timezone;
        }
    }

    /**
     * Format UTC offset
     */
    formatUTCOffset(offsetMinutes) {
        const hours = Math.floor(Math.abs(offsetMinutes) / 60);
        const minutes = Math.abs(offsetMinutes) % 60;
        const sign = offsetMinutes >= 0 ? '+' : '-';
        return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Create timezone-aware date
     */
    createTimezoneAwareDate(date, timezone) {
        try {
            const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
            const offset = this.getTimezoneOffset(timezone, date);
            return new Date(utcTime + offset);
        } catch (error) {
            return date;
        }
    }

    /**
     * Get default timezone preferences
     */
    getDefaultTimezonePreferences() {
        return {
            timezone: 'UTC',
            autoDetect: true,
            use24HourFormat: true,
            showTimezoneInDates: true,
            dstNotifications: true,
            preferredDateFormat: 'YYYY-MM-DD',
            preferredTimeFormat: 'HH:mm'
        };
    }

    /**
     * Validate timezone preferences
     */
    validateTimezonePreferences(preferences) {
        const required = ['timezone'];
        for (const field of required) {
            if (!preferences[field]) {
                throw new Error(`Missing required timezone preference: ${field}`);
            }
        }
        
        // Validate timezone
        try {
            this.getTimezoneInfo(preferences.timezone);
        } catch (error) {
            throw new Error(`Invalid timezone: ${preferences.timezone}`);
        }
    }

    /**
     * Get timezone from offset
     */
    getTimezoneFromOffset(offsetMinutes) {
        // This is a simplified mapping - in production, you'd use a more comprehensive database
        const offsetMap = {
            0: 'UTC',
            -300: 'America/New_York', // EST
            -480: 'America/Los_Angeles', // PST
            60: 'Europe/London', // GMT+1
            120: 'Europe/Paris', // CET
            330: 'Asia/Kolkata', // IST
            540: 'Asia/Tokyo' // JST
        };
        
        return offsetMap[offsetMinutes] || null;
    }

    /**
     * Get timezone from geolocation
     */
    getTimezoneFromGeolocation(country, region) {
        // Simplified geolocation mapping
        const geoMap = {
            'US': {
                'NY': 'America/New_York',
                'CA': 'America/Los_Angeles',
                'TX': 'America/Chicago',
                'default': 'America/New_York'
            },
            'GB': { 'default': 'Europe/London' },
            'DE': { 'default': 'Europe/Berlin' },
            'FR': { 'default': 'Europe/Paris' },
            'JP': { 'default': 'Asia/Tokyo' },
            'IN': { 'default': 'Asia/Kolkata' },
            'AU': { 'default': 'Australia/Sydney' }
        };
        
        const countryMap = geoMap[country];
        if (!countryMap) return null;
        
        return countryMap[region] || countryMap.default;
    }

    /**
     * Get recurrence increment in days
     */
    getRecurrenceIncrement(pattern) {
        switch (pattern) {
            case 'daily': return 1;
            case 'weekly': return 7;
            case 'monthly': return 30; // Simplified
            case 'yearly': return 365; // Simplified
            default: return 1;
        }
    }
}

module.exports = TimezoneService;
