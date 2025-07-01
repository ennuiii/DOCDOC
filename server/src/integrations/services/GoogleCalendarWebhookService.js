/**
 * Google Calendar Webhook Service
 * Handles real-time push notifications and webhook processing for Google Calendar integration
 */

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const AuditLogger = require('./AuditLogger');
const GoogleCalendarSyncService = require('./GoogleCalendarSyncService');
const ConflictResolutionService = require('./ConflictResolutionService');

class GoogleCalendarWebhookService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        this.syncService = new GoogleCalendarSyncService();
        this.conflictService = new ConflictResolutionService();
        
        // Webhook configuration
        this.webhookEndpoint = process.env.GOOGLE_WEBHOOK_URL || 'https://yourdomain.com/api/webhooks/google-calendar';
        this.webhookSecret = process.env.GOOGLE_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
        
        // Channel management
        this.activeChannels = new Map(); // In-memory cache for active channels
        this.channelRenewalInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        // Initialize periodic channel renewal
        this.startChannelRenewalSchedule();
    }

    /**
     * Set up webhook channels for a user's Google Calendar integration
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @param {Array} calendarIds - Array of calendar IDs to watch
     */
    async setupWebhookChannels(userId, integrationId, calendarIds = ['primary']) {
        try {
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

            const channels = [];

            // Set up webhook channel for each calendar
            for (const calendarId of calendarIds) {
                try {
                    const channelId = this.generateChannelId(userId, integrationId, calendarId);
                    const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now

                    const channel = await calendar.events.watch({
                        calendarId: calendarId,
                        requestBody: {
                            id: channelId,
                            type: 'web_hook',
                            address: this.webhookEndpoint,
                            expiration: expiration.toString(),
                            token: this.generateChannelToken(userId, integrationId, calendarId)
                        }
                    });

                    // Store channel information in database
                    const channelData = {
                        integration_id: integrationId,
                        channel_id: channelId,
                        calendar_id: calendarId,
                        resource_id: channel.data.resourceId,
                        expiration_time: new Date(parseInt(channel.data.expiration)),
                        webhook_url: this.webhookEndpoint,
                        status: 'active',
                        created_at: new Date().toISOString()
                    };

                    await this.storeChannelInfo(channelData);

                    // Cache channel information
                    this.activeChannels.set(channelId, {
                        ...channelData,
                        userId,
                        integrationId,
                        calendarId
                    });

                    channels.push(channel.data);

                    this.auditLogger.log('info', 'WEBHOOK_CHANNEL_CREATED', {
                        userId,
                        integrationId,
                        calendarId,
                        channelId,
                        resourceId: channel.data.resourceId
                    });

                } catch (error) {
                    this.auditLogger.log('error', 'WEBHOOK_CHANNEL_SETUP_FAILED', {
                        userId,
                        integrationId,
                        calendarId,
                        error: error.message
                    });
                    throw error;
                }
            }

            return channels;

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_SETUP_ERROR', {
                userId,
                integrationId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Process incoming webhook notification
     * @param {Object} headers - Request headers
     * @param {Buffer} body - Request body
     */
    async processWebhookNotification(headers, body) {
        try {
            // Verify webhook authenticity
            if (!this.verifyWebhookSignature(headers, body)) {
                this.auditLogger.log('warning', 'WEBHOOK_VERIFICATION_FAILED', { headers });
                throw new Error('Webhook verification failed');
            }

            // Extract notification details
            const channelId = headers['x-goog-channel-id'];
            const channelToken = headers['x-goog-channel-token'];
            const resourceState = headers['x-goog-resource-state'];
            const resourceId = headers['x-goog-resource-id'];
            const resourceUri = headers['x-goog-resource-uri'];

            this.auditLogger.log('info', 'WEBHOOK_NOTIFICATION_RECEIVED', {
                channelId,
                resourceState,
                resourceId,
                resourceUri
            });

            // Handle different resource states
            switch (resourceState) {
                case 'sync':
                    // Initial sync message - can be ignored
                    this.auditLogger.log('debug', 'WEBHOOK_SYNC_MESSAGE', { channelId });
                    break;

                case 'exists':
                    // Calendar events have been modified
                    await this.handleCalendarChanges(channelId, channelToken, resourceId);
                    break;

                case 'not_exists':
                    // Calendar has been deleted
                    await this.handleCalendarDeletion(channelId, resourceId);
                    break;

                default:
                    this.auditLogger.log('warning', 'UNKNOWN_WEBHOOK_STATE', {
                        resourceState,
                        channelId
                    });
            }

            return { success: true, processed: true };

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_PROCESSING_ERROR', {
                error: error.message,
                headers: headers
            });
            throw error;
        }
    }

    /**
     * Handle calendar changes notification
     * @param {string} channelId - Channel ID
     * @param {string} channelToken - Channel token
     * @param {string} resourceId - Resource ID
     */
    async handleCalendarChanges(channelId, channelToken, resourceId) {
        try {
            // Get channel information
            const channelInfo = await this.getChannelInfo(channelId);
            if (!channelInfo) {
                this.auditLogger.log('warning', 'WEBHOOK_CHANNEL_NOT_FOUND', { channelId });
                return;
            }

            // Verify channel token
            const expectedToken = this.generateChannelToken(
                channelInfo.userId, 
                channelInfo.integrationId, 
                channelInfo.calendarId
            );
            
            if (channelToken !== expectedToken) {
                this.auditLogger.log('warning', 'WEBHOOK_TOKEN_MISMATCH', { channelId });
                return;
            }

            // Trigger incremental sync for the affected calendar
            await this.syncService.performIncrementalSync(
                channelInfo.userId,
                channelInfo.integrationId,
                {
                    calendarIds: [channelInfo.calendarId],
                    conflictResolution: 'detect_and_store', // Store conflicts for user resolution
                    realTimeSync: true
                }
            );

            // Update last sync time
            await this.updateChannelLastSync(channelId);

            this.auditLogger.log('info', 'WEBHOOK_SYNC_TRIGGERED', {
                channelId,
                userId: channelInfo.userId,
                calendarId: channelInfo.calendarId
            });

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_CALENDAR_CHANGES_ERROR', {
                channelId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Handle calendar deletion notification
     * @param {string} channelId - Channel ID
     * @param {string} resourceId - Resource ID
     */
    async handleCalendarDeletion(channelId, resourceId) {
        try {
            // Get channel information
            const channelInfo = await this.getChannelInfo(channelId);
            if (!channelInfo) {
                this.auditLogger.log('warning', 'WEBHOOK_CHANNEL_NOT_FOUND', { channelId });
                return;
            }

            // Mark calendar as deleted/inactive
            await this.supabase
                .from('webhook_channels')
                .update({
                    status: 'calendar_deleted',
                    updated_at: new Date().toISOString()
                })
                .eq('channel_id', channelId);

            // Remove from active channels cache
            this.activeChannels.delete(channelId);

            // Handle cleanup of calendar events
            await this.handleCalendarCleanup(channelInfo.integrationId, channelInfo.calendarId);

            this.auditLogger.log('info', 'WEBHOOK_CALENDAR_DELETED', {
                channelId,
                calendarId: channelInfo.calendarId,
                userId: channelInfo.userId
            });

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_CALENDAR_DELETION_ERROR', {
                channelId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Renew expiring webhook channels
     */
    async renewExpiringChannels() {
        try {
            const expirationThreshold = new Date(Date.now() + (24 * 60 * 60 * 1000)); // Next 24 hours

            // Get channels expiring soon
            const { data: expiringChannels } = await this.supabase
                .from('webhook_channels')
                .select(`
                    *,
                    user_integrations!inner (
                        user_id,
                        access_token,
                        refresh_token
                    )
                `)
                .eq('status', 'active')
                .lte('expiration_time', expirationThreshold.toISOString());

            this.auditLogger.log('info', 'WEBHOOK_RENEWAL_CHECK', {
                expiringChannelsCount: expiringChannels?.length || 0
            });

            for (const channel of expiringChannels || []) {
                try {
                    await this.renewWebhookChannel(channel);
                } catch (error) {
                    this.auditLogger.log('error', 'WEBHOOK_RENEWAL_FAILED', {
                        channelId: channel.channel_id,
                        error: error.message
                    });
                }
            }

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_RENEWAL_ERROR', {
                error: error.message
            });
        }
    }

    /**
     * Renew a specific webhook channel
     * @param {Object} channelData - Channel data from database
     */
    async renewWebhookChannel(channelData) {
        try {
            // Stop existing channel
            await this.stopWebhookChannel(channelData);

            // Create new channel
            const newChannels = await this.setupWebhookChannels(
                channelData.user_integrations.user_id,
                channelData.integration_id,
                [channelData.calendar_id]
            );

            this.auditLogger.log('info', 'WEBHOOK_CHANNEL_RENEWED', {
                oldChannelId: channelData.channel_id,
                newChannelId: newChannels[0]?.id,
                calendarId: channelData.calendar_id
            });

            return newChannels[0];

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_CHANNEL_RENEWAL_ERROR', {
                channelId: channelData.channel_id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Stop a webhook channel
     * @param {Object} channelData - Channel data
     */
    async stopWebhookChannel(channelData) {
        try {
            // Get OAuth tokens
            const auth = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            auth.setCredentials({
                access_token: channelData.user_integrations.access_token,
                refresh_token: channelData.user_integrations.refresh_token
            });

            const calendar = google.calendar({ version: 'v3', auth });

            // Stop the webhook channel
            await calendar.channels.stop({
                requestBody: {
                    id: channelData.channel_id,
                    resourceId: channelData.resource_id
                }
            });

            // Update database
            await this.supabase
                .from('webhook_channels')
                .update({
                    status: 'stopped',
                    updated_at: new Date().toISOString()
                })
                .eq('channel_id', channelData.channel_id);

            // Remove from cache
            this.activeChannels.delete(channelData.channel_id);

            this.auditLogger.log('info', 'WEBHOOK_CHANNEL_STOPPED', {
                channelId: channelData.channel_id,
                calendarId: channelData.calendar_id
            });

        } catch (error) {
            // Google might return error if channel is already expired
            this.auditLogger.log('warning', 'WEBHOOK_CHANNEL_STOP_ERROR', {
                channelId: channelData.channel_id,
                error: error.message
            });
        }
    }

    /**
     * Clean up all webhook channels for an integration
     * @param {string} integrationId - Integration ID
     */
    async cleanupWebhookChannels(integrationId) {
        try {
            // Get all active channels for the integration
            const { data: channels } = await this.supabase
                .from('webhook_channels')
                .select(`
                    *,
                    user_integrations!inner (
                        access_token,
                        refresh_token
                    )
                `)
                .eq('integration_id', integrationId)
                .eq('status', 'active');

            // Stop each channel
            for (const channel of channels || []) {
                try {
                    await this.stopWebhookChannel(channel);
                } catch (error) {
                    this.auditLogger.log('warning', 'WEBHOOK_CLEANUP_CHANNEL_ERROR', {
                        channelId: channel.channel_id,
                        error: error.message
                    });
                }
            }

            this.auditLogger.log('info', 'WEBHOOK_CHANNELS_CLEANED_UP', {
                integrationId,
                channelsCount: channels?.length || 0
            });

        } catch (error) {
            this.auditLogger.log('error', 'WEBHOOK_CLEANUP_ERROR', {
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
     * Generate unique channel ID
     */
    generateChannelId(userId, integrationId, calendarId) {
        return `pharma-${userId}-${integrationId}-${calendarId}-${Date.now()}`;
    }

    /**
     * Generate channel token for verification
     */
    generateChannelToken(userId, integrationId, calendarId) {
        const data = `${userId}:${integrationId}:${calendarId}:${this.webhookSecret}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(headers, body) {
        // Google Calendar webhooks don't use HMAC signatures
        // Instead, we verify using channel tokens and other headers
        const channelId = headers['x-goog-channel-id'];
        const channelToken = headers['x-goog-channel-token'];
        
        // Basic verification - more sophisticated verification happens in channel handling
        return channelId && channelToken;
    }

    /**
     * Store channel information in database
     */
    async storeChannelInfo(channelData) {
        const { error } = await this.supabase
            .from('webhook_channels')
            .insert(channelData);

        if (error) throw error;
    }

    /**
     * Get channel information from cache or database
     */
    async getChannelInfo(channelId) {
        // Try cache first
        let channelInfo = this.activeChannels.get(channelId);
        
        if (!channelInfo) {
            // Fetch from database
            const { data } = await this.supabase
                .from('webhook_channels')
                .select(`
                    *,
                    user_integrations!inner (
                        user_id
                    )
                `)
                .eq('channel_id', channelId)
                .eq('status', 'active')
                .single();

            if (data) {
                channelInfo = {
                    ...data,
                    userId: data.user_integrations.user_id,
                    integrationId: data.integration_id,
                    calendarId: data.calendar_id
                };
                
                // Cache for future use
                this.activeChannels.set(channelId, channelInfo);
            }
        }

        return channelInfo;
    }

    /**
     * Update channel last sync time
     */
    async updateChannelLastSync(channelId) {
        await this.supabase
            .from('webhook_channels')
            .update({
                last_sync_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('channel_id', channelId);
    }

    /**
     * Handle calendar cleanup when calendar is deleted
     */
    async handleCalendarCleanup(integrationId, calendarId) {
        // Mark related calendar events as inactive
        await this.supabase
            .from('calendar_events')
            .update({
                sync_status: 'calendar_deleted',
                updated_at: new Date().toISOString()
            })
            .eq('integration_id', integrationId)
            .eq('external_calendar_id', calendarId);
    }

    /**
     * Start periodic channel renewal schedule
     */
    startChannelRenewalSchedule() {
        // Run renewal check every 6 hours
        setInterval(() => {
            this.renewExpiringChannels().catch(error => {
                this.auditLogger.log('error', 'WEBHOOK_RENEWAL_SCHEDULE_ERROR', {
                    error: error.message
                });
            });
        }, 6 * 60 * 60 * 1000); // 6 hours

        this.auditLogger.log('info', 'WEBHOOK_RENEWAL_SCHEDULE_STARTED', {
            intervalHours: 6
        });
    }

    /**
     * Get webhook channel statistics
     */
    async getWebhookStats() {
        const { data: stats } = await this.supabase
            .from('webhook_channels')
            .select('status')
            .then(result => {
                const statusCounts = result.data?.reduce((acc, channel) => {
                    acc[channel.status] = (acc[channel.status] || 0) + 1;
                    return acc;
                }, {}) || {};

                return {
                    data: {
                        totalChannels: result.data?.length || 0,
                        ...statusCounts,
                        activeChannelsInMemory: this.activeChannels.size
                    }
                };
            });

        return stats;
    }
}

module.exports = GoogleCalendarWebhookService;
