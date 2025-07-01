/**
 * Webhook Processing Service
 * Handles real-time webhook events from all calendar and meeting providers
 * Supports Google Calendar, Microsoft Graph, Zoom, and CalDAV webhooks
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Import existing services
const { GoogleCalendarSyncService } = require('./GoogleCalendarSyncService');
const { OutlookCalendarSyncService } = require('./OutlookCalendarSyncService');
const { ZoomMeetingService } = require('./ZoomMeetingService');
const { CalDAVSyncService } = require('./CalDAVSyncService');
const { WebhookQueueService } = require('./WebhookQueueService');
const { WebhookSecurityService } = require('./WebhookSecurityService');
const { WebhookMonitoringService } = require('./WebhookMonitoringService');

class WebhookProcessingService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Initialize service dependencies
    this.googleSync = new GoogleCalendarSyncService();
    this.outlookSync = new OutlookCalendarSyncService();
    this.zoomService = new ZoomMeetingService();
    this.caldavSync = new CalDAVSyncService();
    this.queueService = new WebhookQueueService();
    this.securityService = new WebhookSecurityService();
    this.monitoringService = new WebhookMonitoringService();
    
    // Supported webhook providers
    this.supportedProviders = {
      GOOGLE_CALENDAR: 'google_calendar',
      MICROSOFT_GRAPH: 'microsoft_graph',
      ZOOM: 'zoom',
      CALDAV: 'caldav'
    };
    
    // Webhook event types
    this.eventTypes = {
      // Google Calendar events
      GOOGLE_EVENT_CREATED: 'google.calendar.event.created',
      GOOGLE_EVENT_UPDATED: 'google.calendar.event.updated',
      GOOGLE_EVENT_DELETED: 'google.calendar.event.deleted',
      GOOGLE_CALENDAR_LIST_UPDATED: 'google.calendar.calendarList.updated',
      
      // Microsoft Graph events
      GRAPH_EVENT_CREATED: 'microsoft.graph.event.created',
      GRAPH_EVENT_UPDATED: 'microsoft.graph.event.updated',
      GRAPH_EVENT_DELETED: 'microsoft.graph.event.deleted',
      GRAPH_CALENDAR_UPDATED: 'microsoft.graph.calendar.updated',
      
      // Zoom events
      ZOOM_MEETING_STARTED: 'zoom.meeting.started',
      ZOOM_MEETING_ENDED: 'zoom.meeting.ended',
      ZOOM_PARTICIPANT_JOINED: 'zoom.participant.joined',
      ZOOM_PARTICIPANT_LEFT: 'zoom.participant.left',
      ZOOM_MEETING_CREATED: 'zoom.meeting.created',
      ZOOM_MEETING_UPDATED: 'zoom.meeting.updated',
      ZOOM_MEETING_DELETED: 'zoom.meeting.deleted',
      
      // CalDAV events (simulated)
      CALDAV_EVENT_CHANGED: 'caldav.event.changed',
      CALDAV_CALENDAR_CHANGED: 'caldav.calendar.changed'
    };
    
    // Rate limiting configuration
    this.rateLimits = {
      [this.supportedProviders.GOOGLE_CALENDAR]: {
        requestsPerMinute: 100,
        burstLimit: 20
      },
      [this.supportedProviders.MICROSOFT_GRAPH]: {
        requestsPerMinute: 120,
        burstLimit: 25
      },
      [this.supportedProviders.ZOOM]: {
        requestsPerMinute: 80,
        burstLimit: 15
      },
      [this.supportedProviders.CALDAV]: {
        requestsPerMinute: 60,
        burstLimit: 10
      }
    };
    
    // Processing retry configuration
    this.retryConfig = {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000,
      maxDelayMs: 30000
    };
    
    // Health check intervals
    this.healthCheckInterval = 60000; // 1 minute
    this.webhookTimeoutMs = 30000; // 30 seconds
    
    // Initialize monitoring
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring and health checks
   */
  initializeMonitoring() {
    setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Main webhook processing entry point
   */
  async processWebhook(req, res) {
    const webhookId = this.generateWebhookId();
    const startTime = Date.now();
    
    try {
      // Log incoming webhook
      console.log(`[${webhookId}] Incoming webhook from ${req.ip} to ${req.path}`);
      
      // Extract provider from URL path or headers
      const provider = this.identifyProvider(req);
      if (!provider) {
        return this.sendErrorResponse(res, 400, 'Unknown webhook provider', webhookId);
      }
      
      // Security validation
      const securityValidation = await this.securityService.validateWebhook(req, provider);
      if (!securityValidation.valid) {
        await this.monitoringService.recordSecurityViolation(webhookId, provider, securityValidation.reason);
        return this.sendErrorResponse(res, 401, 'Webhook authentication failed', webhookId);
      }
      
      // Rate limiting check
      const rateLimitCheck = await this.checkRateLimit(provider, req.ip);
      if (!rateLimitCheck.allowed) {
        return this.sendErrorResponse(res, 429, 'Rate limit exceeded', webhookId);
      }
      
      // Parse and validate payload
      const payload = await this.parseWebhookPayload(req, provider);
      if (!payload) {
        return this.sendErrorResponse(res, 400, 'Invalid webhook payload', webhookId);
      }
      
      // Process webhook based on provider
      const processingResult = await this.routeWebhookToProcessor(provider, payload, webhookId);
      
      // Record metrics
      const processingTime = Date.now() - startTime;
      await this.monitoringService.recordWebhookProcessing(
        webhookId,
        provider,
        processingResult.success,
        processingTime,
        processingResult.eventType
      );
      
      // Send appropriate response
      if (processingResult.success) {
        return this.sendSuccessResponse(res, webhookId, processingResult);
      } else {
        return this.sendErrorResponse(res, 500, 'Webhook processing failed', webhookId, processingResult.error);
      }
      
    } catch (error) {
      console.error(`[${webhookId}] Webhook processing error:`, error);
      await this.monitoringService.recordError(webhookId, error);
      return this.sendErrorResponse(res, 500, 'Internal server error', webhookId, error.message);
    }
  }

  /**
   * Identify webhook provider from request
   */
  identifyProvider(req) {
    const path = req.path.toLowerCase();
    const userAgent = req.get('User-Agent') || '';
    const headers = req.headers;
    
    // Google Calendar webhooks
    if (path.includes('/webhooks/google') || 
        headers['x-goog-channel-id'] || 
        headers['x-goog-resource-id']) {
      return this.supportedProviders.GOOGLE_CALENDAR;
    }
    
    // Microsoft Graph webhooks
    if (path.includes('/webhooks/microsoft') || 
        path.includes('/webhooks/graph') ||
        headers['x-ms-client-id'] ||
        userAgent.includes('Microsoft Graph')) {
      return this.supportedProviders.MICROSOFT_GRAPH;
    }
    
    // Zoom webhooks
    if (path.includes('/webhooks/zoom') ||
        headers['authorization'] && headers['authorization'].startsWith('Bearer') ||
        userAgent.includes('Zoom')) {
      return this.supportedProviders.ZOOM;
    }
    
    // CalDAV webhooks (custom implementation)
    if (path.includes('/webhooks/caldav')) {
      return this.supportedProviders.CALDAV;
    }
    
    return null;
  }

  /**
   * Parse webhook payload based on provider
   */
  async parseWebhookPayload(req, provider) {
    try {
      let payload = req.body;
      
      // Provider-specific payload parsing
      switch (provider) {
        case this.supportedProviders.GOOGLE_CALENDAR:
          return this.parseGoogleWebhookPayload(req);
          
        case this.supportedProviders.MICROSOFT_GRAPH:
          return this.parseMicrosoftGraphPayload(req);
          
        case this.supportedProviders.ZOOM:
          return this.parseZoomWebhookPayload(req);
          
        case this.supportedProviders.CALDAV:
          return this.parseCalDAVWebhookPayload(req);
          
        default:
          return null;
      }
    } catch (error) {
      console.error('Payload parsing error:', error);
      return null;
    }
  }

  /**
   * Parse Google Calendar webhook payload
   */
  parseGoogleWebhookPayload(req) {
    const headers = req.headers;
    return {
      channelId: headers['x-goog-channel-id'],
      resourceId: headers['x-goog-resource-id'],
      resourceUri: headers['x-goog-resource-uri'],
      resourceState: headers['x-goog-resource-state'],
      messageNumber: headers['x-goog-message-number'],
      changed: headers['x-goog-changed'],
      expiration: headers['x-goog-channel-expiration'],
      eventType: this.mapGoogleEventType(headers['x-goog-resource-state']),
      provider: this.supportedProviders.GOOGLE_CALENDAR,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Parse Microsoft Graph webhook payload
   */
  parseMicrosoftGraphPayload(req) {
    const payload = req.body;
    
    if (Array.isArray(payload.value)) {
      return payload.value.map(notification => ({
        subscriptionId: notification.subscriptionId,
        clientState: notification.clientState,
        changeType: notification.changeType,
        resource: notification.resource,
        resourceData: notification.resourceData,
        subscriptionExpirationDateTime: notification.subscriptionExpirationDateTime,
        eventType: this.mapGraphEventType(notification.changeType, notification.resource),
        provider: this.supportedProviders.MICROSOFT_GRAPH,
        timestamp: new Date().toISOString()
      }));
    }
    
    return null;
  }

  /**
   * Parse Zoom webhook payload
   */
  parseZoomWebhookPayload(req) {
    const payload = req.body;
    return {
      event: payload.event,
      eventTs: payload.event_ts,
      payload: payload.payload,
      eventType: this.mapZoomEventType(payload.event),
      provider: this.supportedProviders.ZOOM,
      timestamp: new Date(payload.event_ts * 1000).toISOString()
    };
  }

  /**
   * Parse CalDAV webhook payload
   */
  parseCalDAVWebhookPayload(req) {
    const payload = req.body;
    return {
      calendarUrl: payload.calendar_url,
      eventUid: payload.event_uid,
      changeType: payload.change_type,
      etag: payload.etag,
      eventType: this.mapCalDAVEventType(payload.change_type),
      provider: this.supportedProviders.CALDAV,
      timestamp: payload.timestamp || new Date().toISOString()
    };
  }

  /**
   * Route webhook to appropriate processor
   */
  async routeWebhookToProcessor(provider, payload, webhookId) {
    try {
      switch (provider) {
        case this.supportedProviders.GOOGLE_CALENDAR:
          return await this.processGoogleCalendarWebhook(payload, webhookId);
          
        case this.supportedProviders.MICROSOFT_GRAPH:
          return await this.processMicrosoftGraphWebhook(payload, webhookId);
          
        case this.supportedProviders.ZOOM:
          return await this.processZoomWebhook(payload, webhookId);
          
        case this.supportedProviders.CALDAV:
          return await this.processCalDAVWebhook(payload, webhookId);
          
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      console.error(`[${webhookId}] Processing error for ${provider}:`, error);
      return {
        success: false,
        error: error.message,
        provider,
        webhookId
      };
    }
  }

  /**
   * Process Google Calendar webhook
   */
  async processGoogleCalendarWebhook(payload, webhookId) {
    console.log(`[${webhookId}] Processing Google Calendar webhook:`, payload.eventType);
    
    try {
      // Get the integration for this channel
      const integration = await this.getIntegrationByChannelId(payload.channelId);
      if (!integration) {
        console.warn(`[${webhookId}] No integration found for channel ID: ${payload.channelId}`);
        return { success: true, message: 'No integration found', eventType: payload.eventType };
      }
      
      // Queue the sync operation
      await this.queueService.queueSync({
        provider: this.supportedProviders.GOOGLE_CALENDAR,
        integrationId: integration.id,
        userId: integration.user_id,
        eventType: payload.eventType,
        resourceId: payload.resourceId,
        resourceUri: payload.resourceUri,
        webhookId,
        priority: this.getEventPriority(payload.eventType)
      });
      
      return {
        success: true,
        message: 'Google Calendar webhook queued for processing',
        eventType: payload.eventType,
        integrationId: integration.id
      };
      
    } catch (error) {
      console.error(`[${webhookId}] Google Calendar webhook processing error:`, error);
      throw error;
    }
  }

  /**
   * Process Microsoft Graph webhook
   */
  async processMicrosoftGraphWebhook(payload, webhookId) {
    console.log(`[${webhookId}] Processing Microsoft Graph webhook:`, payload.eventType);
    
    try {
      const notifications = Array.isArray(payload) ? payload : [payload];
      const results = [];
      
      for (const notification of notifications) {
        // Get the integration for this subscription
        const integration = await this.getIntegrationBySubscriptionId(notification.subscriptionId);
        if (!integration) {
          console.warn(`[${webhookId}] No integration found for subscription ID: ${notification.subscriptionId}`);
          continue;
        }
        
        // Queue the sync operation
        await this.queueService.queueSync({
          provider: this.supportedProviders.MICROSOFT_GRAPH,
          integrationId: integration.id,
          userId: integration.user_id,
          eventType: notification.eventType,
          subscriptionId: notification.subscriptionId,
          resource: notification.resource,
          changeType: notification.changeType,
          webhookId,
          priority: this.getEventPriority(notification.eventType)
        });
        
        results.push({
          subscriptionId: notification.subscriptionId,
          integrationId: integration.id,
          eventType: notification.eventType
        });
      }
      
      return {
        success: true,
        message: 'Microsoft Graph webhook(s) queued for processing',
        results,
        count: results.length
      };
      
    } catch (error) {
      console.error(`[${webhookId}] Microsoft Graph webhook processing error:`, error);
      throw error;
    }
  }

  /**
   * Process Zoom webhook
   */
  async processZoomWebhook(payload, webhookId) {
    console.log(`[${webhookId}] Processing Zoom webhook:`, payload.eventType);
    
    try {
      // Extract meeting information
      const meetingId = payload.payload?.object?.id || payload.payload?.meeting?.id;
      if (!meetingId) {
        console.warn(`[${webhookId}] No meeting ID found in Zoom webhook`);
        return { success: true, message: 'No meeting ID found', eventType: payload.eventType };
      }
      
      // Find appointments associated with this Zoom meeting
      const appointments = await this.getAppointmentsByMeetingId(meetingId, 'zoom');
      
      for (const appointment of appointments) {
        // Queue the meeting event processing
        await this.queueService.queueMeetingEvent({
          provider: this.supportedProviders.ZOOM,
          appointmentId: appointment.id,
          meetingId,
          eventType: payload.eventType,
          eventData: payload.payload,
          webhookId,
          priority: this.getEventPriority(payload.eventType)
        });
      }
      
      return {
        success: true,
        message: 'Zoom webhook queued for processing',
        eventType: payload.eventType,
        appointmentsAffected: appointments.length,
        meetingId
      };
      
    } catch (error) {
      console.error(`[${webhookId}] Zoom webhook processing error:`, error);
      throw error;
    }
  }

  /**
   * Process CalDAV webhook
   */
  async processCalDAVWebhook(payload, webhookId) {
    console.log(`[${webhookId}] Processing CalDAV webhook:`, payload.eventType);
    
    try {
      // Get integrations for this calendar URL
      const integrations = await this.getIntegrationsByCalendarUrl(payload.calendarUrl);
      
      for (const integration of integrations) {
        // Queue the sync operation
        await this.queueService.queueSync({
          provider: this.supportedProviders.CALDAV,
          integrationId: integration.id,
          userId: integration.user_id,
          eventType: payload.eventType,
          calendarUrl: payload.calendarUrl,
          eventUid: payload.eventUid,
          etag: payload.etag,
          webhookId,
          priority: this.getEventPriority(payload.eventType)
        });
      }
      
      return {
        success: true,
        message: 'CalDAV webhook queued for processing',
        eventType: payload.eventType,
        integrationsAffected: integrations.length,
        calendarUrl: payload.calendarUrl
      };
      
    } catch (error) {
      console.error(`[${webhookId}] CalDAV webhook processing error:`, error);
      throw error;
    }
  }

  /**
   * Map Google event states to internal event types
   */
  mapGoogleEventType(resourceState) {
    switch (resourceState) {
      case 'exists':
        return this.eventTypes.GOOGLE_EVENT_UPDATED;
      case 'not_exists':
        return this.eventTypes.GOOGLE_EVENT_DELETED;
      case 'sync':
        return this.eventTypes.GOOGLE_CALENDAR_LIST_UPDATED;
      default:
        return this.eventTypes.GOOGLE_EVENT_UPDATED;
    }
  }

  /**
   * Map Microsoft Graph change types to internal event types
   */
  mapGraphEventType(changeType, resource) {
    const isEvent = resource && resource.includes('/events/');
    
    switch (changeType) {
      case 'created':
        return isEvent ? this.eventTypes.GRAPH_EVENT_CREATED : this.eventTypes.GRAPH_CALENDAR_UPDATED;
      case 'updated':
        return isEvent ? this.eventTypes.GRAPH_EVENT_UPDATED : this.eventTypes.GRAPH_CALENDAR_UPDATED;
      case 'deleted':
        return isEvent ? this.eventTypes.GRAPH_EVENT_DELETED : this.eventTypes.GRAPH_CALENDAR_UPDATED;
      default:
        return this.eventTypes.GRAPH_EVENT_UPDATED;
    }
  }

  /**
   * Map Zoom event types to internal event types
   */
  mapZoomEventType(zoomEvent) {
    switch (zoomEvent) {
      case 'meeting.started':
        return this.eventTypes.ZOOM_MEETING_STARTED;
      case 'meeting.ended':
        return this.eventTypes.ZOOM_MEETING_ENDED;
      case 'meeting.participant_joined':
        return this.eventTypes.ZOOM_PARTICIPANT_JOINED;
      case 'meeting.participant_left':
        return this.eventTypes.ZOOM_PARTICIPANT_LEFT;
      case 'meeting.created':
        return this.eventTypes.ZOOM_MEETING_CREATED;
      case 'meeting.updated':
        return this.eventTypes.ZOOM_MEETING_UPDATED;
      case 'meeting.deleted':
        return this.eventTypes.ZOOM_MEETING_DELETED;
      default:
        return this.eventTypes.ZOOM_MEETING_UPDATED;
    }
  }

  /**
   * Map CalDAV change types to internal event types
   */
  mapCalDAVEventType(changeType) {
    switch (changeType) {
      case 'created':
      case 'updated':
      case 'deleted':
        return this.eventTypes.CALDAV_EVENT_CHANGED;
      default:
        return this.eventTypes.CALDAV_CALENDAR_CHANGED;
    }
  }

  /**
   * Get event priority for queue processing
   */
  getEventPriority(eventType) {
    // High priority events
    const highPriorityEvents = [
      this.eventTypes.ZOOM_MEETING_STARTED,
      this.eventTypes.ZOOM_MEETING_ENDED,
      this.eventTypes.ZOOM_PARTICIPANT_JOINED,
      this.eventTypes.ZOOM_PARTICIPANT_LEFT
    ];
    
    // Medium priority events
    const mediumPriorityEvents = [
      this.eventTypes.GOOGLE_EVENT_CREATED,
      this.eventTypes.GOOGLE_EVENT_DELETED,
      this.eventTypes.GRAPH_EVENT_CREATED,
      this.eventTypes.GRAPH_EVENT_DELETED,
      this.eventTypes.ZOOM_MEETING_CREATED,
      this.eventTypes.ZOOM_MEETING_DELETED
    ];
    
    if (highPriorityEvents.includes(eventType)) {
      return 'high';
    } else if (mediumPriorityEvents.includes(eventType)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Rate limiting check
   */
  async checkRateLimit(provider, clientIP) {
    const limits = this.rateLimits[provider];
    if (!limits) {
      return { allowed: true };
    }
    
    // Implement rate limiting logic here
    // This is a simplified version - in production, use Redis or similar
    const key = `rate_limit:${provider}:${clientIP}`;
    const current = await this.getRateLimitCount(key);
    
    if (current >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        resetTime: new Date(Date.now() + 60000).toISOString()
      };
    }
    
    await this.incrementRateLimitCount(key);
    return { allowed: true };
  }

  /**
   * Database helper methods
   */
  async getIntegrationByChannelId(channelId) {
    const { data, error } = await this.supabase
      .from('calendar_integrations')
      .select('*')
      .eq('provider', 'google_calendar')
      .eq('status', 'active')
      .contains('config', { channelId });
    
    if (error) {
      console.error('Error fetching integration by channel ID:', error);
      return null;
    }
    
    return data?.[0] || null;
  }

  async getIntegrationBySubscriptionId(subscriptionId) {
    const { data, error } = await this.supabase
      .from('calendar_integrations')
      .select('*')
      .eq('provider', 'microsoft_graph')
      .eq('status', 'active')
      .contains('config', { subscriptionId });
    
    if (error) {
      console.error('Error fetching integration by subscription ID:', error);
      return null;
    }
    
    return data?.[0] || null;
  }

  async getAppointmentsByMeetingId(meetingId, provider) {
    const { data, error } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('external_provider', provider)
      .eq('external_meeting_id', meetingId);
    
    if (error) {
      console.error('Error fetching appointments by meeting ID:', error);
      return [];
    }
    
    return data || [];
  }

  async getIntegrationsByCalendarUrl(calendarUrl) {
    const { data, error } = await this.supabase
      .from('calendar_integrations')
      .select('*')
      .eq('provider', 'caldav')
      .eq('status', 'active')
      .contains('config', { calendarUrl });
    
    if (error) {
      console.error('Error fetching integrations by calendar URL:', error);
      return [];
    }
    
    return data || [];
  }

  /**
   * Utility methods
   */
  generateWebhookId() {
    return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getRateLimitCount(key) {
    // Implement rate limit counting (use Redis in production)
    return 0;
  }

  async incrementRateLimitCount(key) {
    // Implement rate limit increment (use Redis in production)
    return true;
  }

  async performHealthCheck() {
    try {
      // Check database connectivity
      const { data, error } = await this.supabase
        .from('calendar_integrations')
        .select('count(*)')
        .limit(1);
      
      if (error) {
        throw new Error(`Database health check failed: ${error.message}`);
      }
      
      // Check queue service health
      const queueHealth = await this.queueService.getHealthStatus();
      if (!queueHealth.healthy) {
        throw new Error(`Queue service unhealthy: ${queueHealth.message}`);
      }
      
      // Record successful health check
      await this.monitoringService.recordHealthCheck(true);
      
      console.log('Webhook processing service health check passed');
      
    } catch (error) {
      console.error('Webhook processing service health check failed:', error);
      await this.monitoringService.recordHealthCheck(false, error.message);
    }
  }

  /**
   * Response helper methods
   */
  sendSuccessResponse(res, webhookId, result = {}) {
    res.status(200).json({
      success: true,
      webhookId,
      message: result.message || 'Webhook processed successfully',
      timestamp: new Date().toISOString(),
      ...result
    });
  }

  sendErrorResponse(res, statusCode, message, webhookId, details = null) {
    res.status(statusCode).json({
      success: false,
      error: message,
      webhookId,
      timestamp: new Date().toISOString(),
      details
    });
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    console.log('Shutting down webhook processing service...');
    
    try {
      // Close queue connections
      await this.queueService.shutdown();
      
      // Stop monitoring
      await this.monitoringService.shutdown();
      
      console.log('Webhook processing service shutdown complete');
    } catch (error) {
      console.error('Error during webhook processing service shutdown:', error);
    }
  }
}

module.exports = { WebhookProcessingService }; 