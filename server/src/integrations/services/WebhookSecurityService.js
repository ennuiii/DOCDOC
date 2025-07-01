/**
 * Webhook Security Service
 * Validates webhook signatures and authentication for all calendar and meeting providers
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class WebhookSecurityService {
  constructor() {
    // Security configuration
    this.config = {
      google: {
        requireChannelToken: true,
        maxAge: 3600000, // 1 hour
      },
      microsoft: {
        validateClientState: true,
        requireValidation: true,
      },
      zoom: {
        secretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN,
        validationToken: process.env.ZOOM_WEBHOOK_VALIDATION_TOKEN,
      },
      caldav: {
        apiKey: process.env.CALDAV_WEBHOOK_API_KEY,
      }
    };
  }

  /**
   * Validate webhook based on provider
   */
  async validateWebhook(req, provider) {
    try {
      switch (provider) {
        case 'google_calendar':
          return await this.validateGoogleWebhook(req);
        case 'microsoft_graph':
          return await this.validateMicrosoftGraphWebhook(req);
        case 'zoom':
          return await this.validateZoomWebhook(req);
        case 'caldav':
          return await this.validateCalDAVWebhook(req);
        default:
          return { valid: false, reason: 'Unknown provider' };
      }
    } catch (error) {
      console.error('Webhook validation error:', error);
      return { valid: false, reason: 'Validation error', error: error.message };
    }
  }

  /**
   * Validate Google Calendar webhook
   */
  async validateGoogleWebhook(req) {
    const headers = req.headers;
    
    // Check for required headers
    if (!headers['x-goog-channel-id'] || !headers['x-goog-resource-id']) {
      return { valid: false, reason: 'Missing required Google headers' };
    }
    
    // Validate channel token if configured
    if (this.config.google.requireChannelToken) {
      const channelToken = headers['x-goog-channel-token'];
      if (!channelToken) {
        return { valid: false, reason: 'Missing channel token' };
      }
      
      // Verify channel token (you would store this when creating the channel)
      const isValidToken = await this.verifyGoogleChannelToken(
        headers['x-goog-channel-id'],
        channelToken
      );
      
      if (!isValidToken) {
        return { valid: false, reason: 'Invalid channel token' };
      }
    }
    
    // Check expiration if provided
    const expiration = headers['x-goog-channel-expiration'];
    if (expiration) {
      const expirationTime = parseInt(expiration);
      if (Date.now() > expirationTime) {
        return { valid: false, reason: 'Channel expired' };
      }
    }
    
    // Validate resource state
    const resourceState = headers['x-goog-resource-state'];
    const validStates = ['exists', 'not_exists', 'sync'];
    if (resourceState && !validStates.includes(resourceState)) {
      return { valid: false, reason: 'Invalid resource state' };
    }
    
    return { valid: true };
  }

  /**
   * Validate Microsoft Graph webhook
   */
  async validateMicrosoftGraphWebhook(req) {
    const payload = req.body;
    
    // Handle validation request
    if (req.query.validationToken) {
      return { 
        valid: true, 
        isValidation: true, 
        validationToken: req.query.validationToken 
      };
    }
    
    // Validate notification payload
    if (!payload || !Array.isArray(payload.value)) {
      return { valid: false, reason: 'Invalid payload structure' };
    }
    
    for (const notification of payload.value) {
      // Check required fields
      if (!notification.subscriptionId || !notification.changeType || !notification.resource) {
        return { valid: false, reason: 'Missing required notification fields' };
      }
      
      // Validate client state if configured
      if (this.config.microsoft.validateClientState) {
        const isValidClientState = await this.verifyMicrosoftClientState(
          notification.subscriptionId,
          notification.clientState
        );
        
        if (!isValidClientState) {
          return { valid: false, reason: 'Invalid client state' };
        }
      }
      
      // Check subscription expiration
      if (notification.subscriptionExpirationDateTime) {
        const expirationTime = new Date(notification.subscriptionExpirationDateTime);
        if (Date.now() > expirationTime.getTime()) {
          return { valid: false, reason: 'Subscription expired' };
        }
      }
      
      // Validate change type
      const validChangeTypes = ['created', 'updated', 'deleted'];
      if (!validChangeTypes.includes(notification.changeType)) {
        return { valid: false, reason: 'Invalid change type' };
      }
    }
    
    return { valid: true };
  }

  /**
   * Validate Zoom webhook
   */
  async validateZoomWebhook(req) {
    const headers = req.headers;
    const payload = req.body;
    
    // Handle validation request
    if (payload.event === 'endpoint.url_validation') {
      return this.handleZoomValidation(payload);
    }
    
    // Validate authorization header
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { valid: false, reason: 'Missing or invalid authorization header' };
    }
    
    // Extract and validate token
    const token = authHeader.substring(7);
    if (token !== this.config.zoom.secretToken) {
      return { valid: false, reason: 'Invalid secret token' };
    }
    
    // Validate payload structure
    if (!payload.event || !payload.payload) {
      return { valid: false, reason: 'Invalid payload structure' };
    }
    
    // Validate timestamp (prevent replay attacks)
    const eventTs = payload.event_ts;
    if (eventTs) {
      const eventTime = eventTs * 1000; // Convert to milliseconds
      const now = Date.now();
      const maxAge = 300000; // 5 minutes
      
      if (Math.abs(now - eventTime) > maxAge) {
        return { valid: false, reason: 'Event timestamp too old' };
      }
    }
    
    // Validate event type
    const validEventTypes = [
      'meeting.started', 'meeting.ended', 'meeting.participant_joined',
      'meeting.participant_left', 'meeting.created', 'meeting.updated',
      'meeting.deleted', 'meeting.alert'
    ];
    
    if (!validEventTypes.includes(payload.event)) {
      return { valid: false, reason: 'Invalid event type' };
    }
    
    return { valid: true };
  }

  /**
   * Handle Zoom validation challenge
   */
  handleZoomValidation(payload) {
    if (payload.event !== 'endpoint.url_validation') {
      return { valid: false, reason: 'Not a validation request' };
    }
    
    const plainToken = payload.payload?.plainToken;
    const encryptedToken = payload.payload?.encryptedToken;
    
    if (!plainToken || !encryptedToken) {
      return { valid: false, reason: 'Missing validation tokens' };
    }
    
    // Decrypt and validate the token
    try {
      const decrypted = this.decryptZoomToken(encryptedToken);
      if (decrypted !== plainToken) {
        return { valid: false, reason: 'Token validation failed' };
      }
      
      return { 
        valid: true, 
        isValidation: true, 
        response: {
          plainToken,
          encryptedToken: this.encryptZoomResponse(plainToken)
        }
      };
      
    } catch (error) {
      return { valid: false, reason: 'Token decryption failed', error: error.message };
    }
  }

  /**
   * Validate CalDAV webhook
   */
  async validateCalDAVWebhook(req) {
    const headers = req.headers;
    const payload = req.body;
    
    // Validate API key
    const apiKey = headers['x-api-key'] || headers['authorization'];
    if (!apiKey) {
      return { valid: false, reason: 'Missing API key' };
    }
    
    // Extract key from bearer token if needed
    let extractedKey = apiKey;
    if (apiKey.startsWith('Bearer ')) {
      extractedKey = apiKey.substring(7);
    }
    
    if (extractedKey !== this.config.caldav.apiKey) {
      return { valid: false, reason: 'Invalid API key' };
    }
    
    // Validate payload structure
    if (!payload || !payload.calendar_url || !payload.change_type) {
      return { valid: false, reason: 'Invalid payload structure' };
    }
    
    // Validate change type
    const validChangeTypes = ['created', 'updated', 'deleted', 'calendar_changed'];
    if (!validChangeTypes.includes(payload.change_type)) {
      return { valid: false, reason: 'Invalid change type' };
    }
    
    // Validate timestamp
    if (payload.timestamp) {
      const eventTime = new Date(payload.timestamp).getTime();
      const now = Date.now();
      const maxAge = 3600000; // 1 hour
      
      if (Math.abs(now - eventTime) > maxAge) {
        return { valid: false, reason: 'Timestamp too old' };
      }
    }
    
    return { valid: true };
  }

  /**
   * Verify Google channel token
   */
  async verifyGoogleChannelToken(channelId, token) {
    // In a real implementation, you would check this against your database
    // where you store the tokens when creating channels
    try {
      // This is a simplified version - implement your own token storage/verification
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const { data, error } = await supabase
        .from('webhook_channels')
        .select('token')
        .eq('channel_id', channelId)
        .single();
      
      if (error || !data) {
        return false;
      }
      
      return data.token === token;
    } catch (error) {
      console.error('Error verifying Google channel token:', error);
      return false;
    }
  }

  /**
   * Verify Microsoft client state
   */
  async verifyMicrosoftClientState(subscriptionId, clientState) {
    // In a real implementation, you would check this against your database
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const { data, error } = await supabase
        .from('webhook_subscriptions')
        .select('client_state')
        .eq('subscription_id', subscriptionId)
        .single();
      
      if (error || !data) {
        return false;
      }
      
      return data.client_state === clientState;
    } catch (error) {
      console.error('Error verifying Microsoft client state:', error);
      return false;
    }
  }

  /**
   * Decrypt Zoom token (placeholder implementation)
   */
  decryptZoomToken(encryptedToken) {
    // Implement actual decryption logic based on Zoom's specification
    // This is a placeholder - you would use the actual decryption method
    try {
      const secretKey = this.config.zoom.secretToken;
      const decipher = crypto.createDecipher('aes-256-cbc', secretKey);
      let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt Zoom token');
    }
  }

  /**
   * Encrypt Zoom response token (placeholder implementation)
   */
  encryptZoomResponse(plainToken) {
    // Implement actual encryption logic based on Zoom's specification
    try {
      const secretKey = this.config.zoom.secretToken;
      const cipher = crypto.createCipher('aes-256-cbc', secretKey);
      let encrypted = cipher.update(plainToken, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      throw new Error('Failed to encrypt Zoom response');
    }
  }

  /**
   * Validate HMAC signature (generic method)
   */
  validateHMACSignature(payload, signature, secret, algorithm = 'sha256') {
    try {
      const expectedSignature = crypto
        .createHmac(algorithm, secret)
        .update(payload)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('HMAC validation error:', error);
      return false;
    }
  }

  /**
   * Validate JWT token
   */
  validateJWTToken(token, secret, options = {}) {
    try {
      const decoded = jwt.verify(token, secret, options);
      return { valid: true, payload: decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash data using SHA-256
   */
  hashData(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Constant time string comparison
   */
  constantTimeCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch (error) {
      return false;
    }
  }
}

module.exports = { WebhookSecurityService }; 