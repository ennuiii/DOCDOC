/**
 * Webhook Processing Integration Tests
 * Comprehensive tests for the core webhook processing system
 * Tests all providers, security, queue processing, and monitoring
 */

const request = require('supertest');
const { WebhookProcessingService } = require('../services/WebhookProcessingService');
const { WebhookQueueService } = require('../services/WebhookQueueService');
const { WebhookSecurityService } = require('../services/WebhookSecurityService');
const { WebhookMonitoringService } = require('../services/WebhookMonitoringService');
const { createClient } = require('@supabase/supabase-js');

// Mock Express app for testing
const express = require('express');
const app = express();
app.use(express.json());

describe('Webhook Processing Integration Tests', () => {
  let webhookService;
  let queueService;
  let securityService;
  let monitoringService;
  let supabase;
  
  beforeAll(async () => {
    // Initialize services
    webhookService = new WebhookProcessingService();
    queueService = new WebhookQueueService();
    securityService = new WebhookSecurityService();
    monitoringService = new WebhookMonitoringService();
    
    // Initialize Supabase client
    supabase = createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
    );
    
    // Setup webhook endpoint
    app.post('/webhooks/:provider', async (req, res) => {
      await webhookService.processWebhook(req, res);
    });
    
    // Setup test data
    await setupTestData();
  });
  
  afterAll(async () => {
    await cleanupTestData();
    await webhookService.shutdown();
    await queueService.shutdown();
    await monitoringService.shutdown();
  });
  
  describe('Google Calendar Webhook Processing', () => {
    test('should process valid Google Calendar webhook', async () => {
      const response = await request(app)
        .post('/webhooks/google')
        .set({
          'x-goog-channel-id': 'test-channel-123',
          'x-goog-resource-id': 'test-resource-456',
          'x-goog-resource-uri': 'https://www.googleapis.com/calendar/v3/calendars/test@example.com/events',
          'x-goog-resource-state': 'exists',
          'x-goog-message-number': '1',
          'x-goog-channel-token': 'test-token'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.webhookId).toBeDefined();
    });
    
    test('should handle Google Calendar webhook with missing headers', async () => {
      const response = await request(app)
        .post('/webhooks/google')
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('webhook');
    });
    
    test('should process Google Calendar event deletion', async () => {
      const response = await request(app)
        .post('/webhooks/google')
        .set({
          'x-goog-channel-id': 'test-channel-123',
          'x-goog-resource-id': 'test-resource-456',
          'x-goog-resource-state': 'not_exists'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });
  
  describe('Microsoft Graph Webhook Processing', () => {
    test('should process valid Microsoft Graph webhook', async () => {
      const payload = {
        value: [
          {
            subscriptionId: 'test-subscription-123',
            clientState: 'test-client-state',
            changeType: 'created',
            resource: '/me/calendars/AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABiRd6AAA=/events/AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABiRd9AAA=',
            resourceData: {
              '@odata.type': '#Microsoft.Graph.Event',
              '@odata.id': '/Users/test@example.com/Events/AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABiRd9AAA=',
              id: 'AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OABGAAAAAAAiQ8W967B7TKBjgx9rVEURBwAiIsqMbYjsT5e-T7KzowPTAAAAAAEGAAAiIsqMbYjsT5e-T7KzowPTAAABiRd9AAA='
            },
            subscriptionExpirationDateTime: new Date(Date.now() + 3600000).toISOString()
          }
        ]
      };
      
      const response = await request(app)
        .post('/webhooks/microsoft')
        .send(payload)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
    });
    
    test('should handle Microsoft Graph validation request', async () => {
      const response = await request(app)
        .post('/webhooks/microsoft?validationToken=test-validation-token')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
    
    test('should process multiple Microsoft Graph notifications', async () => {
      const payload = {
        value: [
          {
            subscriptionId: 'test-subscription-1',
            changeType: 'created',
            resource: '/me/events/event1'
          },
          {
            subscriptionId: 'test-subscription-2',
            changeType: 'updated',
            resource: '/me/events/event2'
          }
        ]
      };
      
      const response = await request(app)
        .post('/webhooks/microsoft')
        .send(payload)
        .expect(200);
      
      expect(response.body.count).toBe(2);
    });
  });
  
  describe('Zoom Webhook Processing', () => {
    test('should process valid Zoom webhook', async () => {
      const payload = {
        event: 'meeting.started',
        event_ts: Math.floor(Date.now() / 1000),
        payload: {
          account_id: 'test-account-123',
          object: {
            id: 'test-meeting-456',
            uuid: 'test-uuid-789',
            start_time: new Date().toISOString(),
            topic: 'Test Meeting'
          }
        }
      };
      
      const response = await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send(payload)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.meetingId).toBe('test-meeting-456');
    });
    
    test('should handle Zoom URL validation', async () => {
      const payload = {
        event: 'endpoint.url_validation',
        payload: {
          plainToken: 'test-plain-token',
          encryptedToken: 'test-encrypted-token'
        }
      };
      
      const response = await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send(payload)
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
    
    test('should process Zoom participant events', async () => {
      const payload = {
        event: 'meeting.participant_joined',
        event_ts: Math.floor(Date.now() / 1000),
        payload: {
          object: {
            id: 'test-meeting-456'
          },
          participant: {
            user_name: 'John Doe',
            user_email: 'john@example.com',
            join_time: new Date().toISOString()
          }
        }
      };
      
      const response = await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send(payload)
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });
  
  describe('CalDAV Webhook Processing', () => {
    test('should process valid CalDAV webhook', async () => {
      const payload = {
        calendar_url: 'https://caldav.example.com/calendars/user/calendar/',
        event_uid: 'test-event-uid-123',
        change_type: 'updated',
        etag: 'test-etag-456',
        timestamp: new Date().toISOString()
      };
      
      const response = await request(app)
        .post('/webhooks/caldav')
        .set('X-API-Key', process.env.CALDAV_WEBHOOK_API_KEY || 'test-api-key')
        .send(payload)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.calendarUrl).toBe(payload.calendar_url);
    });
    
    test('should handle CalDAV calendar-level changes', async () => {
      const payload = {
        calendar_url: 'https://caldav.example.com/calendars/user/calendar/',
        change_type: 'calendar_changed',
        timestamp: new Date().toISOString()
      };
      
      const response = await request(app)
        .post('/webhooks/caldav')
        .set('X-API-Key', process.env.CALDAV_WEBHOOK_API_KEY || 'test-api-key')
        .send(payload)
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });
  
  describe('Security Validation', () => {
    test('should reject webhook with invalid provider', async () => {
      const response = await request(app)
        .post('/webhooks/invalid')
        .expect(400);
      
      expect(response.body.error).toContain('Unknown webhook provider');
    });
    
    test('should reject Zoom webhook with invalid token', async () => {
      const payload = {
        event: 'meeting.started',
        payload: { object: { id: 'test-meeting' } }
      };
      
      const response = await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', 'Bearer invalid-token')
        .send(payload)
        .expect(401);
      
      expect(response.body.error).toContain('authentication failed');
    });
    
    test('should reject CalDAV webhook without API key', async () => {
      const payload = {
        calendar_url: 'https://caldav.example.com/calendars/user/calendar/',
        change_type: 'updated'
      };
      
      const response = await request(app)
        .post('/webhooks/caldav')
        .send(payload)
        .expect(401);
      
      expect(response.body.error).toContain('authentication failed');
    });
  });
  
  describe('Queue Processing', () => {
    test('should queue sync jobs correctly', async () => {
      const job = await queueService.queueSync({
        provider: 'google_calendar',
        integrationId: 'test-integration-123',
        userId: 'test-user-456',
        eventType: 'google.calendar.event.created',
        priority: 'high',
        webhookId: 'test-webhook-789'
      });
      
      expect(job.id).toBeDefined();
      expect(job.type).toBe('sync');
      expect(job.priority).toBe('high');
      expect(job.status).toBe('pending');
    });
    
    test('should queue meeting event jobs correctly', async () => {
      const job = await queueService.queueMeetingEvent({
        provider: 'zoom',
        appointmentId: 'test-appointment-123',
        meetingId: 'test-meeting-456',
        eventType: 'zoom.meeting.started',
        priority: 'high',
        webhookId: 'test-webhook-789',
        eventData: { meeting: { id: 'test-meeting-456' } }
      });
      
      expect(job.id).toBeDefined();
      expect(job.type).toBe('meeting_event');
      expect(job.priority).toBe('high');
    });
    
    test('should process queue with priority ordering', async () => {
      // Queue jobs with different priorities
      await queueService.queueSync({
        provider: 'google_calendar',
        integrationId: 'test-1',
        priority: 'low'
      });
      
      await queueService.queueSync({
        provider: 'google_calendar',
        integrationId: 'test-2',
        priority: 'high'
      });
      
      await queueService.queueSync({
        provider: 'google_calendar',
        integrationId: 'test-3',
        priority: 'medium'
      });
      
      const stats = queueService.getQueueStats();
      expect(stats.queues.high).toBe(1);
      expect(stats.queues.medium).toBe(1);
      expect(stats.queues.low).toBe(1);
    });
  });
  
  describe('Monitoring and Metrics', () => {
    test('should record webhook processing metrics', async () => {
      await monitoringService.recordWebhookProcessing(
        'test-webhook-123',
        'google_calendar',
        true,
        1500,
        'google.calendar.event.created'
      );
      
      const metrics = monitoringService.getCurrentMetrics();
      expect(metrics.webhooksProcessed).toBeGreaterThan(0);
      expect(metrics.webhooksSuccessful).toBeGreaterThan(0);
    });
    
    test('should record security violations', async () => {
      await monitoringService.recordSecurityViolation(
        'test-webhook-123',
        'zoom',
        'Invalid token',
        { reason: 'Token mismatch' }
      );
      
      const metrics = monitoringService.getCurrentMetrics();
      expect(metrics.securityViolations).toBeGreaterThan(0);
    });
    
    test('should generate performance reports', async () => {
      const report = await monitoringService.generatePerformanceReport();
      
      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.current).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });
  });
  
  describe('Error Handling', () => {
    test('should handle malformed JSON payloads', async () => {
      const response = await request(app)
        .post('/webhooks/zoom')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send('invalid json')
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
    
    test('should handle database connection errors gracefully', async () => {
      // Temporarily break database connection
      const originalUrl = process.env.SUPABASE_URL;
      process.env.SUPABASE_URL = 'http://invalid-url';
      
      const payload = {
        event: 'meeting.started',
        payload: { object: { id: 'test-meeting' } }
      };
      
      const response = await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send(payload)
        .expect(500);
      
      expect(response.body.success).toBe(false);
      
      // Restore original URL
      process.env.SUPABASE_URL = originalUrl;
    });
    
    test('should retry failed jobs', async () => {
      // Create a job that will fail
      const job = await queueService.queueSync({
        provider: 'invalid_provider',
        integrationId: 'test-integration-123',
        priority: 'medium'
      });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check that job was marked for retry
      const { data } = await supabase
        .from('webhook_jobs')
        .select('status, attempts')
        .eq('id', job.id)
        .single();
      
      expect(data?.status).toMatch(/failed|retry/);
    });
  });
  
  describe('Load Testing', () => {
    test('should handle concurrent webhook requests', async () => {
      const concurrentRequests = 10;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        const promise = request(app)
          .post('/webhooks/google')
          .set({
            'x-goog-channel-id': `test-channel-${i}`,
            'x-goog-resource-id': `test-resource-${i}`,
            'x-goog-resource-state': 'exists'
          });
        
        promises.push(promise);
      }
      
      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
    
    test('should handle burst of Zoom events', async () => {
      const burstSize = 20;
      const promises = [];
      
      for (let i = 0; i < burstSize; i++) {
        const payload = {
          event: 'meeting.participant_joined',
          event_ts: Math.floor(Date.now() / 1000),
          payload: {
            object: { id: `meeting-${i}` },
            participant: { user_name: `User ${i}` }
          }
        };
        
        const promise = request(app)
          .post('/webhooks/zoom')
          .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
          .send(payload);
        
        promises.push(promise);
      }
      
      const responses = await Promise.all(promises);
      
      // Check success rate
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount / burstSize).toBeGreaterThan(0.9); // 90% success rate
    });
  });
  
  describe('End-to-End Workflows', () => {
    test('should complete full Google Calendar sync workflow', async () => {
      // 1. Receive webhook
      const response = await request(app)
        .post('/webhooks/google')
        .set({
          'x-goog-channel-id': 'e2e-test-channel',
          'x-goog-resource-id': 'e2e-test-resource',
          'x-goog-resource-state': 'exists'
        })
        .expect(200);
      
      // 2. Verify webhook was processed
      expect(response.body.success).toBe(true);
      
      // 3. Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 4. Check that sync job was created and processed
      const { data: jobs } = await supabase
        .from('webhook_jobs')
        .select('*')
        .eq('webhook_id', response.body.webhookId);
      
      expect(jobs?.length).toBeGreaterThan(0);
    });
    
    test('should complete full Zoom meeting lifecycle', async () => {
      const meetingId = 'e2e-test-meeting-123';
      
      // 1. Meeting started
      await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send({
          event: 'meeting.started',
          event_ts: Math.floor(Date.now() / 1000),
          payload: { object: { id: meetingId } }
        })
        .expect(200);
      
      // 2. Participant joined
      await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send({
          event: 'meeting.participant_joined',
          event_ts: Math.floor(Date.now() / 1000),
          payload: {
            object: { id: meetingId },
            participant: { user_name: 'John Doe' }
          }
        })
        .expect(200);
      
      // 3. Meeting ended
      await request(app)
        .post('/webhooks/zoom')
        .set('Authorization', `Bearer ${process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'test-token'}`)
        .send({
          event: 'meeting.ended',
          event_ts: Math.floor(Date.now() / 1000),
          payload: { object: { id: meetingId } }
        })
        .expect(200);
      
      // 4. Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 5. Verify all events were logged
      const { data: logs } = await supabase
        .from('appointment_logs')
        .select('*')
        .contains('event_data', { object: { id: meetingId } });
      
      expect(logs?.length).toBeGreaterThanOrEqual(3);
    });
  });
  
  // Helper functions
  async function setupTestData() {
    // Create test integrations
    await supabase
      .from('calendar_integrations')
      .upsert([
        {
          id: 'test-integration-123',
          user_id: 'test-user-456',
          provider: 'google_calendar',
          status: 'active',
          config: { channelId: 'test-channel-123' }
        },
        {
          id: 'test-integration-456',
          user_id: 'test-user-789',
          provider: 'microsoft_graph',
          status: 'active',
          config: { subscriptionId: 'test-subscription-123' }
        }
      ]);
    
    // Create test appointments
    await supabase
      .from('appointments')
      .upsert([
        {
          id: 'test-appointment-123',
          external_provider: 'zoom',
          external_meeting_id: 'test-meeting-456',
          status: 'scheduled'
        }
      ]);
  }
  
  async function cleanupTestData() {
    // Clean up test data
    await supabase.from('webhook_jobs').delete().ilike('id', 'job_%');
    await supabase.from('webhook_metrics').delete().gte('timestamp', new Date(Date.now() - 3600000).toISOString());
    await supabase.from('calendar_integrations').delete().eq('user_id', 'test-user-456');
    await supabase.from('appointments').delete().eq('id', 'test-appointment-123');
  }
});

module.exports = {
  setupTestData,
  cleanupTestData
}; 