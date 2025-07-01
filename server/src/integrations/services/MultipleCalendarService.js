/**
 * Multiple Calendar Service
 * Handles user selection and management of multiple Google calendars for sync
 */

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const AuditLogger = require('./AuditLogger');
const GoogleCalendarSyncService = require('./GoogleCalendarSyncService');
const TimezoneService = require('./TimezoneService');

class MultipleCalendarService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        this.syncService = new GoogleCalendarSyncService();
        this.timezoneService = new TimezoneService();
        
        // Cache for calendar lists to reduce API calls
        this.calendarListCache = new Map();
        this.cacheExpiryTime = 60 * 60 * 1000; // 1 hour
        
        // Default calendar selection preferences
        this.defaultPreferences = {
            syncPrimaryCalendar: true,
            syncSecondaryCalendars: false,
            excludeReadOnlyCalendars: true,
            syncDirection: 'bidirectional', // bidirectional, toGoogle, fromGoogle
            conflictResolution: 'user_choice',
            autoSelectNewCalendars: false
        };
    }

    /**
     * Get all available calendars for a user
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} options - Fetch options
     * @returns {Array} List of available calendars
     */
    async getAllAvailableCalendars(userId, integrationId, options = {}) {
        try {
            // Check cache first
            const cacheKey = `${userId}-${integrationId}`;
            if (this.calendarListCache.has(cacheKey)) {
                const cached = this.calendarListCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheExpiryTime) {
                    return cached.data;
                }
            }

            // Get user's OAuth tokens
            const { data: integration } = await this.supabase
                .from('user_integrations')
                .select('*')
                .eq('id', integrationId)
                .eq('user_id', userId)
                .single();

            if (!integration || !integration.access_token) {
                throw new Error('Invalid or missing integration credentials');
            }

            // Initialize Google Calendar API
            const auth = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            auth.setCredentials({
                access_token: integration.access_token,
                refresh_token: integration.refresh_token
            });

            const calendar = google.calendar({ version: 'v3', auth });

            // Get calendar list
            const response = await calendar.calendarList.list({
                maxResults: options.maxResults || 250,
                minAccessRole: options.minAccessRole || 'reader',
                showDeleted: false,
                showHidden: options.showHidden || false
            });

            const calendars = response.data.items || [];
            
            // Enhance calendar data with additional information
            const enhancedCalendars = await Promise.all(calendars.map(async (cal) => {
                const calendarInfo = await this.enhanceCalendarInfo(cal, calendar, userId);
                return calendarInfo;
            }));

            // Sort calendars by priority (primary first, then by name)
            enhancedCalendars.sort((a, b) => {
                if (a.primary && !b.primary) return -1;
                if (!a.primary && b.primary) return 1;
                return a.summary.localeCompare(b.summary);
            });

            // Cache the result
            this.calendarListCache.set(cacheKey, {
                data: enhancedCalendars,
                timestamp: Date.now()
            });

            this.auditLogger.log('info', 'CALENDARS_FETCHED', {
                userId,
                integrationId,
                calendarCount: enhancedCalendars.length
            });

            return enhancedCalendars;

        } catch (error) {
            this.auditLogger.log('error', 'FETCH_CALENDARS_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get user's selected calendars for sync
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @returns {Array} List of selected calendars
     */
    async getSelectedCalendars(userId, integrationId) {
        try {
            const { data: selections } = await this.supabase
                .from('user_calendar_selections')
                .select(`
                    *,
                    calendar_metadata
                `)
                .eq('user_id', userId)
                .eq('integration_id', integrationId)
                .eq('is_active', true);

            return selections || [];

        } catch (error) {
            this.auditLogger.log('error', 'GET_SELECTED_CALENDARS_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update user's calendar selections
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Array} calendarSelections - Array of calendar selection objects
     * @returns {Object} Update result
     */
    async updateCalendarSelections(userId, integrationId, calendarSelections) {
        try {
            // Validate calendar selections
            this.validateCalendarSelections(calendarSelections);

            // Begin transaction
            const { data: existingSelections } = await this.supabase
                .from('user_calendar_selections')
                .select('calendar_id')
                .eq('user_id', userId)
                .eq('integration_id', integrationId);

            const existingCalendarIds = new Set(existingSelections?.map(s => s.calendar_id) || []);
            const newCalendarIds = new Set(calendarSelections.map(s => s.calendar_id));

            // Determine calendars to add, update, and remove
            const toAdd = calendarSelections.filter(s => !existingCalendarIds.has(s.calendar_id));
            const toUpdate = calendarSelections.filter(s => existingCalendarIds.has(s.calendar_id));
            const toRemove = Array.from(existingCalendarIds).filter(id => !newCalendarIds.has(id));

            const results = {
                added: [],
                updated: [],
                removed: [],
                errors: []
            };

            // Add new calendar selections
            for (const selection of toAdd) {
                try {
                    const { data: inserted } = await this.supabase
                        .from('user_calendar_selections')
                        .insert({
                            user_id: userId,
                            integration_id: integrationId,
                            calendar_id: selection.calendar_id,
                            calendar_name: selection.calendar_name,
                            sync_direction: selection.sync_direction || 'bidirectional',
                            conflict_resolution: selection.conflict_resolution || 'user_choice',
                            is_active: true,
                            sync_preferences: selection.sync_preferences || {},
                            calendar_metadata: selection.calendar_metadata || {},
                            created_at: new Date().toISOString()
                        })
                        .select()
                        .single();

                    results.added.push(inserted);
                } catch (error) {
                    results.errors.push({
                        action: 'add',
                        calendar_id: selection.calendar_id,
                        error: error.message
                    });
                }
            }

            // Update existing calendar selections
            for (const selection of toUpdate) {
                try {
                    const { data: updated } = await this.supabase
                        .from('user_calendar_selections')
                        .update({
                            calendar_name: selection.calendar_name,
                            sync_direction: selection.sync_direction,
                            conflict_resolution: selection.conflict_resolution,
                            sync_preferences: selection.sync_preferences || {},
                            calendar_metadata: selection.calendar_metadata || {},
                            updated_at: new Date().toISOString()
                        })
                        .eq('user_id', userId)
                        .eq('integration_id', integrationId)
                        .eq('calendar_id', selection.calendar_id)
                        .select()
                        .single();

                    results.updated.push(updated);
                } catch (error) {
                    results.errors.push({
                        action: 'update',
                        calendar_id: selection.calendar_id,
                        error: error.message
                    });
                }
            }

            // Remove unselected calendars
            for (const calendarId of toRemove) {
                try {
                    const { data: removed } = await this.supabase
                        .from('user_calendar_selections')
                        .update({
                            is_active: false,
                            updated_at: new Date().toISOString()
                        })
                        .eq('user_id', userId)
                        .eq('integration_id', integrationId)
                        .eq('calendar_id', calendarId)
                        .select()
                        .single();

                    results.removed.push(removed);
                } catch (error) {
                    results.errors.push({
                        action: 'remove',
                        calendar_id: calendarId,
                        error: error.message
                    });
                }
            }

            // Clear cache to force refresh
            const cacheKey = `${userId}-${integrationId}`;
            this.calendarListCache.delete(cacheKey);

            this.auditLogger.log('info', 'CALENDAR_SELECTIONS_UPDATED', {
                userId,
                integrationId,
                added: results.added.length,
                updated: results.updated.length,
                removed: results.removed.length,
                errors: results.errors.length
            });

            return results;

        } catch (error) {
            this.auditLogger.log('error', 'UPDATE_CALENDAR_SELECTIONS_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get calendar sync preferences for a user
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @returns {Object} Calendar sync preferences
     */
    async getCalendarSyncPreferences(userId, integrationId) {
        try {
            const { data: preferences } = await this.supabase
                .from('user_preferences')
                .select('calendar_sync_settings')
                .eq('user_id', userId)
                .single();

            const calendarSettings = preferences?.calendar_sync_settings || {};
            
            return {
                ...this.defaultPreferences,
                ...calendarSettings[integrationId] || {}
            };

        } catch (error) {
            this.auditLogger.log('error', 'GET_CALENDAR_PREFERENCES_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            return this.defaultPreferences;
        }
    }

    /**
     * Update calendar sync preferences
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} preferences - Updated preferences
     */
    async updateCalendarSyncPreferences(userId, integrationId, preferences) {
        try {
            // Validate preferences
            this.validateSyncPreferences(preferences);

            // Get existing preferences
            const { data: existingPrefs } = await this.supabase
                .from('user_preferences')
                .select('calendar_sync_settings')
                .eq('user_id', userId)
                .single();

            const calendarSettings = existingPrefs?.calendar_sync_settings || {};
            calendarSettings[integrationId] = {
                ...this.defaultPreferences,
                ...calendarSettings[integrationId] || {},
                ...preferences,
                updatedAt: new Date().toISOString()
            };

            // Update in database
            const { error } = await this.supabase
                .from('user_preferences')
                .upsert({
                    user_id: userId,
                    calendar_sync_settings: calendarSettings
                }, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                });

            if (error) throw error;

            this.auditLogger.log('info', 'CALENDAR_PREFERENCES_UPDATED', {
                userId,
                integrationId,
                preferences
            });

            return true;

        } catch (error) {
            this.auditLogger.log('error', 'UPDATE_CALENDAR_PREFERENCES_ERROR', {
                userId,
                integrationId,
                preferences,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Sync across multiple selected calendars
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Object} syncOptions - Sync options
     * @returns {Object} Sync results
     */
    async syncMultipleCalendars(userId, integrationId, syncOptions = {}) {
        try {
            // Get selected calendars
            const selectedCalendars = await this.getSelectedCalendars(userId, integrationId);
            
            if (selectedCalendars.length === 0) {
                this.auditLogger.log('warning', 'NO_CALENDARS_SELECTED_FOR_SYNC', {
                    userId,
                    integrationId
                });
                return {
                    success: true,
                    message: 'No calendars selected for synchronization',
                    results: []
                };
            }

            const syncResults = [];

            // Sync each selected calendar
            for (const calendarSelection of selectedCalendars) {
                try {
                    const calendarSyncOptions = {
                        ...syncOptions,
                        calendarIds: [calendarSelection.calendar_id],
                        syncDirection: calendarSelection.sync_direction,
                        conflictResolution: calendarSelection.conflict_resolution,
                        syncPreferences: calendarSelection.sync_preferences
                    };

                    const result = await this.syncService.performIncrementalSync(
                        userId,
                        integrationId,
                        calendarSyncOptions
                    );

                    syncResults.push({
                        calendar_id: calendarSelection.calendar_id,
                        calendar_name: calendarSelection.calendar_name,
                        success: true,
                        result
                    });

                } catch (error) {
                    syncResults.push({
                        calendar_id: calendarSelection.calendar_id,
                        calendar_name: calendarSelection.calendar_name,
                        success: false,
                        error: error.message
                    });

                    this.auditLogger.log('error', 'CALENDAR_SYNC_FAILED', {
                        userId,
                        integrationId,
                        calendarId: calendarSelection.calendar_id,
                        error: error.message
                    });
                }
            }

            const successCount = syncResults.filter(r => r.success).length;
            const failureCount = syncResults.filter(r => !r.success).length;

            this.auditLogger.log('info', 'MULTIPLE_CALENDAR_SYNC_COMPLETED', {
                userId,
                integrationId,
                totalCalendars: selectedCalendars.length,
                successCount,
                failureCount
            });

            return {
                success: true,
                message: `Synchronized ${successCount} of ${selectedCalendars.length} calendars`,
                results: syncResults,
                summary: {
                    total: selectedCalendars.length,
                    successful: successCount,
                    failed: failureCount
                }
            };

        } catch (error) {
            this.auditLogger.log('error', 'MULTIPLE_CALENDAR_SYNC_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Auto-select recommended calendars for new users
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @returns {Array} Auto-selected calendars
     */
    async autoSelectRecommendedCalendars(userId, integrationId) {
        try {
            // Get all available calendars
            const availableCalendars = await this.getAllAvailableCalendars(userId, integrationId);
            
            // Get user preferences
            const preferences = await this.getCalendarSyncPreferences(userId, integrationId);

            const recommendations = [];

            for (const calendar of availableCalendars) {
                let shouldSelect = false;
                let priority = 0;

                // Always recommend primary calendar
                if (calendar.primary && preferences.syncPrimaryCalendar) {
                    shouldSelect = true;
                    priority = 10;
                }

                // Recommend calendars the user owns
                else if (calendar.accessRole === 'owner' && !calendar.readOnly) {
                    shouldSelect = preferences.syncSecondaryCalendars;
                    priority = 8;
                }

                // Recommend writable calendars
                else if (calendar.accessRole === 'writer' && !calendar.readOnly) {
                    shouldSelect = preferences.syncSecondaryCalendars;
                    priority = 6;
                }

                // Skip read-only calendars if user preference excludes them
                else if (calendar.readOnly && preferences.excludeReadOnlyCalendars) {
                    shouldSelect = false;
                }

                if (shouldSelect) {
                    recommendations.push({
                        calendar_id: calendar.id,
                        calendar_name: calendar.summary,
                        sync_direction: calendar.readOnly ? 'fromGoogle' : 'bidirectional',
                        conflict_resolution: preferences.conflictResolution,
                        priority,
                        reason: this.getRecommendationReason(calendar),
                        calendar_metadata: {
                            primary: calendar.primary,
                            accessRole: calendar.accessRole,
                            readOnly: calendar.readOnly,
                            colorId: calendar.colorId,
                            timeZone: calendar.timeZone
                        }
                    });
                }
            }

            // Sort by priority
            recommendations.sort((a, b) => b.priority - a.priority);

            this.auditLogger.log('info', 'AUTO_CALENDAR_RECOMMENDATIONS_GENERATED', {
                userId,
                integrationId,
                recommendationCount: recommendations.length
            });

            return recommendations;

        } catch (error) {
            this.auditLogger.log('error', 'AUTO_CALENDAR_RECOMMENDATION_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Enhance calendar info with additional metadata
     */
    async enhanceCalendarInfo(calendar, calendarApi, userId) {
        try {
            // Get basic calendar information
            const enhanced = {
                id: calendar.id,
                summary: calendar.summary,
                description: calendar.description,
                primary: calendar.primary || false,
                accessRole: calendar.accessRole,
                readOnly: calendar.accessRole === 'reader',
                colorId: calendar.colorId,
                backgroundColor: calendar.backgroundColor,
                foregroundColor: calendar.foregroundColor,
                timeZone: calendar.timeZone,
                selected: calendar.selected || false,
                hidden: calendar.hidden || false,
                defaultReminders: calendar.defaultReminders || [],
                notificationSettings: calendar.notificationSettings || {},
                conferenceProperties: calendar.conferenceProperties || {}
            };

            // Add sync status information
            const syncStatus = await this.getCalendarSyncStatus(userId, calendar.id);
            enhanced.syncStatus = syncStatus;

            // Add event count (approximate)
            try {
                const eventCount = await this.getCalendarEventCount(calendarApi, calendar.id);
                enhanced.approximateEventCount = eventCount;
            } catch (error) {
                enhanced.approximateEventCount = 0;
            }

            return enhanced;

        } catch (error) {
            // Return basic info if enhancement fails
            return {
                id: calendar.id,
                summary: calendar.summary,
                primary: calendar.primary || false,
                accessRole: calendar.accessRole,
                error: 'Enhancement failed'
            };
        }
    }

    /**
     * Get calendar sync status
     */
    async getCalendarSyncStatus(userId, calendarId) {
        try {
            const { data: selection } = await this.supabase
                .from('user_calendar_selections')
                .select('*')
                .eq('user_id', userId)
                .eq('calendar_id', calendarId)
                .eq('is_active', true)
                .single();

            if (!selection) {
                return { selected: false };
            }

            // Get last sync information
            const { data: lastSync } = await this.supabase
                .from('sync_logs')
                .select('*')
                .eq('user_id', userId)
                .eq('calendar_id', calendarId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            return {
                selected: true,
                sync_direction: selection.sync_direction,
                conflict_resolution: selection.conflict_resolution,
                last_sync: lastSync?.created_at,
                last_sync_status: lastSync?.status
            };

        } catch (error) {
            return { selected: false, error: error.message };
        }
    }

    /**
     * Get approximate event count for a calendar
     */
    async getCalendarEventCount(calendarApi, calendarId) {
        try {
            // Get events from the past month to get an approximate count
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const response = await calendarApi.events.list({
                calendarId: calendarId,
                timeMin: oneMonthAgo.toISOString(),
                maxResults: 100,
                singleEvents: true
            });

            return response.data.items?.length || 0;

        } catch (error) {
            return 0;
        }
    }

    /**
     * Get recommendation reason
     */
    getRecommendationReason(calendar) {
        if (calendar.primary) {
            return 'Primary calendar - recommended for sync';
        }
        if (calendar.accessRole === 'owner') {
            return 'You own this calendar';
        }
        if (calendar.accessRole === 'writer') {
            return 'You can edit this calendar';
        }
        if (calendar.readOnly) {
            return 'Read-only calendar - one-way sync only';
        }
        return 'Available for synchronization';
    }

    /**
     * Validate calendar selections
     */
    validateCalendarSelections(selections) {
        if (!Array.isArray(selections)) {
            throw new Error('Calendar selections must be an array');
        }

        for (const selection of selections) {
            if (!selection.calendar_id) {
                throw new Error('Each selection must have a calendar_id');
            }
            if (!selection.calendar_name) {
                throw new Error('Each selection must have a calendar_name');
            }
            if (selection.sync_direction && !['bidirectional', 'toGoogle', 'fromGoogle'].includes(selection.sync_direction)) {
                throw new Error('Invalid sync_direction value');
            }
        }
    }

    /**
     * Validate sync preferences
     */
    validateSyncPreferences(preferences) {
        const validKeys = Object.keys(this.defaultPreferences);
        for (const key of Object.keys(preferences)) {
            if (!validKeys.includes(key)) {
                throw new Error(`Invalid preference key: ${key}`);
            }
        }
    }

    /**
     * Clear calendar cache
     */
    clearCalendarCache(userId, integrationId) {
        const cacheKey = `${userId}-${integrationId}`;
        this.calendarListCache.delete(cacheKey);
    }

    /**
     * Get calendar selection statistics
     */
    async getCalendarSelectionStats(userId, integrationId) {
        try {
            const [availableCalendars, selectedCalendars] = await Promise.all([
                this.getAllAvailableCalendars(userId, integrationId),
                this.getSelectedCalendars(userId, integrationId)
            ]);

            const stats = {
                total_available: availableCalendars.length,
                total_selected: selectedCalendars.length,
                primary_selected: selectedCalendars.some(s => s.calendar_metadata?.primary),
                bidirectional_sync: selectedCalendars.filter(s => s.sync_direction === 'bidirectional').length,
                one_way_sync: selectedCalendars.filter(s => s.sync_direction !== 'bidirectional').length,
                read_only_calendars: availableCalendars.filter(c => c.readOnly).length,
                owned_calendars: availableCalendars.filter(c => c.accessRole === 'owner').length
            };

            return stats;

        } catch (error) {
            this.auditLogger.log('error', 'CALENDAR_STATS_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = MultipleCalendarService;
