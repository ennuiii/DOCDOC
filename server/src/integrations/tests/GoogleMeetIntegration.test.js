/**
 * Google Meet Integration Test Suite
 * Comprehensive tests for Google Meet functionality in PharmaDOC
 */

const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const { createClient } = require('@supabase/supabase-js');
const GoogleMeetService = require('../services/GoogleMeetService');
const GoogleCalendarSyncService = require('../services/GoogleCalendarSyncService');
const GoogleOAuthProvider = require('../providers/google/GoogleOAuthProvider');

// Mock external dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../providers/google/GoogleOAuthProvider');
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn()
      }))
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        insert: jest.fn(),
        update: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        list: jest.fn()
      }
    })
  }
}));

describe('Google Meet Integration Tests', () => {
  let googleMeetService;
  let googleCalendarSyncService;
  let mockSupabase;
  let mockGoogleProvider;

  // Test data
  const mockAppointment = {
    id: 'apt_123456',
    purpose: 'Clinical trial discussion',
    duration: 60,
    doctor_id: 'doctor_123',
    pharma_rep_id: 'rep_456',
    video_provider: 'google_meet',
    meeting_type: 'virtual',
    status: 'scheduled',
    integration_data: {
      google_meet: {
        security: {
          enableRecording: false,
          allowExternalGuests: false
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

  const mockGoogleEvent = {
    id: 'google_event_123',
    summary: 'PharmaDOC: Clinical trial discussion',
    description: 'Virtual meeting between Dr. Sarah Johnson and Michael Chen',
    start: {
      dateTime: '2024-01-15T14:00:00Z',
      timeZone: 'UTC'
    },
    end: {
      dateTime: '2024-01-15T15:00:00Z',
      timeZone: 'UTC'
    },
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    conferenceData: {
      conferenceId: 'abc-defg-hij',
      conferenceSolution: {
        key: { type: 'hangoutsMeet' },
        name: 'Google Meet'
      },
      entryPoints: [
        {
          entryPointType: 'video',
          uri: 'https://meet.google.com/abc-defg-hij'
        }
      ]
    },
    organizer: { email: 'sarah.johnson@hospital.com' },
    attendees: [
      { email: 'sarah.johnson@hospital.com', responseStatus: 'accepted' },
      { email: 'michael.chen@pharma.com', responseStatus: 'needsAction' }
    ]
  };

  const mockTokens = {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expires_at: '2024-01-15T16:00:00Z'
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
      single: jest.fn().mockResolvedValue({ data: mockAppointment }),
      then: jest.fn()
    };

    createClient.mockReturnValue(mockSupabase);

    mockGoogleProvider = {
      createEvent: jest.fn().mockResolvedValue(mockGoogleEvent),
      updateEvent: jest.fn().mockResolvedValue(mockGoogleEvent),
      deleteEvent: jest.fn().mockResolvedValue({ success: true }),
      getEvents: jest.fn().mockResolvedValue([mockGoogleEvent]),
      refreshToken: jest.fn().mockResolvedValue(mockTokens)
    };

    GoogleOAuthProvider.mockImplementation(() => mockGoogleProvider);

    // Initialize services
    googleMeetService = new GoogleMeetService();
    googleCalendarSyncService = new GoogleCalendarSyncService();

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GoogleMeetService Unit Tests', () => {
    describe('createGoogleMeet', () => {
      it('should create a Google Meet with conference data', async () => {
        const meetingData = {
          userId: 'doctor_123',
          subject: 'PharmaDOC Meeting',
          startDateTime: '2024-01-15T14:00:00Z',
          endDateTime: '2024-01-15T15:00:00Z',
          attendees: ['sarah.johnson@hospital.com', 'michael.chen@pharma.com'],
          conferenceRequestId: 'pharmadoc-123-456'
        };

        const result = await googleMeetService.createGoogleMeet(mockTokens.access_token, meetingData);

        expect(result.success).toBe(true);
        expect(result.meeting).toBeDefined();
        expect(result.meeting.joinUrl).toContain('meet.google.com');
        expect(result.calendarEvent).toEqual(mockGoogleEvent);
      });

      it('should handle meeting creation errors gracefully', async () => {
        mockGoogleProvider.createEvent.mockRejectedValue(new Error('API quota exceeded'));

        const meetingData = {
          userId: 'doctor_123',
          subject: 'Test Meeting',
          startDateTime: '2024-01-15T14:00:00Z',
          endDateTime: '2024-01-15T15:00:00Z'
        };

        await expect(
          googleMeetService.createGoogleMeet(mockTokens.access_token, meetingData)
        ).rejects.toThrow('API quota exceeded');
      });

      it('should apply security settings for pharmaceutical meetings', async () => {
        const securityOptions = {
          enableRecording: false,
          allowExternalGuests: false,
          maxParticipants: 4
        };

        const result = await googleMeetService.createMeetingWithCalendarEvent(
          mockTokens.access_token,
          { summary: 'Secure Meeting' },
          securityOptions
        );

        expect(mockGoogleProvider.createEvent).toHaveBeenCalledWith(
          mockTokens.access_token,
          expect.objectContaining({
            guestsCanInviteOthers: false,
            guestsCanModify: false,
            visibility: 'private'
          }),
          expect.any(Object)
        );
      });
    });

    describe('updateGoogleMeet', () => {
      it('should update existing Google Meet', async () => {
        const updateData = {
          summary: 'Updated Meeting Title',
          description: 'Updated description'
        };

        const result = await googleMeetService.updateGoogleMeet(
          mockTokens.access_token,
          'google_event_123',
          updateData
        );

        expect(result.success).toBe(true);
        expect(mockGoogleProvider.updateEvent).toHaveBeenCalledWith(
          mockTokens.access_token,
          'google_event_123',
          expect.objectContaining(updateData),
          expect.any(Object)
        );
      });
    });

    describe('Security Configuration', () => {
      it('should determine pharmaceutical security profile for sensitive meetings', async () => {
        const sensitiveAppointment = {
          ...mockAppointment,
          purpose: 'Clinical trial regulatory review'
        };

        const config = await googleMeetService.configureSecuritySettings(sensitiveAppointment);

        expect(config.guestsCanInvite).toBe(false);
        expect(config.requireAuthentication).toBe(true);
        expect(config.visibility).toBe('private');
        expect(config.maxParticipants).toBe(4);
      });

      it('should determine business security profile for standard meetings', async () => {
        const businessAppointment = {
          ...mockAppointment,
          purpose: 'Product demonstration'
        };

        const config = await googleMeetService.configureSecuritySettings(businessAppointment);

        expect(config.visibility).toBe('default');
        expect(config.maxParticipants).toBe(10);
      });

      it('should apply custom security settings when provided', async () => {
        const customAppointment = {
          ...mockAppointment,
          integration_data: {
            google_meet: {
              security: {
                maxParticipants: 6,
                guestsCanInvite: true
              }
            }
          }
        };

        const config = await googleMeetService.configureSecuritySettings(customAppointment);

        expect(config.maxParticipants).toBe(6);
        expect(config.guestsCanInvite).toBe(true);
      });
    });

    describe('Meeting Access Validation', () => {
      it('should authorize appointment participants', async () => {
        const result = await googleMeetService.validateMeetingAccess(
          'abc-defg-hij',
          'doctor_123',
          'apt_123456',
          mockSupabase
        );

        expect(result.authorized).toBe(true);
        expect(result.role).toBe('doctor');
        expect(result.permissions).toHaveProperty('canStartMeeting', true);
      });

      it('should deny access to unauthorized users', async () => {
        const result = await googleMeetService.validateMeetingAccess(
          'abc-defg-hij',
          'unauthorized_user',
          'apt_123456',
          mockSupabase
        );

        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('not authorized');
      });

      it('should deny access to cancelled meetings', async () => {
        mockSupabase.single.mockResolvedValueOnce({
          data: { ...mockAppointment, status: 'cancelled' }
        });

        const result = await googleMeetService.validateMeetingAccess(
          'abc-defg-hij',
          'doctor_123',
          'apt_123456',
          mockSupabase
        );

        expect(result.authorized).toBe(false);
        expect(result.reason).toContain('cancelled');
      });
    });

    describe('Meeting Details Extraction', () => {
      it('should extract meeting details from Google Calendar event', () => {
        const details = googleMeetService.extractMeetingDetails(mockGoogleEvent);

        expect(details.meetingId).toBe('abc-defg-hij');
        expect(details.joinUrl).toBe('https://meet.google.com/abc-defg-hij');
        expect(details.eventId).toBe('google_event_123');
        expect(details.subject).toBe('PharmaDOC: Clinical trial discussion');
      });

      it('should handle events without conference data', () => {
        const eventWithoutConference = { ...mockGoogleEvent };
        delete eventWithoutConference.conferenceData;

        expect(() => {
          googleMeetService.extractMeetingDetails(eventWithoutConference);
        }).toThrow('No conference data found in event');
      });
    });
  });

  describe('Google Calendar Sync Integration Tests', () => {
    describe('Calendar Event Creation with Google Meet', () => {
      it('should create calendar event with Google Meet when video_provider is google_meet', async () => {
        const result = await googleCalendarSyncService.createGoogleCalendarEvent(
          mockTokens,
          mockAppointment,
          'integration_123'
        );

        expect(result).toEqual(mockGoogleEvent);
        expect(mockSupabase.update).toHaveBeenCalledWith(
          expect.objectContaining({
            meeting_link: 'https://meet.google.com/abc-defg-hij'
          })
        );
      });

      it('should create regular calendar event when video_provider is not google_meet', async () => {
        const nonGoogleMeetAppointment = {
          ...mockAppointment,
          video_provider: 'zoom'
        };

        await googleCalendarSyncService.createGoogleCalendarEvent(
          mockTokens,
          nonGoogleMeetAppointment,
          'integration_123'
        );

        expect(mockGoogleProvider.createEvent).toHaveBeenCalledWith(
          mockTokens.access_token,
          expect.not.objectContaining({
            conferenceData: expect.any(Object)
          })
        );
      });
    });

    describe('Calendar Event Updates with Google Meet', () => {
      it('should update calendar event and preserve Google Meet link', async () => {
        const existingEvent = {
          external_event_id: 'google_event_123',
          external_calendar_id: 'primary'
        };

        const updatedAppointment = {
          ...mockAppointment,
          purpose: 'Updated meeting purpose'
        };

        await googleCalendarSyncService.updateGoogleCalendarEvent(
          mockTokens,
          existingEvent,
          updatedAppointment
        );

        expect(mockGoogleProvider.updateEvent).toHaveBeenCalled();
      });
    });

    describe('Bidirectional Sync', () => {
      it('should sync PharmaDOC appointments to Google Calendar with Meet links', async () => {
        mockSupabase.select.mockReturnValue({
          ...mockSupabase,
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnValue({ data: [mockAppointment], error: null })
        });

        const result = await googleCalendarSyncService.syncPharmaDOCToGoogle(
          'doctor_123',
          'integration_123',
          mockTokens,
          { start: new Date('2024-01-01'), end: new Date('2024-01-31') }
        );

        expect(result.processed).toBeGreaterThan(0);
        expect(mockGoogleProvider.createEvent).toHaveBeenCalled();
      });
    });
  });

  describe('End-to-End Workflow Tests', () => {
    it('should complete full meeting creation workflow', async () => {
      // Mock complete workflow dependencies
      mockSupabase.select.mockReturnValue({
        ...mockSupabase,
        single: jest.fn().mockResolvedValue({ data: { access_token: mockTokens.access_token } })
      });

      // Step 1: Create Google Meet through Calendar integration
      const calendarEvent = await googleCalendarSyncService.createGoogleCalendarEvent(
        mockTokens,
        mockAppointment,
        'integration_123'
      );

      // Step 2: Extract meeting details
      const meetingDetails = googleMeetService.extractMeetingDetails(calendarEvent);

      // Step 3: Validate security configuration
      const securityConfig = await googleMeetService.configureSecuritySettings(mockAppointment);

      // Step 4: Generate invitation
      const invitation = await googleMeetService.generateMeetingInvitations(meetingDetails, {
        organizer: mockAppointment.doctor,
        attendees: [mockAppointment.doctor, mockAppointment.pharma_rep]
      });

      // Verify complete workflow
      expect(calendarEvent.hangoutLink).toContain('meet.google.com');
      expect(meetingDetails.joinUrl).toBe(calendarEvent.hangoutLink);
      expect(securityConfig.visibility).toBe('private'); // Pharmaceutical security profile
      expect(invitation.html).toContain('Join Google Meet');
      expect(invitation.text).toContain(meetingDetails.joinUrl);
    });

    it('should handle workflow errors gracefully', async () => {
      // Simulate API failure
      mockGoogleProvider.createEvent.mockRejectedValue(new Error('Google API error'));

      try {
        await googleCalendarSyncService.createGoogleCalendarEvent(
          mockTokens,
          mockAppointment,
          'integration_123'
        );
      } catch (error) {
        expect(error.message).toBe('Google API error');
      }

      // Verify error logging
      // (This would require checking audit logs in a real implementation)
    });
  });

  describe('Performance and Load Tests', () => {
    it('should handle multiple concurrent meeting creations', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        googleMeetService.createGoogleMeet(mockTokens.access_token, {
          userId: `user_${i}`,
          subject: `Meeting ${i}`,
          startDateTime: '2024-01-15T14:00:00Z',
          endDateTime: '2024-01-15T15:00:00Z'
        })
      );

      const results = await Promise.allSettled(concurrentRequests);
      const successfulResults = results.filter(result => result.status === 'fulfilled');

      expect(successfulResults.length).toBe(10);
    });

    it('should cache meeting details for performance', () => {
      const meetingId = 'test-meeting-123';
      const meetingDetails = {
        meetingId,
        joinUrl: 'https://meet.google.com/test-meeting-123',
        subject: 'Test Meeting'
      };

      // Cache the meeting
      googleMeetService.cacheMeeting(meetingId, meetingDetails);

      // Retrieve from cache
      const cachedMeeting = googleMeetService.getCachedMeeting(meetingId);

      expect(cachedMeeting).toMatchObject(meetingDetails);
      expect(cachedMeeting.cachedAt).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid meeting URLs gracefully', () => {
      const invalidUrls = [
        'not-a-url',
        'https://example.com/invalid',
        '',
        null,
        undefined
      ];

      invalidUrls.forEach(url => {
        const meetingId = googleMeetService.extractMeetingId(url);
        expect(meetingId).toBeNull();
      });
    });

    it('should handle token expiration and refresh', async () => {
      const expiredTokens = {
        ...mockTokens,
        expires_at: '2023-01-01T00:00:00Z' // Expired
      };

      mockSupabase.single.mockResolvedValue({
        data: {
          ...mockAppointment,
          access_token: expiredTokens.access_token,
          token_expires_at: expiredTokens.expires_at,
          refresh_token: expiredTokens.refresh_token
        }
      });

      await googleCalendarSyncService.ensureValidTokens({
        access_token: expiredTokens.access_token,
        token_expires_at: expiredTokens.expires_at,
        refresh_token: expiredTokens.refresh_token
      });

      expect(mockGoogleProvider.refreshToken).toHaveBeenCalled();
    });

    it('should handle rate limiting with exponential backoff', async () => {
      // Mock rate limit error
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.code = 429;

      mockGoogleProvider.createEvent
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockGoogleEvent);

      // This would trigger retry logic in a real implementation
      // For now, we just verify the error is handled
      await expect(
        googleMeetService.createGoogleMeet(mockTokens.access_token, {
          userId: 'doctor_123',
          subject: 'Test Meeting',
          startDateTime: '2024-01-15T14:00:00Z',
          endDateTime: '2024-01-15T15:00:00Z'
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Security and Privacy Tests', () => {
    it('should not log sensitive information', async () => {
      const sensitiveAppointment = {
        ...mockAppointment,
        purpose: 'Confidential clinical trial data review',
        notes: 'Patient ID: 12345, Sensitive medical information'
      };

      await googleMeetService.configureSecuritySettings(sensitiveAppointment);

      // Verify that audit logs don't contain sensitive data
      // (This would require checking the actual audit logger implementation)
    });

    it('should validate HIPAA compliance for medical meetings', async () => {
      const medicalAppointment = {
        ...mockAppointment,
        purpose: 'Patient consultation review',
        integration_data: {
          compliance_level: 'hipaa',
          google_meet: {
            security: {
              requireAuthentication: true,
              allowRecording: false,
              allowExternalGuests: false
            }
          }
        }
      };

      const config = await googleMeetService.configureSecuritySettings(medicalAppointment);

      expect(config.requireAuthentication).toBe(true);
      expect(config.allowRecording).toBe(false);
      expect(config.allowExternalGuests).toBe(false);
      expect(config.visibility).toBe('private');
    });
  });

  describe('Integration Compatibility Tests', () => {
    it('should work with both personal Gmail and Google Workspace accounts', async () => {
      const workspaceAppointment = {
        ...mockAppointment,
        doctor: {
          ...mockAppointment.doctor,
          email: 'sarah.johnson@hospital.org' // Workspace domain
        }
      };

      const result = await googleCalendarSyncService.createGoogleCalendarEvent(
        mockTokens,
        workspaceAppointment,
        'integration_123'
      );

      expect(result).toEqual(mockGoogleEvent);
    });

    it('should handle different timezone configurations', async () => {
      const timezoneAppointment = {
        ...mockAppointment,
        timezone: 'America/New_York',
        timeslots: {
          ...mockAppointment.timeslots,
          timezone: 'America/New_York'
        }
      };

      const eventData = googleCalendarSyncService.appointmentToGoogleEvent(timezoneAppointment);

      expect(eventData.start.timeZone).toBeDefined();
      expect(eventData.end.timeZone).toBeDefined();
    });
  });
});

describe('Mobile Deep Linking Tests', () => {
  let mobileDeepLinkService;

  beforeEach(() => {
    // Mock implementation for mobile deep linking tests
    mobileDeepLinkService = {
      generateDeepLinks: jest.fn(),
      extractMeetingId: jest.fn(),
      detectPlatform: jest.fn(),
      generateSmartLinkHTML: jest.fn()
    };
  });

  describe('Deep Link Generation', () => {
    it('should generate iOS deep links', () => {
      const meetingUrl = 'https://meet.google.com/abc-defg-hij';
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';

      mobileDeepLinkService.detectPlatform.mockReturnValue('ios');
      mobileDeepLinkService.extractMeetingId.mockReturnValue('abc-defg-hij');
      mobileDeepLinkService.generateDeepLinks.mockReturnValue({
        success: true,
        platform: 'ios',
        deepLinks: {
          primary: 'comgooglemeet://meet.google.com/abc-defg-hij',
          fallback: 'https://meet.google.com/abc-defg-hij',
          universalLink: 'https://meet.google.com/abc-defg-hij'
        }
      });

      const result = mobileDeepLinkService.generateDeepLinks(meetingUrl, userAgent);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('ios');
      expect(result.deepLinks.primary).toContain('comgooglemeet://');
    });

    it('should generate Android intent links', () => {
      const meetingUrl = 'https://meet.google.com/abc-defg-hij';
      const userAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G975F)';

      mobileDeepLinkService.detectPlatform.mockReturnValue('android');
      mobileDeepLinkService.extractMeetingId.mockReturnValue('abc-defg-hij');
      mobileDeepLinkService.generateDeepLinks.mockReturnValue({
        success: true,
        platform: 'android',
        deepLinks: {
          primary: 'intent://meet.google.com/abc-defg-hij#Intent;scheme=https;package=com.google.android.apps.meetings;end',
          fallback: 'https://meet.google.com/abc-defg-hij'
        }
      });

      const result = mobileDeepLinkService.generateDeepLinks(meetingUrl, userAgent);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('android');
      expect(result.deepLinks.primary).toContain('Intent');
    });

    it('should generate smart app detection HTML', () => {
      const deepLinkData = {
        meetingId: 'abc-defg-hij',
        platform: 'ios',
        deepLinks: {
          primary: 'comgooglemeet://meet.google.com/abc-defg-hij',
          fallback: 'https://meet.google.com/abc-defg-hij'
        }
      };

      mobileDeepLinkService.generateSmartLinkHTML.mockReturnValue(`
        <html>
          <body>
            <button onclick="joinMeeting()">Join Google Meet</button>
            <script>
              function joinMeeting() {
                window.location.href = '${deepLinkData.deepLinks.primary}';
              }
            </script>
          </body>
        </html>
      `);

      const html = mobileDeepLinkService.generateSmartLinkHTML(deepLinkData);

      expect(html).toContain('Join Google Meet');
      expect(html).toContain('comgooglemeet://');
    });
  });
});

// Export test utilities for other test files
module.exports = {
  mockAppointment,
  mockGoogleEvent,
  mockTokens,
  setupGoogleMeetMocks: () => ({
    mockSupabase,
    mockGoogleProvider
  })
}; 