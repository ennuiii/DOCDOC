/**
 * Zoom Webhook Service for PharmaDOC Integration
 * Handles real-time Zoom webhook events and notifications
 */

const crypto = require('crypto');
const ZoomOAuthProvider = require('../providers/zoom/ZoomOAuthProvider');
const AuditLogger = require('./AuditLogger');
const { createClient } = require('@supabase/supabase-js');

class ZoomWebhookService {
  constructor() {
    this.zoomProvider = new ZoomOAuthProvider();
    this.auditLogger = new AuditLogger();
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Webhook configuration
    this.webhookSecret = process.env.ZOOM_WEBHOOK_SECRET;
    this.webhookUrl = process.env.ZOOM_WEBHOOK_URL;
    
    // Event subscriptions
    this.subscriptions = new Map();
    
    // Supported event types
    this.supportedEvents = [
      'meeting.started',
      'meeting.ended',
      'meeting.participant_joined',
      'meeting.participant_left',
      'meeting.registration_created',
      'meeting.registration_cancelled',
      'meeting.alert'
    ];

    // Event processing queue
    this.eventQueue = [];
    this.processingEvents = false;

    if (!this.webhookSecret) {
      console.warn('Zoom webhook secret not configured');
    }
  }

  /**
   * Validate webhook signature
   * @param {string} payload - Raw payload
   * @param {string} signature - Zoom signature header
   * @param {string} timestamp - Timestamp header
   * @returns {boolean} Validation result
   */
  validateWebhookSignature(payload, signature, timestamp) {
    try {
      if (!this.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      // Zoom uses HMAC-SHA256 for webhook signatures
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(`v0:${timestamp}:${payload}`)
        .digest('hex');

      const expectedHeader = `v0=${expectedSignature}`;

      // Compare signatures using timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedHeader)
      );
    } catch (error) {
      this.auditLogger.logError('zoom_webhook_signature_validation_failed', error, {
        hasSecret: !!this.webhookSecret,
        signatureLength: signature?.length,
        timestampLength: timestamp?.length
      });
      return false;
    }
  }

  /**
   * Process incoming webhook event
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Object} Processing result
   */
  async processWebhookEvent(req, res) {
    try {
      const signature = req.headers['x-zm-signature'];
      const timestamp = req.headers['x-zm-request-timestamp'];
      const payload = JSON.stringify(req.body);

      // Validate signature
      if (!this.validateWebhookSignature(payload, signature, timestamp)) {
        this.auditLogger.logError('zoom_webhook_invalid_signature', null, {
          signature: signature?.substring(0, 10) + '...',
          timestamp
        });
        return { success: false, error: 'Invalid signature' };
      }

      // Validate timestamp (prevent replay attacks)
      const now = Math.floor(Date.now() / 1000);
      const webhookTimestamp = parseInt(timestamp);
      
      if (Math.abs(now - webhookTimestamp) > 300) { // 5 minutes tolerance
        this.auditLogger.logError('zoom_webhook_timestamp_expired', null, {
          now,
          webhookTimestamp,
          difference: Math.abs(now - webhookTimestamp)
        });
        return { success: false, error: 'Timestamp expired' };
      }

      const event = req.body;
      
      // Validate event structure
      if (!event.event || !event.payload) {
        return { success: false, error: 'Invalid event structure' };
      }

      // Handle URL verification
      if (event.event === 'endpoint.url_validation') {
        return this.handleUrlValidation(event);
      }

      // Queue event for processing
      await this.queueEvent(event);

      this.auditLogger.log('zoom_webhook_event_received', {
        eventType: event.event,
        meetingId: event.payload?.object?.id,
        timestamp: webhookTimestamp
      });

      return { success: true, message: 'Event queued for processing' };
    } catch (error) {
      this.auditLogger.logError('zoom_webhook_processing_failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle URL validation challenge
   * @param {Object} event - Validation event
   * @returns {Object} Validation response
   */
  handleUrlValidation(event) {
    try {
      const { challenge_token, plain_token } = event.payload;
      
      if (!challenge_token || !plain_token) {
        return { success: false, error: 'Missing validation tokens' };
      }

      // Create HMAC-SHA256 hash of plain token
      const response = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(plain_token)
        .digest('hex');

      this.auditLogger.log('zoom_webhook_url_validation', {
        challengeToken: challenge_token.substring(0, 10) + '...',
        responseGenerated: true
      });

      return {
        success: true,
        response: {
          plainToken: plain_token,
          encryptedToken: response
        }
      };
    } catch (error) {
      this.auditLogger.logError('zoom_webhook_url_validation_failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue event for asynchronous processing
   * @param {Object} event - Webhook event
   */
  async queueEvent(event) {
    this.eventQueue.push({
      ...event,
      receivedAt: new Date().toISOString(),
      processed: false
    });

    // Start processing if not already running
    if (!this.processingEvents) {
      this.processEventQueue();
    }
  }

  /**
   * Process queued events
   */
  async processEventQueue() {
    this.processingEvents = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        
        try {
          await this.handleWebhookEvent(event);
          event.processed = true;
        } catch (error) {
          this.auditLogger.logError('zoom_webhook_event_processing_failed', error, {
            eventType: event.event,
            meetingId: event.payload?.object?.id
          });
          
          // Optionally retry failed events
          if (!event.retryCount) {
            event.retryCount = 0;
          }
          
          if (event.retryCount < 3) {
            event.retryCount++;
            this.eventQueue.push(event);
          }
        }

        // Small delay between events to prevent overwhelming the system
        await this.delay(100);
      }
    } finally {
      this.processingEvents = false;
    }
  }

  /**
   * Handle specific webhook event types
   * @param {Object} event - Webhook event
   */
  async handleWebhookEvent(event) {
    const eventType = event.event;
    const payload = event.payload;

    switch (eventType) {
      case 'meeting.started':
        await this.handleMeetingStarted(payload);
        break;
      case 'meeting.ended':
        await this.handleMeetingEnded(payload);
        break;
      case 'meeting.participant_joined':
        await this.handleParticipantJoined(payload);
        break;
      case 'meeting.participant_left':
        await this.handleParticipantLeft(payload);
        break;
      case 'meeting.registration_created':
        await this.handleRegistrationCreated(payload);
        break;
      case 'meeting.registration_cancelled':
        await this.handleRegistrationCancelled(payload);
        break;
      case 'meeting.alert':
        await this.handleMeetingAlert(payload);
        break;
      default:
        this.auditLogger.log('zoom_webhook_unhandled_event', {
          eventType,
          meetingId: payload?.object?.id
        });
    }
  }

  /**
   * Handle meeting started event
   * @param {Object} payload - Event payload
   */
  async handleMeetingStarted(payload) {
    try {
      const meeting = payload.object;
      const meetingId = meeting.id;

      // Find related PharmaDOC appointment
      const appointment = await this.findAppointmentByMeetingId(meetingId);
      
      if (appointment) {
        // Update appointment status
        await this.supabase
          .from('appointments')
          .update({
            status: 'in-progress',
            meeting_started_at: new Date().toISOString()
          })
          .eq('id', appointment.id);

        // Log meeting start
        this.auditLogger.log('zoom_meeting_started', {
          appointmentId: appointment.id,
          meetingId,
          hostId: meeting.host_id,
          startTime: meeting.start_time
        });

        // Send notifications (if needed)
        await this.sendMeetingStartNotification(appointment, meeting);
      }
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_started_handling_failed', error, {
        meetingId: payload?.object?.id
      });
    }
  }

  /**
   * Handle meeting ended event
   * @param {Object} payload - Event payload
   */
  async handleMeetingEnded(payload) {
    try {
      const meeting = payload.object;
      const meetingId = meeting.id;

      // Find related PharmaDOC appointment
      const appointment = await this.findAppointmentByMeetingId(meetingId);
      
      if (appointment) {
        // Update appointment status
        await this.supabase
          .from('appointments')
          .update({
            status: 'completed',
            meeting_ended_at: new Date().toISOString(),
            meeting_duration: meeting.duration
          })
          .eq('id', appointment.id);

        // Log meeting end
        this.auditLogger.log('zoom_meeting_ended', {
          appointmentId: appointment.id,
          meetingId,
          duration: meeting.duration,
          endTime: meeting.end_time
        });

        // Trigger follow-up actions
        await this.triggerMeetingFollowUp(appointment, meeting);
      }
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_ended_handling_failed', error, {
        meetingId: payload?.object?.id
      });
    }
  }

  /**
   * Handle participant joined event
   * @param {Object} payload - Event payload
   */
  async handleParticipantJoined(payload) {
    try {
      const meeting = payload.object;
      const participant = payload.object.participant;
      const meetingId = meeting.id;

      // Find related PharmaDOC appointment
      const appointment = await this.findAppointmentByMeetingId(meetingId);
      
      if (appointment) {
        // Log participant join
        this.auditLogger.log('zoom_participant_joined', {
          appointmentId: appointment.id,
          meetingId,
          participantId: participant.user_id,
          participantName: participant.user_name,
          joinTime: participant.join_time
        });

        // Update participant tracking
        await this.updateParticipantTracking(appointment.id, participant, 'joined');
      }
    } catch (error) {
      this.auditLogger.logError('zoom_participant_joined_handling_failed', error, {
        meetingId: payload?.object?.id
      });
    }
  }

  /**
   * Handle participant left event
   * @param {Object} payload - Event payload
   */
  async handleParticipantLeft(payload) {
    try {
      const meeting = payload.object;
      const participant = payload.object.participant;
      const meetingId = meeting.id;

      // Find related PharmaDOC appointment
      const appointment = await this.findAppointmentByMeetingId(meetingId);
      
      if (appointment) {
        // Log participant leave
        this.auditLogger.log('zoom_participant_left', {
          appointmentId: appointment.id,
          meetingId,
          participantId: participant.user_id,
          participantName: participant.user_name,
          leaveTime: participant.leave_time,
          duration: participant.duration
        });

        // Update participant tracking
        await this.updateParticipantTracking(appointment.id, participant, 'left');
      }
    } catch (error) {
      this.auditLogger.logError('zoom_participant_left_handling_failed', error, {
        meetingId: payload?.object?.id
      });
    }
  }

  /**
   * Handle registration created event
   * @param {Object} payload - Event payload
   */
  async handleRegistrationCreated(payload) {
    try {
      const meeting = payload.object;
      const registrant = payload.object.registrant;
      const meetingId = meeting.id;

      this.auditLogger.log('zoom_registration_created', {
        meetingId,
        registrantId: registrant.id,
        registrantEmail: registrant.email,
        createdAt: registrant.create_time
      });
    } catch (error) {
      this.auditLogger.logError('zoom_registration_created_handling_failed', error);
    }
  }

  /**
   * Handle registration cancelled event
   * @param {Object} payload - Event payload
   */
  async handleRegistrationCancelled(payload) {
    try {
      const meeting = payload.object;
      const registrant = payload.object.registrant;
      const meetingId = meeting.id;

      this.auditLogger.log('zoom_registration_cancelled', {
        meetingId,
        registrantId: registrant.id,
        registrantEmail: registrant.email
      });
    } catch (error) {
      this.auditLogger.logError('zoom_registration_cancelled_handling_failed', error);
    }
  }

  /**
   * Handle meeting alert event
   * @param {Object} payload - Event payload
   */
  async handleMeetingAlert(payload) {
    try {
      const meeting = payload.object;
      const alert = payload.object.alert;
      const meetingId = meeting.id;

      // Find related PharmaDOC appointment
      const appointment = await this.findAppointmentByMeetingId(meetingId);

      this.auditLogger.log('zoom_meeting_alert', {
        appointmentId: appointment?.id,
        meetingId,
        alertType: alert.type,
        alertMessage: alert.message,
        alertTime: alert.time
      });

      // Handle critical alerts
      if (alert.type === 'meeting_ended_by_host' || alert.type === 'meeting_disconnected') {
        await this.handleCriticalMeetingAlert(appointment, meeting, alert);
      }
    } catch (error) {
      this.auditLogger.logError('zoom_meeting_alert_handling_failed', error);
    }
  }

  /**
   * Find PharmaDOC appointment by Zoom meeting ID
   * @param {string} meetingId - Zoom meeting ID
   * @returns {Object|null} Appointment data
   */
  async findAppointmentByMeetingId(meetingId) {
    try {
      const { data: appointment, error } = await this.supabase
        .from('appointments')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is expected sometimes
        throw error;
      }

      return appointment;
    } catch (error) {
      this.auditLogger.logError('appointment_lookup_failed', error, { meetingId });
      return null;
    }
  }

  /**
   * Update participant tracking
   * @param {string} appointmentId - Appointment ID
   * @param {Object} participant - Participant data
   * @param {string} action - Action (joined/left)
   */
  async updateParticipantTracking(appointmentId, participant, action) {
    try {
      const participantData = {
        appointment_id: appointmentId,
        zoom_participant_id: participant.user_id,
        participant_name: participant.user_name,
        participant_email: participant.email,
        action,
        timestamp: new Date().toISOString(),
        duration: participant.duration || null
      };

      await this.supabase
        .from('meeting_participants')
        .insert(participantData);
    } catch (error) {
      this.auditLogger.logError('participant_tracking_update_failed', error, {
        appointmentId,
        participantId: participant.user_id
      });
    }
  }

  /**
   * Send meeting start notification
   * @param {Object} appointment - Appointment data
   * @param {Object} meeting - Meeting data
   */
  async sendMeetingStartNotification(appointment, meeting) {
    // Implementation would integrate with notification service
    // For now, just log the event
    this.auditLogger.log('meeting_start_notification_sent', {
      appointmentId: appointment.id,
      meetingId: meeting.id,
      doctorId: appointment.doctor_id,
      pharmaRepId: appointment.pharma_rep_id
    });
  }

  /**
   * Trigger meeting follow-up actions
   * @param {Object} appointment - Appointment data
   * @param {Object} meeting - Meeting data
   */
  async triggerMeetingFollowUp(appointment, meeting) {
    try {
      // Update appointment with meeting analytics
      const analyticsData = {
        meeting_duration: meeting.duration,
        meeting_end_time: meeting.end_time,
        meeting_analytics: {
          actualDuration: meeting.duration,
          scheduledDuration: appointment.duration,
          meetingId: meeting.id,
          hostId: meeting.host_id
        }
      };

      await this.supabase
        .from('appointments')
        .update(analyticsData)
        .eq('id', appointment.id);

      // Trigger follow-up notifications or workflows
      this.auditLogger.log('meeting_followup_triggered', {
        appointmentId: appointment.id,
        meetingId: meeting.id,
        duration: meeting.duration
      });
    } catch (error) {
      this.auditLogger.logError('meeting_followup_failed', error, {
        appointmentId: appointment.id,
        meetingId: meeting.id
      });
    }
  }

  /**
   * Handle critical meeting alerts
   * @param {Object} appointment - Appointment data
   * @param {Object} meeting - Meeting data
   * @param {Object} alert - Alert data
   */
  async handleCriticalMeetingAlert(appointment, meeting, alert) {
    try {
      if (!appointment) return;

      // Log critical alert
      this.auditLogger.log('zoom_critical_alert_handled', {
        appointmentId: appointment.id,
        meetingId: meeting.id,
        alertType: alert.type,
        alertMessage: alert.message
      });

      // Potentially notify administrators or trigger recovery actions
      // Implementation depends on specific business requirements
    } catch (error) {
      this.auditLogger.logError('critical_alert_handling_failed', error);
    }
  }

  /**
   * Setup webhook subscription
   * @param {string} accessToken - Access token
   * @param {Array} eventTypes - Event types to subscribe to
   * @returns {Object} Subscription result
   */
  async setupWebhookSubscription(accessToken, eventTypes = this.supportedEvents) {
    try {
      // Note: This would typically be done through Zoom Marketplace app configuration
      // rather than programmatically, but included for completeness
      
      const subscriptionData = {
        url: this.webhookUrl,
        events: eventTypes,
        secret: this.webhookSecret
      };

      this.auditLogger.log('zoom_webhook_subscription_setup', {
        url: this.webhookUrl,
        eventCount: eventTypes.length
      });

      return {
        success: true,
        subscription: subscriptionData
      };
    } catch (error) {
      this.auditLogger.logError('zoom_webhook_subscription_failed', error);
      throw new Error(`Failed to setup webhook subscription: ${error.message}`);
    }
  }

  /**
   * Get webhook health status
   * @returns {Object} Health status
   */
  getWebhookHealth() {
    return {
      configured: !!this.webhookSecret && !!this.webhookUrl,
      queueSize: this.eventQueue.length,
      processing: this.processingEvents,
      supportedEvents: this.supportedEvents,
      lastProcessed: this.lastProcessedEvent || null
    };
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ZoomWebhookService; 