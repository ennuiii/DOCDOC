/**
 * Webhook Routes
 * Handle incoming webhook notifications from various calendar providers
 */

const express = require('express');
const router = express.Router();
const GoogleCalendarWebhookService = require('../integrations/services/GoogleCalendarWebhookService');
const AuditLogger = require('../integrations/services/AuditLogger');

const webhookService = new GoogleCalendarWebhookService();
const auditLogger = new AuditLogger();

/**
 * Google Calendar Webhook Endpoint
 * Handles push notifications from Google Calendar API
 */
router.post('/google-calendar', async (req, res) => {
    try {
        const headers = req.headers;
        const body = req.body;

        auditLogger.log('info', 'WEBHOOK_REQUEST_RECEIVED', {
            provider: 'google-calendar',
            headers: {
                'x-goog-channel-id': headers['x-goog-channel-id'],
                'x-goog-resource-state': headers['x-goog-resource-state'],
                'x-goog-resource-id': headers['x-goog-resource-id']
            }
        });

        // Process the webhook notification
        const result = await webhookService.processWebhookNotification(headers, body);

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully',
            processed: result.processed
        });

    } catch (error) {
        auditLogger.log('error', 'WEBHOOK_ENDPOINT_ERROR', {
            provider: 'google-calendar',
            error: error.message,
            stack: error.stack
        });

        // Return error response
        res.status(500).json({
            success: false,
            message: 'Failed to process webhook',
            error: error.message
        });
    }
});

/**
 * Webhook Health Check
 * Simple endpoint to verify webhook service is running
 */
router.get('/health', async (req, res) => {
    try {
        // Get webhook statistics
        const stats = await webhookService.getWebhookStats();

        res.status(200).json({
            success: true,
            message: 'Webhook service is healthy',
            timestamp: new Date().toISOString(),
            stats: stats
        });

    } catch (error) {
        auditLogger.log('error', 'WEBHOOK_HEALTH_CHECK_ERROR', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Webhook service health check failed',
            error: error.message
        });
    }
});

/**
 * Webhook Channel Management Endpoints
 */

/**
 * Setup webhook channels for a user integration
 */
router.post('/setup/:integrationId', async (req, res) => {
    try {
        const { integrationId } = req.params;
        const { userId, calendarIds = ['primary'] } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Setup webhook channels
        const channels = await webhookService.setupWebhookChannels(
            userId,
            integrationId,
            calendarIds
        );

        auditLogger.log('info', 'WEBHOOK_SETUP_SUCCESS', {
            userId,
            integrationId,
            channelsCreated: channels.length
        });

        res.status(200).json({
            success: true,
            message: 'Webhook channels setup successfully',
            channels: channels.map(channel => ({
                id: channel.id,
                resourceId: channel.resourceId,
                expiration: channel.expiration
            }))
        });

    } catch (error) {
        auditLogger.log('error', 'WEBHOOK_SETUP_ENDPOINT_ERROR', {
            integrationId: req.params.integrationId,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to setup webhook channels',
            error: error.message
        });
    }
});

/**
 * Cleanup webhook channels for an integration
 */
router.delete('/cleanup/:integrationId', async (req, res) => {
    try {
        const { integrationId } = req.params;

        await webhookService.cleanupWebhookChannels(integrationId);

        auditLogger.log('info', 'WEBHOOK_CLEANUP_SUCCESS', {
            integrationId
        });

        res.status(200).json({
            success: true,
            message: 'Webhook channels cleaned up successfully'
        });

    } catch (error) {
        auditLogger.log('error', 'WEBHOOK_CLEANUP_ENDPOINT_ERROR', {
            integrationId: req.params.integrationId,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to cleanup webhook channels',
            error: error.message
        });
    }
});

/**
 * Renew expiring webhook channels
 */
router.post('/renew', async (req, res) => {
    try {
        await webhookService.renewExpiringChannels();

        auditLogger.log('info', 'WEBHOOK_RENEWAL_TRIGGERED', {
            triggeredBy: 'manual_endpoint'
        });

        res.status(200).json({
            success: true,
            message: 'Webhook channel renewal process initiated'
        });

    } catch (error) {
        auditLogger.log('error', 'WEBHOOK_RENEWAL_ENDPOINT_ERROR', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to renew webhook channels',
            error: error.message
        });
    }
});

/**
 * Get webhook channel statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await webhookService.getWebhookStats();

        res.status(200).json({
            success: true,
            message: 'Webhook statistics retrieved successfully',
            stats
        });

    } catch (error) {
        auditLogger.log('error', 'WEBHOOK_STATS_ENDPOINT_ERROR', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve webhook statistics',
            error: error.message
        });
    }
});

module.exports = router; 