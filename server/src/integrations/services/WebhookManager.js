/**
 * Webhook Manager
 * Handles webhook routing and processing for integration providers
 */

const crypto = require('crypto');
const { supabase } = require('../../config/supabase');

class WebhookManager {
    constructor() {
        this.webhookHandlers = {
            google: this.handleGoogleWebhook.bind(this),
            microsoft: this.handleMicrosoftWebhook.bind(this),
            zoom: this.handleZoomWebhook.bind(this),
            caldav: this.handleCalDAVWebhook.bind(this)
        };

        // Webhook signature verification
        this.verificationSecrets = {
            google: process.env.GOOGLE_WEBHOOK_SECRET,
            microsoft: process.env.MICROSOFT_WEBHOOK_SECRET,
            zoom: process.env.ZOOM_WEBHOOK_SECRET,
            caldav: process.env.CALDAV_WEBHOOK_SECRET
        };

        // Event type mappings
        this.eventTypeMappings = {
            google: {
                'calendar#events': 'calendar_event_changed',
                'calendar#calendars': 'calendar_changed'
            },
            microsoft: {
                'Microsoft.Graph.EventCreated': 'calendar_event_created',
                'Microsoft.Graph.EventUpdated': 'calendar_event_updated',
                'Microsoft.Graph.EventDeleted': 'calendar_event_deleted'
            },
            zoom: {
                'meeting.created': 'meeting_created',
                'meeting.updated': 'meeting_updated',
                'meeting.deleted': 'meeting_deleted',
                'meeting.started': 'meeting_started',
                'meeting.ended': 'meeting_ended'
            }
        };
    }

    /**
     * Route webhook to appropriate handler
     * @param {string} provider - Provider name
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @returns {Object} Processing result
     */
    async routeWebhook(provider, req, res) {
        try {
            console.log(`Webhook received for provider: ${provider}`);
            
            // Verify webhook signature
            const isValid = await this.verifyWebhookSignature(provider, req);
            if (!isValid) {
                console.error(`Invalid webhook signature for provider: ${provider}`);
                return { 
                    success: false, 
                    error: 'Invalid signature',
                    status: 401 
                };
            }

            // Get handler for provider
            const handler = this.webhookHandlers[provider];
            if (!handler) {
                console.error(`No webhook handler found for provider: ${provider}`);
                return { 
                    success: false, 
                    error: 'Provider not supported',
                    status: 400 
                };
            }

            // Process webhook
            const result = await handler(req.body, req.headers);
            
            // Log webhook event
            await this.logWebhookEvent(provider, req.body, result);

            return { success: true, result, status: 200 };
        } catch (error) {
            console.error(`Webhook routing error for ${provider}:`, error);
            
            // Log error
            await this.logWebhookEvent(provider, req.body, { 
                error: error.message,
                stack: error.stack 
            });

            return { 
                success: false, 
                error: error.message,
                status: 500 
            };
        }
    }

    /**
     * Verify webhook signature
     * @param {string} provider - Provider name
     * @param {Object} req - Request object
     * @returns {boolean} Signature valid
     */
    async verifyWebhookSignature(provider, req) {
        try {
            const secret = this.verificationSecrets[provider];
            if (!secret) {
                console.warn(`No verification secret configured for ${provider}`);
                return true; // Allow through if no secret configured
            }

            let signature, expectedSignature;

            switch (provider) {
                case 'google':
                    // Google uses X-Goog-Channel-Token header
                    signature = req.headers['x-goog-channel-token'];
                    expectedSignature = secret;
                    return signature === expectedSignature;

                case 'microsoft':
                    // Microsoft Graph uses validation tokens
                    if (req.query && req.query.validationToken) {
                        return req.query.validationToken === secret;
                    }
                    return true; // No signature validation for notification webhooks

                case 'zoom':
                    // Zoom uses HMAC-SHA256
                    signature = req.headers['authorization'];
                    const timestamp = req.headers['x-zm-request-timestamp'];
                    const body = JSON.stringify(req.body);
                    
                    const message = `v0:${timestamp}:${body}`;
                    expectedSignature = crypto
                        .createHmac('sha256', secret)
                        .update(message)
                        .digest('hex');
                    
                    return signature === `v0=${expectedSignature}`;

                case 'caldav':
                    // CalDAV typically doesn't use webhooks, but if implemented
                    return true;

                default:
                    return false;
            }
        } catch (error) {
            console.error(`Signature verification error for ${provider}:`, error);
            return false;
        }
    }

    /**
     * Handle Google webhook
     * @param {Object} payload - Webhook payload
     * @param {Object} headers - Request headers
     * @returns {Object} Processing result
     */
    async handleGoogleWebhook(payload, headers) {
        try {
            const channelId = headers['x-goog-channel-id'];
            const resourceId = headers['x-goog-resource-id'];
            const resourceState = headers['x-goog-resource-state'];
            const resourceUri = headers['x-goog-resource-uri'];

            console.log(`Google webhook - Channel: ${channelId}, Resource: ${resourceId}, State: ${resourceState}`);

            // Map Google resource state to our event types
            let eventType = 'calendar_changed';
            if (resourceUri && resourceUri.includes('events')) {
                eventType = 'calendar_event_changed';
            }

            // Find integration by channel ID
            const integration = await this.findIntegrationByChannelId(channelId, 'google');
            if (!integration) {
                console.warn(`No integration found for Google channel: ${channelId}`);
                return { processed: false, reason: 'No matching integration' };
            }

            // Process the change notification
            await this.processChangeNotification(integration, eventType, {
                resource_id: resourceId,
                resource_state: resourceState,
                resource_uri: resourceUri,
                channel_id: channelId
            });

            return { processed: true, event_type: eventType };
        } catch (error) {
            console.error('Google webhook processing error:', error);
            throw error;
        }
    }

    /**
     * Handle Microsoft webhook
     * @param {Object} payload - Webhook payload
     * @param {Object} headers - Request headers
     * @returns {Object} Processing result
     */
    async handleMicrosoftWebhook(payload, headers) {
        try {
            const notifications = payload.value || [payload];
            const results = [];

            for (const notification of notifications) {
                console.log(`Microsoft webhook notification:`, notification);

                const eventType = this.eventTypeMappings.microsoft[notification.changeType] || 'unknown';
                
                // Find integration by subscription ID
                const integration = await this.findIntegrationBySubscriptionId(
                    notification.subscriptionId, 
                    'microsoft'
                );

                if (!integration) {
                    console.warn(`No integration found for Microsoft subscription: ${notification.subscriptionId}`);
                    results.push({ processed: false, reason: 'No matching integration' });
                    continue;
                }

                // Process the notification
                await this.processChangeNotification(integration, eventType, {
                    change_type: notification.changeType,
                    resource: notification.resource,
                    resource_data: notification.resourceData,
                    subscription_id: notification.subscriptionId,
                    client_state: notification.clientState
                });

                results.push({ processed: true, event_type: eventType });
            }

            return { processed: true, notifications: results.length, results };
        } catch (error) {
            console.error('Microsoft webhook processing error:', error);
            throw error;
        }
    }

    /**
     * Handle Zoom webhook
     * @param {Object} payload - Webhook payload
     * @param {Object} headers - Request headers
     * @returns {Object} Processing result
     */
    async handleZoomWebhook(payload, headers) {
        try {
            const eventType = this.eventTypeMappings.zoom[payload.event] || payload.event;
            
            console.log(`Zoom webhook - Event: ${payload.event}, Object: ${payload.payload?.object?.id}`);

            // Find integration by account ID or user ID
            const accountId = payload.payload?.account_id;
            const integration = await this.findIntegrationByAccountId(accountId, 'zoom');

            if (!integration) {
                console.warn(`No integration found for Zoom account: ${accountId}`);
                return { processed: false, reason: 'No matching integration' };
            }

            // Process the webhook
            await this.processChangeNotification(integration, eventType, {
                event: payload.event,
                event_ts: payload.event_ts,
                payload: payload.payload
            });

            return { processed: true, event_type: eventType };
        } catch (error) {
            console.error('Zoom webhook processing error:', error);
            throw error;
        }
    }

    /**
     * Handle CalDAV webhook (if supported by server)
     * @param {Object} payload - Webhook payload
     * @param {Object} headers - Request headers
     * @returns {Object} Processing result
     */
    async handleCalDAVWebhook(payload, headers) {
        try {
            // CalDAV servers typically don't support webhooks
            // This is a placeholder for custom implementations
            console.log('CalDAV webhook received (rare):', payload);

            return { processed: true, note: 'CalDAV webhooks are rarely supported' };
        } catch (error) {
            console.error('CalDAV webhook processing error:', error);
            throw error;
        }
    }

    /**
     * Process change notification
     * @param {Object} integration - Integration record
     * @param {string} eventType - Event type
     * @param {Object} eventData - Event data
     */
    async processChangeNotification(integration, eventType, eventData) {
        try {
            // Store webhook event in database
            const { error } = await supabase
                .from('integration_webhooks')
                .insert({
                    integration_id: integration.id,
                    event_type: eventType,
                    event_data: eventData,
                    processed: false,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Failed to store webhook event:', error);
                throw error;
            }

            // Update integration last_sync timestamp
            await supabase
                .from('user_integrations')
                .update({ 
                    last_sync: new Date().toISOString(),
                    sync_status: 'syncing'
                })
                .eq('id', integration.id);

            // Trigger real-time notification if supported
            await this.sendRealtimeNotification(integration.user_id, eventType, eventData);

            console.log(`Processed ${eventType} notification for integration ${integration.id}`);
        } catch (error) {
            console.error('Change notification processing error:', error);
            throw error;
        }
    }

    /**
     * Find integration by channel ID (Google)
     */
    async findIntegrationByChannelId(channelId, provider) {
        try {
            const { data, error } = await supabase
                .from('user_integrations')
                .select('*')
                .eq('provider_type', provider)
                .contains('config', { channel_id: channelId })
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Database query error:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Find integration by channel ID error:', error);
            return null;
        }
    }

    /**
     * Find integration by subscription ID (Microsoft)
     */
    async findIntegrationBySubscriptionId(subscriptionId, provider) {
        try {
            const { data, error } = await supabase
                .from('user_integrations')
                .select('*')
                .eq('provider_type', provider)
                .contains('config', { subscription_id: subscriptionId })
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Database query error:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Find integration by subscription ID error:', error);
            return null;
        }
    }

    /**
     * Find integration by account ID (Zoom)
     */
    async findIntegrationByAccountId(accountId, provider) {
        try {
            const { data, error } = await supabase
                .from('user_integrations')
                .select('*')
                .eq('provider_type', provider)
                .contains('config', { account_id: accountId })
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Database query error:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Find integration by account ID error:', error);
            return null;
        }
    }

    /**
     * Send real-time notification
     * @param {string} userId - User ID
     * @param {string} eventType - Event type
     * @param {Object} eventData - Event data
     */
    async sendRealtimeNotification(userId, eventType, eventData) {
        try {
            const notification = {
                user_id: userId,
                type: 'integration_update',
                title: `Integration Update: ${eventType}`,
                message: `Your ${eventData.provider || 'integration'} has been updated`,
                data: {
                    event_type: eventType,
                    timestamp: new Date().toISOString(),
                    ...eventData
                },
                created_at: new Date().toISOString()
            };

            // Send via Supabase realtime
            await supabase
                .channel('integration_notifications')
                .send({
                    type: 'broadcast',
                    event: 'integration_update',
                    payload: notification
                });

            console.log(`Sent realtime notification for user ${userId}`);
        } catch (error) {
            console.error('Real-time notification error:', error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Log webhook event
     * @param {string} provider - Provider name
     * @param {Object} payload - Webhook payload
     * @param {Object} result - Processing result
     */
    async logWebhookEvent(provider, payload, result) {
        try {
            const logEntry = {
                provider,
                payload: JSON.stringify(payload),
                result: JSON.stringify(result),
                timestamp: new Date().toISOString(),
                success: result.error ? false : true
            };

            // You could store this in a separate webhook_logs table
            console.log('Webhook Event Log:', logEntry);
        } catch (error) {
            console.error('Webhook logging error:', error);
            // Don't throw - logging failures shouldn't break webhook processing
        }
    }

    /**
     * Get webhook statistics
     * @param {Object} options - Query options
     * @returns {Object} Webhook statistics
     */
    async getWebhookStats(options = {}) {
        try {
            const { data, error } = await supabase
                .from('integration_webhooks')
                .select('event_type, processed, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const stats = {
                total: data.length,
                processed: data.filter(w => w.processed).length,
                pending: data.filter(w => !w.processed).length,
                by_event_type: {},
                recent_count: data.filter(w => 
                    new Date(w.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                ).length
            };

            // Count by event type
            data.forEach(webhook => {
                stats.by_event_type[webhook.event_type] = 
                    (stats.by_event_type[webhook.event_type] || 0) + 1;
            });

            return stats;
        } catch (error) {
            console.error('Webhook stats error:', error);
            throw error;
        }
    }
}

module.exports = WebhookManager; 