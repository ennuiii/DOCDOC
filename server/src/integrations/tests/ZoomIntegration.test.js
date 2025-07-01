/**
 * Zoom Integration Test Suite
 * Comprehensive tests for Zoom functionality in PharmaDOC
 */

const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const { createClient } = require('@supabase/supabase-js');
const ZoomOAuthProvider = require('../providers/zoom/ZoomOAuthProvider');
const ZoomMeetingService = require('../services/ZoomMeetingService');
const ZoomWebhookService = require('../services/ZoomWebhookService');

// Mock external dependencies
jest.mock('@supabase/supabase-js');
jest.mock('axios');

describe('Zoom Integration Tests', () => {
  let zoomOAuthProvider;
  let zoomMeetingService;
  let zoomWebhookService;
  let mockSupabase;

  // Test data
  const mockAppointment = {
    id: 'apt_123456',
    purpose: 'Clinical trial discussion',
    duration: 60,
    doctor_id: 'doctor_123',
    pharma_rep_id: 'rep_456',
    video_provider: 'zoom',
    meeting_type: 'virtual',
    status: 'scheduled',
    timezone: 'America/New_York',
    integration_data: {
      zoom: {
        security: {
          waitingRoom: true,
          enforceLogin: true
        }
      }
    },
    timeslots: {
      date: '2024-01-15',
      start_time: '14:00:00',
      end_time: '15:00:00'
    },
    doctor: {
      id: 'doctor_123',
      name: 'Dr. Sarah Johnson',
      email: 'sarah.johnson@hospital.com'
    },
    pharma_rep: {
      id: 'rep_456',
      name: 'Michael Chen',
      email: 'michael.chen@pharma.com'
    }
  };

  const mockZoomMeeting = {
    id: '123456789',
    uuid: 'test-uuid-123',
    topic: 'PharmaDOC: Clinical trial discussion',
    type: 2,
    status: 'waiting',
    startTime: '2024-01-15T14:00:00Z',
    duration: 60,
    timezone: 'America/New_York',
    agenda: 'Virtual meeting between Dr. Sarah Johnson and Michael Chen',
    joinUrl: 'https://zoom.us/j/123456789?pwd=testpassword',
    password: '123456',
    hostId: 'host_123',
    hostEmail: 'sarah.johnson@hospital.com',
    createdAt: '2024-01-15T13:00:00Z',
    settings: {
      hostVideo: true,
      participantVideo: true,
      joinBeforeHost: false,
      muteUponEntry: true,
      waitingRoom: true,
      autoRecording: 'none',
      enforceLogin: true
    }
  };

  const mockTokens = {
    access_token: 'mock_zoom_access_token',
    refresh_token: 'mock_zoom_refresh_token',
    token_type: 'Bearer',
    expires_in: 3600,
    expires_at: '2024-01-15T16:00:00Z',
    scope: 'meeting:write meeting:read user:read'
  };

  const mockWebhookEvent = {
    event: 'meeting.started',
    payload: {
      account_id: 'account_123',
      object: {
        id: '123456789',
        uuid: 'test-uuid-123',
        host_id: 'host_123',
        topic: 'PharmaDOC: Clinical trial discussion',
        type: 2,
        start_time: '2024-01-15T14:00:00Z',
        duration: 60
      }
    },
    event_ts: 1640995200000
  };

  beforeEach(() => {
    // Setup mocks
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockAppointment })
    };

    createClient.mockReturnValue(mockSupabase);

    // Initialize services with mocked dependencies
    zoomOAuthProvider = new ZoomOAuthProvider();
    zoomMeetingService = new ZoomMeetingService();
    zoomWebhookService = new ZoomWebhookService();

    // Mock HTTP requests
    const axios = require('axios');
    axios.mockResolvedValue({
      data: mockZoomMeeting,
      headers: {},
      status: 200
    });

    // Set up environment variables for testing
    process.env.ZOOM_CLIENT_ID = 'test_client_id';
    process.env.ZOOM_CLIENT_SECRET = 'test_client_secret';
    process.env.ZOOM_REDIRECT_URI = 'http://localhost:3000/auth/zoom/callback';
    process.env.ZOOM_WEBHOOK_SECRET = 'test_webhook_secret';

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('ZoomOAuthProvider Tests', () => {
    describe('generateAuthUrl', () => {
      it('should generate valid authorization URL', () => {
        const result = zoomOAuthProvider.generateAuthUrl('user_123');

        expect(result.authUrl).toContain('https://zoom.us/oauth/authorize');
        expect(result.authUrl).toContain('client_id=test_client_id');
        expect(result.authUrl).toContain('response_type=code');
        expect(result.state).toBeDefined();
        expect(result.scopes).toContain('meeting:write');
      });

      it('should include custom scopes when provided', () => {
        const customScopes = ['meeting:read', 'user:read'];
        const result = zoomOAuthProvider.generateAuthUrl('user_123', customScopes);

        expect(result.scopes).toEqual(customScopes);
      });
    });

    describe('exchangeCodeForTokens', () => {
      it('should exchange authorization code for tokens', async () => {
        const axios = require('axios');
        axios.mockResolvedValue({
          data: {
            access_token: 'new_access_token',
            refresh_token: 'new_refresh_token',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'meeting:write meeting:read'
          }
        });

        const state = zoomOAuthProvider.generateSecureState('user_123');
        const result = await zoomOAuthProvider.exchangeCodeForTokens('auth_code_123', state);

        expect(result.access_token).toBe('new_access_token');
        expect(result.refresh_token).toBe('new_refresh_token');
        expect(result.expires_at).toBeDefined();
      });

      it('should validate state parameter', async () => {
        await expect(
          zoomOAuthProvider.exchangeCodeForTokens('auth_code_123', 'invalid_state')
        ).rejects.toThrow('Invalid state parameter');
      });
    });

    describe('createMeeting', () => {
      it('should create Zoom meeting with correct parameters', async () => {
        const meetingData = {
          topic: 'Test Meeting',
          type: 2,
          startTime: '2024-01-15T14:00:00Z',
          duration: 60,
          timezone: 'UTC'
        };

        const result = await zoomOAuthProvider.createMeeting('access_token', meetingData);

        expect(result.topic).toBe('PharmaDOC: Clinical trial discussion');
        expect(result.joinUrl).toContain('zoom.us');
        expect(result.password).toBeDefined();
      });

      it('should apply pharmaceutical security settings', async () => {
        const meetingData = {
          topic: 'Secure Meeting',
          securityProfile: 'pharmaceutical'
        };

        const result = await zoomOAuthProvider.createMeeting('access_token', meetingData);

        expect(result.settings.waitingRoom).toBe(true);
        expect(result.settings.enforceLogin).toBe(true);
        expect(result.settings.joinBeforeHost).toBe(false);
      });
    });

    describe('validateToken', () => {
      it('should validate valid access token', async () => {
        const axios = require('axios');
        axios.mockResolvedValue({
          data: {
            id: 'user_123',
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe'
          }
        });

        const result = await zoomOAuthProvider.validateToken('valid_token');

        expect(result.valid).toBe(true);
        expect(result.user).toBeDefined();
        expect(result.user.email).toBe('user@example.com');
      });

      it('should handle invalid token', async () => {
        const axios = require('axios');
        axios.mockRejectedValue({
          response: { status: 401 }
        });

        const result = await zoomOAuthProvider.validateToken('invalid_token');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Token expired or invalid');
      });
    });
  });

  describe('ZoomMeetingService Tests', () => {
    describe('createMeetingForAppointment', () => {
      it('should create meeting for PharmaDOC appointment', async () => {
        // Mock the OAuth provider createMeeting method
        jest.spyOn(zoomOAuthProvider, 'createMeeting').mockResolvedValue(mockZoomMeeting);

        const result = await zoomMeetingService.createMeetingForAppointment(
          'access_token',
          mockAppointment
        );

        expect(result.success).toBe(true);
        expect(result.meeting).toEqual(mockZoomMeeting);
        expect(result.joinUrl).toBe(mockZoomMeeting.joinUrl);
        expect(mockSupabase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            meeting_link: mockZoomMeeting.joinUrl,
            meeting_id: mockZoomMeeting.id
          })
        );
      });

      it('should apply security settings based on appointment context', async () => {
        const sensitiveAppointment = {
          ...mockAppointment,
          purpose: 'Clinical trial regulatory review'
        };

        jest.spyOn(zoomOAuthProvider, 'createMeeting').mockResolvedValue(mockZoomMeeting);

        await zoomMeetingService.createMeetingForAppointment(
          'access_token',
          sensitiveAppointment
        );

        expect(zoomOAuthProvider.createMeeting).toHaveBeenCalledWith(
          'access_token',
          expect.objectContaining({
            securityProfile: 'pharmaceutical'
          })
        );
      });
    });

    describe('generateMeetingInvitations', () => {
      it('should generate HTML invitation', async () => {
        const invitations = await zoomMeetingService.generateMeetingInvitations(
          mockZoomMeeting,
          mockAppointment
        );

        expect(invitations.html).toContain('PharmaDOC Meeting Invitation');
        expect(invitations.html).toContain(mockZoomMeeting.joinUrl);
        expect(invitations.html).toContain('Dr. Sarah Johnson');
      });

      it('should generate text invitation', async () => {
        const invitations = await zoomMeetingService.generateMeetingInvitations(
          mockZoomMeeting,
          mockAppointment
        );

        expect(invitations.text).toContain('JOIN ZOOM MEETING');
        expect(invitations.text).toContain(mockZoomMeeting.joinUrl);
        expect(invitations.text).toContain(mockZoomMeeting.password);
      });

      it('should generate ICS calendar file', async () => {
        const invitations = await zoomMeetingService.generateMeetingInvitations(
          mockZoomMeeting,
          mockAppointment
        );

        expect(invitations.ics).toContain('BEGIN:VCALENDAR');
        expect(invitations.ics).toContain('BEGIN:VEVENT');
        expect(invitations.ics).toContain(mockZoomMeeting.joinUrl);
        expect(invitations.ics).toContain('END:VEVENT');
        expect(invitations.ics).toContain('END:VCALENDAR');
      });
    });

    describe('validateMeetingAccess', () => {
      it('should authorize appointment participants', async () => {
        const result = await zoomMeetingService.validateMeetingAccess(
          mockZoomMeeting.id,
          'doctor_123',
          mockAppointment.id
        );

        expect(result.authorized).toBe(true);
        expect(result.role).toBe('doctor');
        expect(result.permissions.canStartMeeting).toBe(true);
      });

      it('should deny access to unauthorized users', async () => {
        const result = await zoomMeetingService.validateMeetingAccess(
          mockZoomMeeting.id,
          'unauthorized_user',
          mockAppointment.id
        );

        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('not authorized');
      });

      it('should deny access to cancelled meetings', async () => {
        mockSupabase.single.mockResolvedValueOnce({
          data: { ...mockAppointment, status: 'cancelled' }
        });

        const result = await zoomMeetingService.validateMeetingAccess(
          mockZoomMeeting.id,
          'doctor_123',
          mockAppointment.id
        );

        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('cancelled');
      });
    });

    describe('Security Configuration', () => {
      it('should determine pharmaceutical security profile', async () => {
        const sensitiveAppointment = {
          ...mockAppointment,
          purpose: 'Clinical trial data review'
        };

        const profile = zoomMeetingService.determineSecurityProfile(sensitiveAppointment);
        expect(profile).toBe('pharmaceutical');
      });

      it('should determine business security profile', async () => {
        const businessAppointment = {
          ...mockAppointment,
          purpose: 'Product demonstration'
        };

        const profile = zoomMeetingService.determineSecurityProfile(businessAppointment);
        expect(profile).toBe('business');
      });

      it('should configure security settings correctly', async () => {
        const config = await zoomMeetingService.configureSecuritySettings(mockAppointment);

        expect(config.waitingRoom).toBe(true);
        expect(config.enforceLogin).toBe(true);
        expect(config.maxParticipants).toBe(4);
      });
    });
  });

  describe('ZoomWebhookService Tests', () => {
    describe('validateWebhookSignature', () => {
      it('should validate correct webhook signature', () => {
        const payload = JSON.stringify(mockWebhookEvent);
        const timestamp = '1640995200';
        const secret = 'test_webhook_secret';
        
        // Create expected signature
        const crypto = require('crypto');
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(`v0:${timestamp}:${payload}`)
          .digest('hex');
        const signature = `v0=${expectedSignature}`;

        const isValid = zoomWebhookService.validateWebhookSignature(payload, signature, timestamp);
        expect(isValid).toBe(true);
      });

      it('should reject invalid signature', () => {
        const payload = JSON.stringify(mockWebhookEvent);
        const timestamp = '1640995200';
        const invalidSignature = 'v0=invalid_signature';

        const isValid = zoomWebhookService.validateWebhookSignature(payload, invalidSignature, timestamp);
        expect(isValid).toBe(false);
      });
    });

    describe('processWebhookEvent', () => {
      it('should process valid webhook event', async () => {
        const req = {
          headers: {
            'x-zm-signature': 'v0=valid_signature',
            'x-zm-request-timestamp': Math.floor(Date.now() / 1000).toString()
          },
          body: mockWebhookEvent
        };

        // Mock signature validation
        jest.spyOn(zoomWebhookService, 'validateWebhookSignature').mockReturnValue(true);

        const result = await zoomWebhookService.processWebhookEvent(req, {});

        expect(result.success).toBe(true);
        expect(result.message).toBe('Event queued for processing');
      });

      it('should handle URL validation challenge', async () => {
        const validationEvent = {
          event: 'endpoint.url_validation',
          payload: {
            challenge_token: 'challenge_123',
            plain_token: 'plain_123'
          }
        };

        const req = {
          headers: {
            'x-zm-signature': 'v0=valid_signature',
            'x-zm-request-timestamp': Math.floor(Date.now() / 1000).toString()
          },
          body: validationEvent
        };

        jest.spyOn(zoomWebhookService, 'validateWebhookSignature').mockReturnValue(true);

        const result = await zoomWebhookService.processWebhookEvent(req, {});

        expect(result.success).toBe(true);
        expect(result.response.plainToken).toBe('plain_123');
        expect(result.response.encryptedToken).toBeDefined();
      });
    });

    describe('Event Handling', () => {
      it('should handle meeting started event', async () => {
        await zoomWebhookService.handleMeetingStarted(mockWebhookEvent.payload);

        expect(mockSupabase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'in-progress',
            meeting_started_at: expect.any(String)
          })
        );
      });

      it('should handle meeting ended event', async () => {
        const endedEvent = {
          ...mockWebhookEvent.payload,
          object: {
            ...mockWebhookEvent.payload.object,
            end_time: '2024-01-15T15:00:00Z',
            duration: 60
          }
        };

        await zoomWebhookService.handleMeetingEnded(endedEvent);

        expect(mockSupabase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'completed',
            meeting_ended_at: expect.any(String),
            meeting_duration: 60
          })
        );
      });

      it('should handle participant joined event', async () => {
        const participantEvent = {
          ...mockWebhookEvent.payload,
          object: {
            ...mockWebhookEvent.payload.object,
            participant: {
              user_id: 'participant_123',
              user_name: 'John Doe',
              email: 'john@example.com',
              join_time: '2024-01-15T14:05:00Z'
            }
          }
        };

        await zoomWebhookService.handleParticipantJoined(participantEvent);

        expect(mockSupabase.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            appointment_id: mockAppointment.id,
            zoom_participant_id: 'participant_123',
            action: 'joined'
          })
        );
      });
    });
  });

  describe('Integration Workflow Tests', () => {
    it('should complete full meeting creation workflow', async () => {
      // Mock all dependencies
      jest.spyOn(zoomOAuthProvider, 'createMeeting').mockResolvedValue(mockZoomMeeting);

      // Step 1: Create meeting
      const meetingResult = await zoomMeetingService.createMeetingForAppointment(
        'access_token',
        mockAppointment
      );

      // Step 2: Generate invitations
      const invitations = await zoomMeetingService.generateMeetingInvitations(
        meetingResult.meeting,
        mockAppointment
      );

      // Step 3: Validate access
      const accessValidation = await zoomMeetingService.validateMeetingAccess(
        meetingResult.meetingId,
        'doctor_123',
        mockAppointment.id
      );

      // Verify complete workflow
      expect(meetingResult.success).toBe(true);
      expect(invitations.html).toContain('PharmaDOC Meeting Invitation');
      expect(accessValidation.authorized).toBe(true);
    });

    it('should handle webhook events for created meeting', async () => {
      // Create meeting
      jest.spyOn(zoomOAuthProvider, 'createMeeting').mockResolvedValue(mockZoomMeeting);
      
      const meetingResult = await zoomMeetingService.createMeetingForAppointment(
        'access_token',
        mockAppointment
      );

      // Simulate webhook events
      await zoomWebhookService.handleMeetingStarted(mockWebhookEvent.payload);
      
      const endedEvent = {
        ...mockWebhookEvent.payload,
        object: { ...mockWebhookEvent.payload.object, duration: 60 }
      };
      await zoomWebhookService.handleMeetingEnded(endedEvent);

      // Verify workflow integration
      expect(meetingResult.success).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledTimes(3); // Create, start, end
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle OAuth token refresh', async () => {
      const axios = require('axios');
      axios
        .mockRejectedValueOnce({ response: { status: 401 } }) // Expired token
        .mockResolvedValueOnce({ // Refresh response
          data: {
            access_token: 'new_token',
            refresh_token: 'new_refresh',
            expires_in: 3600
          }
        });

      await expect(
        zoomOAuthProvider.refreshToken('old_refresh_token')
      ).resolves.toHaveProperty('access_token', 'new_token');
    });

    it('should handle rate limiting', async () => {
      const axios = require('axios');
      axios
        .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '1' } } })
        .mockResolvedValueOnce({ data: mockZoomMeeting });

      // Mock delay function
      jest.spyOn(zoomOAuthProvider, 'delay').mockResolvedValue();

      const result = await zoomOAuthProvider.createMeeting('access_token', {
        topic: 'Test Meeting'
      });

      expect(result).toEqual(mockZoomMeeting);
      expect(zoomOAuthProvider.delay).toHaveBeenCalledWith(1000);
    });

    it('should handle meeting creation failures gracefully', async () => {
      jest.spyOn(zoomOAuthProvider, 'createMeeting').mockRejectedValue(
        new Error('Zoom API error')
      );

      await expect(
        zoomMeetingService.createMeetingForAppointment('access_token', mockAppointment)
      ).rejects.toThrow('Failed to create Zoom meeting: Zoom API error');
    });
  });

  describe('Performance Tests', () => {
    it('should cache meeting details for performance', () => {
      const meetingId = 'test-meeting-123';
      
      // Cache meeting
      zoomMeetingService.cacheMeeting(meetingId, mockZoomMeeting);
      
      // Retrieve from cache
      const cachedMeeting = zoomMeetingService.getCachedMeeting(meetingId);
      
      expect(cachedMeeting).toMatchObject(mockZoomMeeting);
      expect(cachedMeeting.cachedAt).toBeDefined();
    });

    it('should handle multiple concurrent webhook events', async () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        ...mockWebhookEvent,
        payload: {
          ...mockWebhookEvent.payload,
          object: { ...mockWebhookEvent.payload.object, id: `meeting_${i}` }
        }
      }));

      // Queue multiple events
      const promises = events.map(event => zoomWebhookService.queueEvent(event));
      
      await Promise.all(promises);
      
      expect(zoomWebhookService.eventQueue.length).toBeGreaterThan(0);
    });
  });

  describe('Security Tests', () => {
    it('should enforce pharmaceutical security for sensitive meetings', async () => {
      const sensitiveAppointment = {
        ...mockAppointment,
        purpose: 'Confidential clinical trial data',
        integration_data: {
          compliance_level: 'hipaa'
        }
      };

      const config = await zoomMeetingService.configureSecuritySettings(sensitiveAppointment);

      expect(config.waitingRoom).toBe(true);
      expect(config.enforceLogin).toBe(true);
      expect(config.autoRecording).toBe('none');
      expect(config.maxParticipants).toBe(4);
    });

    it('should validate webhook timestamp to prevent replay attacks', () => {
      const oldTimestamp = '1640900000'; // Old timestamp
      const payload = JSON.stringify(mockWebhookEvent);
      const signature = 'v0=test_signature';

      const isValid = zoomWebhookService.validateWebhookSignature(payload, signature, oldTimestamp);
      expect(isValid).toBe(false);
    });
  });
});

// Export test utilities
module.exports = {
  mockAppointment,
  mockZoomMeeting,
  mockTokens,
  mockWebhookEvent
}; 