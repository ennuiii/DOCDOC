import { AuditLogger } from './AuditLogger.js';
import { RateLimitManager } from './RateLimitManager.js';
import { MicrosoftOAuthProvider } from '../providers/microsoft/MicrosoftOAuthProvider.js';
import { OutlookCalendarSyncService } from './OutlookCalendarSyncService.js';
import crypto from 'crypto';

/**
 * Microsoft Graph Webhook Processing Service
 * Handles real-time push notifications from Microsoft Graph API
 * for Outlook calendar and Teams events
 */
export class MicrosoftGraphWebhookService {
  constructor() {
    this.auditLogger = new AuditLogger('GraphWebhookService');
    this.rateLimiter = new RateLimitManager({
      requests: 1000,
      window: 300000, // 5 minutes
      burstLimit: 50
    });
    
    this.oauthProvider = new MicrosoftOAuthProvider();
    this.syncService = new OutlookCalendarSyncService();
    
    // Microsoft Graph API endpoints
    this.graphUrl = 'https://graph.microsoft.com/v1.0';
    this.betaGraphUrl = 'https://graph.microsoft.com/beta';
    
    // Active subscriptions management
    this.activeSubscriptions = new Map();
    this.subscriptionCache = new Map();
    
    // Webhook validation and security
    this.clientStates = new Map();
    this.validationTokens = new Map();
  }

  /**
   * Create a webhook subscription for calendar events
   * @param {string} accessToken - Microsoft access token
   * @param {Object} subscriptionData - Subscription configuration
   * @returns {Object} Created subscription details
   */
  async createCalendarSubscription(accessToken, subscriptionData) {
    try {
      await this.rateLimiter.checkLimit('create_subscription');
      
      this.auditLogger.log('info', 'Creating calendar webhook subscription', {
        userId: subscriptionData.userId,
        resource: subscriptionData.resource
      });

      const {
        userId,
        resource = 'me/calendar/events', // Default to primary calendar events
        changeTypes = ['created', 'updated', 'deleted'],
        notificationUrl,
        expirationDateTime,
        includeResourceData = false,
        clientState = null
      } = subscriptionData;

      // Generate client state for security if not provided
      const secureClientState = clientState || this.generateClientState(userId);
      
      // Default expiration: 3 days for calendar events (max allowed by Microsoft Graph)
      const defaultExpiration = new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString();

      const subscriptionRequest = {
        changeType: changeTypes.join(','),
        notificationUrl: notificationUrl,
        resource: resource,
        expirationDateTime: expirationDateTime || defaultExpiration,
        clientState: secureClientState,
        includeResourceData: includeResourceData
      };

      // Add encryption certificate if including resource data
      if (includeResourceData) {
        subscriptionRequest.encryptionCertificate = await this.getEncryptionCertificate();
        subscriptionRequest.encryptionCertificateId = process.env.GRAPH_ENCRYPTION_CERT_ID;
      }

      const response = await fetch(`${this.graphUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscriptionRequest)
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Create webhook subscription');
      }

      const subscription = await response.json();
      
      // Store subscription details for management
      this.activeSubscriptions.set(subscription.id, {
        ...subscription,
        userId,
        accessToken,
        createdAt: new Date(),
        lastRenewal: new Date()
      });

      // Store client state for validation
      this.clientStates.set(secureClientState, {
        subscriptionId: subscription.id,
        userId,
        createdAt: new Date()
      });

      this.auditLogger.log('info', 'Calendar webhook subscription created successfully', {
        subscriptionId: subscription.id,
        userId,
        resource: subscription.resource,
        expiresAt: subscription.expirationDateTime
      });

      return subscription;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to create calendar webhook subscription', {
        userId: subscriptionData.userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Renew an existing webhook subscription
   * @param {string} subscriptionId - Subscription ID to renew
   * @param {string} accessToken - Microsoft access token
   * @param {Date} newExpirationDateTime - New expiration time
   * @returns {Object} Updated subscription details
   */
  async renewSubscription(subscriptionId, accessToken, newExpirationDateTime = null) {
    try {
      await this.rateLimiter.checkLimit('renew_subscription');

      const subscription = this.activeSubscriptions.get(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found in active subscriptions');
      }

      // Default to 3 days from now if no expiration provided
      const expiration = newExpirationDateTime || 
        new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString();

      const updateRequest = {
        expirationDateTime: expiration
      };

      const response = await fetch(`${this.graphUrl}/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateRequest)
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Renew webhook subscription');
      }

      const updatedSubscription = await response.json();
      
      // Update our local tracking
      subscription.expirationDateTime = updatedSubscription.expirationDateTime;
      subscription.lastRenewal = new Date();

      this.auditLogger.log('info', 'Webhook subscription renewed', {
        subscriptionId,
        newExpirationDateTime: updatedSubscription.expirationDateTime
      });

      return updatedSubscription;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to renew webhook subscription', {
        subscriptionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a webhook subscription
   * @param {string} subscriptionId - Subscription ID to delete
   * @param {string} accessToken - Microsoft access token
   */
  async deleteSubscription(subscriptionId, accessToken) {
    try {
      await this.rateLimiter.checkLimit('delete_subscription');

      const response = await fetch(`${this.graphUrl}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok && response.status !== 404) {
        await this.oauthProvider.handleApiError(response, 'Delete webhook subscription');
      }

      // Clean up local tracking
      const subscription = this.activeSubscriptions.get(subscriptionId);
      if (subscription) {
        this.clientStates.delete(subscription.clientState);
        this.activeSubscriptions.delete(subscriptionId);
      }

      this.auditLogger.log('info', 'Webhook subscription deleted', { subscriptionId });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to delete webhook subscription', {
        subscriptionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process incoming webhook notification
   * @param {Object} notification - Webhook notification payload
   * @param {string} validationToken - Token for subscription validation
   * @returns {Object} Processing result
   */
  async processWebhookNotification(notification, validationToken = null) {
    try {
      // Handle subscription validation (initial setup)
      if (validationToken) {
        return this.handleSubscriptionValidation(validationToken);
      }

      // Validate the notification
      const isValid = await this.validateNotification(notification);
      if (!isValid) {
        throw new Error('Invalid webhook notification');
      }

      this.auditLogger.log('info', 'Processing webhook notification', {
        subscriptionId: notification.subscriptionId,
        changeType: notification.changeType,
        resource: notification.resource
      });

      const results = [];

      // Process each notification in the payload
      if (notification.value && Array.isArray(notification.value)) {
        for (const change of notification.value) {
          const result = await this.processChangeNotification(change);
          results.push(result);
        }
      } else {
        // Single notification
        const result = await this.processChangeNotification(notification);
        results.push(result);
      }

      this.auditLogger.log('info', 'Webhook notification processed successfully', {
        notificationsProcessed: results.length,
        successCount: results.filter(r => r.success).length
      });

      return {
        success: true,
        processed: results.length,
        results
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to process webhook notification', {
        error: error.message,
        notification: JSON.stringify(notification).substring(0, 500)
      });
      throw error;
    }
  }

  /**
   * Process a single change notification
   * @param {Object} change - Individual change notification
   * @returns {Object} Processing result
   */
  async processChangeNotification(change) {
    try {
      const {
        subscriptionId,
        changeType,
        resource,
        resourceData,
        clientState
      } = change;

      // Validate client state
      const subscriptionInfo = this.clientStates.get(clientState);
      if (!subscriptionInfo) {
        throw new Error('Invalid client state');
      }

      const subscription = this.activeSubscriptions.get(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Process based on resource type
      let processingResult;
      
      if (resource.includes('/calendar/events')) {
        processingResult = await this.processCalendarEventChange(
          change,
          subscription.userId,
          subscription.accessToken
        );
      } else if (resource.includes('/onlineMeetings')) {
        processingResult = await this.processTeamsMeetingChange(
          change,
          subscription.userId,
          subscription.accessToken
        );
      } else {
        this.auditLogger.log('warn', 'Unknown resource type in webhook', {
          resource,
          subscriptionId
        });
        return { success: false, reason: 'Unknown resource type' };
      }

      return {
        success: true,
        changeType,
        resource,
        processingResult
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to process change notification', {
        error: error.message,
        change
      });
      return {
        success: false,
        error: error.message,
        change
      };
    }
  }

  /**
   * Process calendar event change notification
   * @param {Object} change - Calendar event change
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @returns {Object} Processing result
   */
  async processCalendarEventChange(change, userId, accessToken) {
    try {
      const { changeType, resource, resourceData } = change;

      this.auditLogger.log('info', 'Processing calendar event change', {
        userId,
        changeType,
        eventId: resourceData?.id
      });

      switch (changeType) {
        case 'created':
          return await this.handleCalendarEventCreated(resourceData, userId, accessToken);
        
        case 'updated':
          return await this.handleCalendarEventUpdated(resourceData, userId, accessToken);
        
        case 'deleted':
          return await this.handleCalendarEventDeleted(resourceData, userId, accessToken);
        
        default:
          this.auditLogger.log('warn', 'Unknown calendar event change type', {
            changeType,
            userId
          });
          return { action: 'ignored', reason: 'Unknown change type' };
      }
    } catch (error) {
      this.auditLogger.log('error', 'Failed to process calendar event change', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle calendar event created notification
   * @param {Object} eventData - Event data from notification
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @returns {Object} Processing result
   */
  async handleCalendarEventCreated(eventData, userId, accessToken) {
    try {
      // Check if this event was created by PharmaDOC (to avoid sync loops)
      if (eventData.categories && eventData.categories.includes('PharmaDOC')) {
        return { action: 'ignored', reason: 'PharmaDOC managed event' };
      }

      // Fetch full event details if we only have basic data
      let fullEventData = eventData;
      if (!eventData.body || !eventData.attendees) {
        fullEventData = await this.fetchEventDetails(eventData.id, accessToken);
      }

      // Trigger sync for this specific event
      const syncResult = await this.syncService.syncEventsFromOutlook(
        userId,
        [fullEventData],
        { enableConflictResolution: true }
      );

      this.auditLogger.log('info', 'Calendar event created and synced', {
        userId,
        eventId: eventData.id,
        syncResult
      });

      return {
        action: 'synced',
        eventId: eventData.id,
        syncResult
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to handle calendar event created', {
        userId,
        eventId: eventData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle calendar event updated notification
   * @param {Object} eventData - Event data from notification
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @returns {Object} Processing result
   */
  async handleCalendarEventUpdated(eventData, userId, accessToken) {
    try {
      // Fetch full event details
      const fullEventData = await this.fetchEventDetails(eventData.id, accessToken);

      // Check if this is a PharmaDOC managed event
      if (fullEventData.categories && fullEventData.categories.includes('PharmaDOC')) {
        // Update corresponding PharmaDOC appointment
        return await this.updatePharmaDOCAppointmentFromEvent(fullEventData, userId);
      } else {
        // Sync external event changes
        const syncResult = await this.syncService.syncEventsFromOutlook(
          userId,
          [fullEventData],
          { enableConflictResolution: true }
        );

        return {
          action: 'synced',
          eventId: eventData.id,
          syncResult
        };
      }
    } catch (error) {
      this.auditLogger.log('error', 'Failed to handle calendar event updated', {
        userId,
        eventId: eventData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle calendar event deleted notification
   * @param {Object} eventData - Event data from notification
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @returns {Object} Processing result
   */
  async handleCalendarEventDeleted(eventData, userId, accessToken) {
    try {
      // Handle deletion of synced appointments or external events
      const deletionResult = await this.handleEventDeletion(eventData.id, userId);

      this.auditLogger.log('info', 'Calendar event deleted and processed', {
        userId,
        eventId: eventData.id,
        result: deletionResult
      });

      return {
        action: 'deleted',
        eventId: eventData.id,
        result: deletionResult
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to handle calendar event deleted', {
        userId,
        eventId: eventData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process Teams meeting change notification
   * @param {Object} change - Teams meeting change
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @returns {Object} Processing result
   */
  async processTeamsMeetingChange(change, userId, accessToken) {
    try {
      const { changeType, resourceData } = change;

      this.auditLogger.log('info', 'Processing Teams meeting change', {
        userId,
        changeType,
        meetingId: resourceData?.id
      });

      // Handle Teams meeting changes
      // This would integrate with your Teams meeting management
      return {
        action: 'processed',
        meetingId: resourceData.id,
        changeType
      };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to process Teams meeting change', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate incoming webhook notification
   * @param {Object} notification - Notification payload
   * @returns {boolean} Is valid
   */
  async validateNotification(notification) {
    try {
      // Check required fields
      if (!notification.subscriptionId || !notification.changeType) {
        return false;
      }

      // Validate client state if present
      if (notification.clientState) {
        const subscriptionInfo = this.clientStates.get(notification.clientState);
        if (!subscriptionInfo) {
          return false;
        }
      }

      // Additional validation can be added here
      // such as signature verification if using certificates

      return true;
    } catch (error) {
      this.auditLogger.log('error', 'Failed to validate notification', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Handle subscription validation during setup
   * @param {string} validationToken - Validation token from Microsoft
   * @returns {string} Validation token to return
   */
  handleSubscriptionValidation(validationToken) {
    this.auditLogger.log('info', 'Handling subscription validation', {
      tokenLength: validationToken.length
    });

    // Store validation token for potential future use
    this.validationTokens.set(validationToken, new Date());

    // Return the token as required by Microsoft Graph
    return validationToken;
  }

  /**
   * Generate secure client state for subscription
   * @param {string} userId - User ID
   * @returns {string} Generated client state
   */
  generateClientState(userId) {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const clientState = `${userId}-${timestamp}-${randomBytes}`;
    
    return crypto.createHash('sha256').update(clientState).digest('hex').substring(0, 32);
  }

  /**
   * Fetch full event details from Microsoft Graph
   * @param {string} eventId - Event ID
   * @param {string} accessToken - Microsoft access token
   * @returns {Object} Full event data
   */
  async fetchEventDetails(eventId, accessToken) {
    try {
      const response = await fetch(`${this.graphUrl}/me/calendar/events/${eventId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        await this.oauthProvider.handleApiError(response, 'Fetch event details');
      }

      return await response.json();
    } catch (error) {
      this.auditLogger.log('error', 'Failed to fetch event details', {
        eventId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get encryption certificate for resource data
   * @returns {string} Certificate content
   */
  async getEncryptionCertificate() {
    // This would load your encryption certificate for webhook security
    // Implementation depends on your certificate management
    return process.env.GRAPH_ENCRYPTION_CERTIFICATE || '';
  }

  /**
   * Update PharmaDOC appointment from Outlook event changes
   * @param {Object} eventData - Updated event data
   * @param {string} userId - User ID
   * @returns {Object} Update result
   */
  async updatePharmaDOCAppointmentFromEvent(eventData, userId) {
    try {
      // This would integrate with your PharmaDOC appointment service
      this.auditLogger.log('info', 'Updating PharmaDOC appointment from Outlook event', {
        userId,
        eventId: eventData.id
      });
      
      return { action: 'updated', appointmentId: 'temp-id' };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to update PharmaDOC appointment', {
        userId,
        eventId: eventData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle event deletion
   * @param {string} eventId - Deleted event ID
   * @param {string} userId - User ID
   * @returns {Object} Deletion result
   */
  async handleEventDeletion(eventId, userId) {
    try {
      // This would handle the deletion of synced appointments
      this.auditLogger.log('info', 'Handling event deletion', {
        userId,
        eventId
      });
      
      return { action: 'deleted', found: false };
    } catch (error) {
      this.auditLogger.log('error', 'Failed to handle event deletion', {
        userId,
        eventId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get subscription status and management info
   * @param {string} userId - User ID
   * @returns {Object} Subscription status
   */
  getSubscriptionStatus(userId) {
    const userSubscriptions = Array.from(this.activeSubscriptions.values())
      .filter(sub => sub.userId === userId);

    return {
      activeCount: userSubscriptions.length,
      subscriptions: userSubscriptions.map(sub => ({
        id: sub.id,
        resource: sub.resource,
        changeType: sub.changeType,
        expirationDateTime: sub.expirationDateTime,
        createdAt: sub.createdAt,
        lastRenewal: sub.lastRenewal
      }))
    };
  }

  /**
   * Auto-renew subscriptions that are about to expire
   */
  async autoRenewSubscriptions() {
    try {
      const now = new Date();
      const renewalThreshold = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours

      for (const [subscriptionId, subscription] of this.activeSubscriptions.entries()) {
        const expirationDate = new Date(subscription.expirationDateTime);
        
        if (expirationDate <= renewalThreshold) {
          try {
            await this.renewSubscription(subscriptionId, subscription.accessToken);
            this.auditLogger.log('info', 'Auto-renewed subscription', {
              subscriptionId,
              userId: subscription.userId
            });
          } catch (error) {
            this.auditLogger.log('error', 'Failed to auto-renew subscription', {
              subscriptionId,
              userId: subscription.userId,
              error: error.message
            });
          }
        }
      }
    } catch (error) {
      this.auditLogger.log('error', 'Auto-renewal process failed', {
        error: error.message
      });
    }
  }
}
