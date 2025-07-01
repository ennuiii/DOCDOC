/**
 * CalDAV Integration Test Suite
 * Comprehensive tests for CalDAV functionality in PharmaDOC
 */

const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const { createClient } = require('@supabase/supabase-js');
const { CalDAVClient } = require('../providers/caldav/CalDAVClient');
const { CalDAVSyncService } = require('../services/CalDAVSyncService');

// Mock external dependencies
jest.mock('@supabase/supabase-js');
jest.mock('axios');
jest.mock('fast-xml-parser');
jest.mock('ical');

describe('CalDAV Integration Tests', () => {
  let calDAVClient;
  let calDAVSyncService;
  let mockSupabase;

  // Test data
  const mockiCloudConfig = {
    provider: 'apple_icloud',
    serverUrl: 'https://caldav.icloud.com',
    username: 'testuser@icloud.com',
    password: 'app-specific-password',
    principalUrl: 'https://caldav.icloud.com/testuser/principal/',
    calendarHomeUrl: 'https://caldav.icloud.com/testuser/calendars/',
    requiresAppPassword: true,
    supportsColors: true,
    supportsTimeZones: true,
    capabilities: ['calendar-access', 'calendar-schedule', 'calendar-auto-schedule']
  };

  const mockYahooConfig = {
    provider: 'yahoo',
    serverUrl: 'https://caldav.calendar.yahoo.com',
    username: 'testuser@yahoo.com',
    password: 'app-password',
    principalUrl: 'https://caldav.calendar.yahoo.com/dav/testuser@yahoo.com/principal/',
    calendarHomeUrl: 'https://caldav.calendar.yahoo.com/dav/testuser@yahoo.com/Calendar/',
    requiresAppPassword: true,
    supportsColors: false,
    supportsTimeZones: true,
    capabilities: ['calendar-access']
  };

  const mockGenericConfig = {
    provider: 'generic',
    serverUrl: 'https://calendar.example.com',
    username: 'testuser',
    password: 'password123',
    principalUrl: 'https://calendar.example.com/principals/testuser/',
    calendarHomeUrl: 'https://calendar.example.com/calendars/testuser/',
    requiresAppPassword: false,
    supportsColors: false,
    supportsTimeZones: true,
    capabilities: ['calendar-access']
  };

  const mockCalendar = {
    url: 'https://caldav.icloud.com/testuser/calendars/work/',
    name: 'Work Calendar',
    description: 'Work related events',
    color: '#FF0000',
    readOnly: false,
    components: ['VEVENT']
  };

  const mockCalDAVEvent = {
    uid: 'test-event-123@icloud.com',
    title: 'Doctor Appointment',
    description: 'Consultation with Dr. Smith',
    startTime: '2024-01-15T14:00:00Z',
    endTime: '2024-01-15T15:00:00Z',
    allDay: false,
    location: 'Medical Center',
    status: 'confirmed',
    attendees: [
      {
        email: 'doctor@hospital.com',
        name: 'Dr. Smith',
        status: 'ACCEPTED'
      },
      {
        email: 'patient@email.com',
        name: 'John Doe',
        status: 'NEEDS-ACTION'
      }
    ],
    organizer: {
      email: 'doctor@hospital.com',
      name: 'Dr. Smith'
    },
    recurrence: null,
    timezone: 'America/New_York',
    etag: '"1234567890"',
    lastModified: '2024-01-15T13:00:00Z',
    provider: 'apple_icloud',
    calendarId: 'work'
  };

  const mockAppointment = {
    id: 'apt_123456',
    purpose: 'Clinical trial discussion',
    description: 'Review of Phase II results',
    duration: 60,
    doctor_id: 'doctor_123',
    pharma_rep_id: 'rep_456',
    status: 'scheduled',
    meeting_type: 'external',
    external_provider: 'apple_icloud',
    external_event_id: 'test-event-123@icloud.com',
    external_calendar_id: 'https://caldav.icloud.com/testuser/calendars/work/',
    timezone: 'America/New_York',
    integration_data: {
      caldav: {
        provider: 'apple_icloud',
        calendar: 'Work Calendar',
        etag: '"1234567890"',
        originalEvent: mockCalDAVEvent
      }
    },
    timeslots: {
      date: '2024-01-15',
      start_time: '14:00:00',
      end_time: '15:00:00'
    },
    created_at: '2024-01-15T12:00:00Z',
    updated_at: '2024-01-15T12:30:00Z'
  };

  const mockIntegration = {
    id: 'integration_123',
    user_id: 'user_123',
    provider: 'caldav',
    provider_type: 'apple_icloud',
    config: {
      ...mockiCloudConfig,
      password: 'ZW5jcnlwdGVkUGFzc3dvcmQ=', // base64 encoded
      selectedCalendars: [mockCalendar.url],
      syncDirection: 'bidirectional',
      autoSync: true,
      syncInterval: 900000
    },
    status: 'active',
    last_sync: null,
    sync_token: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
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
      or: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockAppointment }),
      then: jest.fn()
    };

    createClient.mockReturnValue(mockSupabase);

    // Initialize services with mocked dependencies
    calDAVClient = new CalDAVClient();
    calDAVSyncService = new CalDAVSyncService();

    // Mock HTTP requests
    const axios = require('axios');
    axios.mockResolvedValue({
      data: '<multistatus>mock response</multistatus>',
      headers: { etag: '"1234567890"' },
      status: 207
    });

    // Mock XML parsing
    const { XMLParser, XMLBuilder } = require('fast-xml-parser');
    XMLParser.prototype.parse = jest.fn().mockReturnValue({
      multistatus: {
        response: [{
          propstat: {
            prop: {
              displayname: 'Test Calendar',
              'calendar-description': 'Test Description',
              resourcetype: { collection: true, calendar: true }
            }
          },
          href: '/calendars/test/'
        }]
      }
    });

    XMLBuilder.prototype.build = jest.fn().mockReturnValue('<propfind>mock xml</propfind>');

    // Mock iCal parsing
    const ical = require('ical');
    ical.parseICS = jest.fn().mockReturnValue({
      'test-event-123': {
        uid: 'test-event-123',
        summary: 'Test Event',
        description: 'Test Description',
        start: new Date('2024-01-15T14:00:00Z'),
        end: new Date('2024-01-15T15:00:00Z'),
        location: 'Test Location'
      }
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('CalDAVClient Tests', () => {
    describe('Provider Detection', () => {
      it('should detect Apple iCloud provider', async () => {
        const config = await calDAVClient.detectProvider(
          'https://caldav.icloud.com',
          'testuser@icloud.com'
        );

        expect(config.provider).toBe('apple_icloud');
        expect(config.serverUrl).toBe('https://caldav.icloud.com');
        expect(config.requiresAppPassword).toBe(true);
        expect(config.supportsColors).toBe(true);
        expect(config.capabilities).toContain('calendar-access');
      });

      it('should detect Yahoo Calendar provider', async () => {
        const config = await calDAVClient.detectProvider(
          'https://caldav.calendar.yahoo.com',
          'testuser@yahoo.com'
        );

        expect(config.provider).toBe('yahoo');
        expect(config.serverUrl).toBe('https://caldav.calendar.yahoo.com');
        expect(config.requiresAppPassword).toBe(true);
        expect(config.supportsColors).toBe(false);
      });

      it('should configure generic CalDAV provider', async () => {
        // Mock successful discovery
        jest.spyOn(calDAVClient, 'discoverPrincipalUrl').mockResolvedValue(
          'https://calendar.example.com/principals/testuser/'
        );
        jest.spyOn(calDAVClient, 'discoverCalendarHomeUrl').mockResolvedValue(
          'https://calendar.example.com/calendars/testuser/'
        );

        const config = await calDAVClient.detectProvider(
          'https://calendar.example.com',
          'testuser'
        );

        expect(config.provider).toBe('generic');
        expect(config.serverUrl).toBe('https://calendar.example.com');
        expect(config.requiresAppPassword).toBe(false);
      });
    });

    describe('Authentication', () => {
      it('should authenticate successfully with valid credentials', async () => {
        const axios = require('axios');
        axios.mockResolvedValue({
          status: 207,
          data: '<multistatus>success</multistatus>'
        });

        const result = await calDAVClient.authenticate(mockiCloudConfig, 'valid-password');

        expect(result).toBe(true);
        expect(axios).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'PROPFIND',
            auth: {
              username: mockiCloudConfig.username,
              password: 'valid-password'
            }
          })
        );
      });

      it('should fail authentication with invalid credentials', async () => {
        const axios = require('axios');
        axios.mockRejectedValue({
          response: { status: 401 }
        });

        await expect(
          calDAVClient.authenticate(mockiCloudConfig, 'invalid-password')
        ).rejects.toThrow('Authentication failed');
      });
    });

    describe('Calendar Discovery', () => {
      it('should discover calendars successfully', async () => {
        jest.spyOn(calDAVClient, 'getAuthFromCache').mockReturnValue({
          username: 'testuser',
          password: 'password'
        });

        const calendars = await calDAVClient.discoverCalendars(mockiCloudConfig);

        expect(Array.isArray(calendars)).toBe(true);
        expect(calendars.length).toBeGreaterThan(0);
        expect(calendars[0]).toHaveProperty('name');
        expect(calendars[0]).toHaveProperty('url');
      });

      it('should handle discovery failures gracefully', async () => {
        jest.spyOn(calDAVClient, 'getAuthFromCache').mockReturnValue(null);

        await expect(
          calDAVClient.discoverCalendars(mockiCloudConfig)
        ).rejects.toThrow('Authentication required');
      });
    });

    describe('Event Synchronization', () => {
      it('should sync calendar events', async () => {
        jest.spyOn(calDAVClient, 'getAuthFromCache').mockReturnValue({
          username: 'testuser',
          password: 'password'
        });
        jest.spyOn(calDAVClient, 'performFullSync').mockResolvedValue([mockCalDAVEvent]);

        const result = await calDAVClient.syncCalendarEvents(
          mockiCloudConfig,
          mockCalendar
        );

        expect(result).toHaveProperty('events');
        expect(result).toHaveProperty('syncToken');
        expect(result).toHaveProperty('lastModified');
        expect(result.events.length).toBeGreaterThan(0);
      });

      it('should use incremental sync when sync token available', async () => {
        const mockConfig = {
          ...mockiCloudConfig,
          capabilities: ['calendar-access', 'sync-collection']
        };

        jest.spyOn(calDAVClient, 'getAuthFromCache').mockReturnValue({
          username: 'testuser',
          password: 'password'
        });
        jest.spyOn(calDAVClient, 'performSyncCollectionSync').mockResolvedValue([mockCalDAVEvent]);

        const result = await calDAVClient.syncCalendarEvents(
          mockConfig,
          mockCalendar,
          'previous-sync-token'
        );

        expect(calDAVClient.performSyncCollectionSync).toHaveBeenCalled();
        expect(result.events.length).toBeGreaterThan(0);
      });
    });

    describe('Event CRUD Operations', () => {
      beforeEach(() => {
        jest.spyOn(calDAVClient, 'getAuthFromCache').mockReturnValue({
          username: 'testuser',
          password: 'password'
        });
      });

      it('should create calendar event', async () => {
        const axios = require('axios');
        axios.mockResolvedValue({
          status: 201,
          headers: { etag: '"new-etag"' }
        });

        const eventData = {
          title: 'New Event',
          startTime: '2024-01-15T14:00:00Z',
          endTime: '2024-01-15T15:00:00Z'
        };

        const result = await calDAVClient.createEvent(mockiCloudConfig, mockCalendar, eventData);

        expect(result.uid).toBeDefined();
        expect(result.url).toBeDefined();
        expect(result.etag).toBe('"new-etag"');
      });

      it('should update calendar event', async () => {
        const axios = require('axios');
        axios.mockResolvedValue({
          status: 204,
          headers: { etag: '"updated-etag"' }
        });

        const eventData = {
          title: 'Updated Event',
          startTime: '2024-01-15T15:00:00Z',
          endTime: '2024-01-15T16:00:00Z'
        };

        const result = await calDAVClient.updateEvent(
          mockiCloudConfig,
          mockCalendar,
          'test-event-123',
          eventData,
          '"old-etag"'
        );

        expect(result.uid).toBe('test-event-123');
        expect(result.etag).toBe('"updated-etag"');
      });

      it('should delete calendar event', async () => {
        const axios = require('axios');
        axios.mockResolvedValue({
          status: 204
        });

        const result = await calDAVClient.deleteEvent(
          mockiCloudConfig,
          mockCalendar,
          'test-event-123',
          '"etag"'
        );

        expect(result).toBe(true);
      });
    });

    describe('iCalendar Processing', () => {
      it('should build valid iCalendar data', () => {
        const eventData = {
          uid: 'test-123',
          title: 'Test Event',
          description: 'Test Description',
          startTime: '2024-01-15T14:00:00Z',
          endTime: '2024-01-15T15:00:00Z',
          location: 'Test Location',
          organizer: { email: 'organizer@test.com' },
          attendees: [{ email: 'attendee@test.com' }]
        };

        const icalData = calDAVClient.buildICalendarEvent(eventData, mockiCloudConfig);

        expect(icalData).toContain('BEGIN:VCALENDAR');
        expect(icalData).toContain('BEGIN:VEVENT');
        expect(icalData).toContain('UID:test-123');
        expect(icalData).toContain('SUMMARY:Test Event');
        expect(icalData).toContain('DESCRIPTION:Test Description');
        expect(icalData).toContain('LOCATION:Test Location');
        expect(icalData).toContain('END:VEVENT');
        expect(icalData).toContain('END:VCALENDAR');
      });

      it('should normalize CalDAV events correctly', () => {
        const rawEvent = {
          icalData: 'BEGIN:VCALENDAR...END:VCALENDAR',
          etag: '"test-etag"',
          calendarId: 'test-calendar'
        };

        const normalized = calDAVClient.normalizeEvent(rawEvent, mockiCloudConfig);

        expect(normalized).toHaveProperty('uid');
        expect(normalized).toHaveProperty('title');
        expect(normalized).toHaveProperty('startTime');
        expect(normalized).toHaveProperty('endTime');
        expect(normalized.provider).toBe(mockiCloudConfig.provider);
      });
    });
  });

  describe('CalDAVSyncService Tests', () => {
    describe('Integration Setup', () => {
      it('should setup CalDAV integration successfully', async () => {
        // Mock CalDAV client methods
        jest.spyOn(calDAVClient, 'detectProvider').mockResolvedValue(mockiCloudConfig);
        jest.spyOn(calDAVClient, 'authenticate').mockResolvedValue(true);
        jest.spyOn(calDAVClient, 'discoverCalendars').mockResolvedValue([mockCalendar]);

        // Mock Supabase insert
        mockSupabase.insert.mockReturnValue(mockSupabase);
        mockSupabase.select.mockReturnValue(mockSupabase);
        mockSupabase.single.mockResolvedValue({ data: mockIntegration });

        const result = await calDAVSyncService.setupCalDAVIntegration('user_123', {
          serverUrl: 'https://caldav.icloud.com',
          username: 'testuser@icloud.com',
          password: 'app-password',
          syncDirection: 'bidirectional'
        });

        expect(result.integrationId).toBe(mockIntegration.id);
        expect(result.provider).toBe('apple_icloud');
        expect(result.calendars).toHaveLength(1);
        expect(result.status).toBe('active');
      });

      it('should handle authentication failures during setup', async () => {
        jest.spyOn(calDAVClient, 'detectProvider').mockResolvedValue(mockiCloudConfig);
        jest.spyOn(calDAVClient, 'authenticate').mockResolvedValue(false);

        await expect(
          calDAVSyncService.setupCalDAVIntegration('user_123', {
            serverUrl: 'https://caldav.icloud.com',
            username: 'testuser@icloud.com',
            password: 'invalid-password'
          })
        ).rejects.toThrow('CalDAV authentication failed');
      });
    });

    describe('Synchronization Operations', () => {
      beforeEach(() => {
        // Mock getting active integrations
        jest.spyOn(calDAVSyncService, 'getActiveIntegrations').mockResolvedValue([mockIntegration]);
        
        // Mock CalDAV client authentication
        jest.spyOn(calDAVClient, 'authenticate').mockResolvedValue(true);
        
        // Mock calendar sync
        jest.spyOn(calDAVClient, 'syncCalendarEvents').mockResolvedValue({
          events: [mockCalDAVEvent],
          syncToken: 'new-sync-token',
          lastModified: '2024-01-15T16:00:00Z'
        });
      });

      it('should perform bidirectional sync successfully', async () => {
        // Mock import and export operations
        jest.spyOn(calDAVSyncService, 'importCalDAVEvents').mockResolvedValue({
          imported: 1,
          conflicts: []
        });
        jest.spyOn(calDAVSyncService, 'exportPharmaDOCEvents').mockResolvedValue({
          exported: 1,
          conflicts: []
        });

        const result = await calDAVSyncService.performSync('user_123');

        expect(result.userId).toBe('user_123');
        expect(result.syncResults).toHaveLength(1);
        expect(result.syncResults[0].success).toBe(true);
        expect(result.syncResults[0].eventsProcessed).toBe(2);
      });

      it('should handle sync errors gracefully', async () => {
        jest.spyOn(calDAVClient, 'authenticate').mockRejectedValue(new Error('Auth failed'));

        const result = await calDAVSyncService.performSync('user_123');

        expect(result.syncResults).toHaveLength(1);
        expect(result.syncResults[0].success).toBe(false);
        expect(result.syncResults[0].error).toContain('Auth failed');
      });
    });

    describe('Event Import/Export', () => {
      it('should import CalDAV events to PharmaDOC', async () => {
        // Mock finding existing appointment
        jest.spyOn(calDAVSyncService, 'findAppointmentByUID').mockResolvedValue(null);
        
        // Mock creating appointment
        jest.spyOn(calDAVSyncService, 'createAppointmentFromCalDAVEvent').mockResolvedValue(mockAppointment);

        const result = await calDAVSyncService.importCalDAVEvents(
          'user_123',
          [mockCalDAVEvent],
          mockCalendar,
          mockiCloudConfig
        );

        expect(result.imported).toBe(1);
        expect(result.conflicts).toHaveLength(0);
      });

      it('should export PharmaDOC appointments to CalDAV', async () => {
        // Mock getting appointments for sync
        jest.spyOn(calDAVSyncService, 'getAppointmentsForSync').mockResolvedValue([mockAppointment]);
        
        // Mock creating CalDAV event
        jest.spyOn(calDAVSyncService, 'createCalDAVEvent').mockResolvedValue({
          success: true,
          uid: 'new-event-uid',
          url: 'https://calendar.example.com/event.ics'
        });

        const result = await calDAVSyncService.exportPharmaDOCEvents(
          'user_123',
          mockCalendar,
          mockiCloudConfig,
          '2024-01-15T12:00:00Z'
        );

        expect(result.exported).toBe(1);
        expect(result.conflicts).toHaveLength(0);
      });
    });

    describe('Conflict Resolution', () => {
      it('should resolve conflicts using newest_wins strategy', async () => {
        const newerAppointment = {
          ...mockAppointment,
          updated_at: '2024-01-15T16:00:00Z'
        };

        const olderEvent = {
          ...mockCalDAVEvent,
          lastModified: '2024-01-15T15:00:00Z'
        };

        const config = {
          ...mockiCloudConfig,
          conflictResolution: 'newest_wins'
        };

        jest.spyOn(calDAVSyncService, 'updateCalDAVEventFromAppointment').mockResolvedValue();

        const result = await calDAVSyncService.handleUpdateConflict(
          newerAppointment,
          olderEvent,
          config
        );

        expect(result.conflict).toBe(false);
        expect(result.resolution).toBe('pharmadoc_wins');
      });

      it('should flag manual conflicts when configured', async () => {
        const config = {
          ...mockiCloudConfig,
          conflictResolution: 'manual'
        };

        const result = await calDAVSyncService.handleUpdateConflict(
          mockAppointment,
          mockCalDAVEvent,
          config
        );

        expect(result.conflict).toBe(true);
        expect(result.type).toBe('update_conflict');
        expect(result.appointmentId).toBe(mockAppointment.id);
        expect(result.eventUid).toBe(mockCalDAVEvent.uid);
      });
    });

    describe('Data Conversion', () => {
      it('should create appointment from CalDAV event', async () => {
        // Mock participant identification
        jest.spyOn(calDAVSyncService, 'identifyParticipants').mockResolvedValue({
          doctor_id: 'doctor_123',
          pharma_rep_id: null
        });

        // Mock conflict checking
        jest.spyOn(calDAVSyncService, 'checkAppointmentConflicts').mockResolvedValue([]);

        // Mock Supabase insert
        mockSupabase.insert.mockReturnValue(mockSupabase);
        mockSupabase.select.mockReturnValue(mockSupabase);
        mockSupabase.single.mockResolvedValue({ data: mockAppointment });

        const result = await calDAVSyncService.createAppointmentFromCalDAVEvent(
          'user_123',
          mockCalDAVEvent,
          mockCalendar,
          mockiCloudConfig
        );

        expect(result.purpose).toBe(mockCalDAVEvent.title);
        expect(result.external_event_id).toBe(mockCalDAVEvent.uid);
        expect(result.external_provider).toBe(mockiCloudConfig.provider);
      });

      it('should create CalDAV event from appointment', async () => {
        // Mock organizer and attendee info
        jest.spyOn(calDAVSyncService, 'getOrganizerInfo').mockResolvedValue({
          name: 'Dr. Smith',
          email: 'doctor@hospital.com'
        });
        jest.spyOn(calDAVSyncService, 'getAttendeeInfo').mockResolvedValue([{
          name: 'John Doe',
          email: 'patient@email.com'
        }]);

        // Mock CalDAV client create event
        jest.spyOn(calDAVClient, 'createEvent').mockResolvedValue({
          uid: 'new-event-uid',
          url: 'https://calendar.example.com/event.ics',
          etag: '"new-etag"'
        });

        const result = await calDAVSyncService.createCalDAVEvent(
          mockiCloudConfig,
          mockCalendar,
          mockAppointment
        );

        expect(result.success).toBe(true);
        expect(result.uid).toBe('new-event-uid');
      });
    });
  });

  describe('Provider-Specific Tests', () => {
    describe('Apple iCloud Integration', () => {
      it('should handle app-specific passwords', async () => {
        const config = calDAVClient.configureAppleiCloud('testuser@icloud.com');
        
        expect(config.requiresAppPassword).toBe(true);
        expect(config.supportsColors).toBe(true);
        expect(config.capabilities).toContain('calendar-schedule');
      });

      it('should use correct iCloud URLs', () => {
        const config = calDAVClient.configureAppleiCloud('testuser@icloud.com');
        
        expect(config.serverUrl).toBe('https://caldav.icloud.com');
        expect(config.principalUrl).toContain('testuser/principal');
        expect(config.calendarHomeUrl).toContain('testuser/calendars');
      });
    });

    describe('Yahoo Calendar Integration', () => {
      it('should configure Yahoo Calendar correctly', () => {
        const config = calDAVClient.configureYahooCalendar('testuser@yahoo.com');
        
        expect(config.provider).toBe('yahoo');
        expect(config.requiresAppPassword).toBe(true);
        expect(config.supportsColors).toBe(false);
        expect(config.serverUrl).toBe('https://caldav.calendar.yahoo.com');
      });
    });

    describe('Generic CalDAV Integration', () => {
      it('should discover endpoints for generic servers', async () => {
        // Mock endpoint discovery
        jest.spyOn(calDAVClient, 'discoverPrincipalUrl').mockResolvedValue(
          'https://calendar.example.com/principals/testuser/'
        );
        jest.spyOn(calDAVClient, 'discoverCalendarHomeUrl').mockResolvedValue(
          'https://calendar.example.com/calendars/testuser/'
        );

        const config = await calDAVClient.configureGenericCalDAV(
          'https://calendar.example.com',
          'testuser'
        );

        expect(config.provider).toBe('generic');
        expect(config.principalUrl).toContain('principals/testuser');
        expect(config.calendarHomeUrl).toContain('calendars/testuser');
      });
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle network timeouts', async () => {
      const axios = require('axios');
      axios.mockRejectedValue(new Error('Network timeout'));

      await expect(
        calDAVClient.authenticate(mockiCloudConfig, 'password')
      ).rejects.toThrow('Authentication failed');
    });

    it('should retry on server errors', async () => {
      const axios = require('axios');
      axios
        .mockRejectedValueOnce({ response: { status: 500 } })
        .mockRejectedValueOnce({ response: { status: 502 } })
        .mockResolvedValueOnce({ status: 207, data: 'success' });

      // Mock delay function
      jest.spyOn(calDAVClient, 'delay').mockResolvedValue();

      const result = await calDAVClient.makeRequest('PROPFIND', 'https://test.com');
      
      expect(result.status).toBe(207);
      expect(axios).toHaveBeenCalledTimes(3);
    });

    it('should handle malformed XML responses', () => {
      const { XMLParser } = require('fast-xml-parser');
      XMLParser.prototype.parse.mockImplementation(() => {
        throw new Error('Invalid XML');
      });

      expect(() => {
        calDAVClient.xmlParser.parse('<invalid>xml');
      }).toThrow('Invalid XML');
    });
  });

  describe('Security Tests', () => {
    it('should encrypt passwords securely', () => {
      const password = 'sensitive-password';
      const encrypted = calDAVSyncService.encryptPassword(password);
      const decrypted = calDAVSyncService.decryptPassword(encrypted);
      
      expect(encrypted).not.toBe(password);
      expect(decrypted).toBe(password);
    });

    it('should validate calendar access permissions', async () => {
      // Test calendar access validation
      const calendar = { url: 'https://private-calendar.com/restricted/' };
      
      // Mock authentication failure for restricted calendar
      jest.spyOn(calDAVClient, 'makeRequest').mockRejectedValue({
        response: { status: 403 }
      });

      await expect(
        calDAVClient.discoverCalendars(mockiCloudConfig)
      ).rejects.toThrow('Failed to discover calendars');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large calendar sync efficiently', async () => {
      const manyEvents = Array.from({ length: 100 }, (_, i) => ({
        ...mockCalDAVEvent,
        uid: `event-${i}@icloud.com`,
        title: `Event ${i}`
      }));

      jest.spyOn(calDAVClient, 'getAuthFromCache').mockReturnValue({
        username: 'testuser',
        password: 'password'
      });
      jest.spyOn(calDAVClient, 'performFullSync').mockResolvedValue(manyEvents);

      const startTime = Date.now();
      const result = await calDAVClient.syncCalendarEvents(
        mockiCloudConfig,
        mockCalendar
      );
      const duration = Date.now() - startTime;

      expect(result.events).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should cache authentication tokens', () => {
      const authKey = `${mockiCloudConfig.provider}:${mockiCloudConfig.username}`;
      
      // Set cache
      calDAVClient.authCache.set(authKey, {
        username: mockiCloudConfig.username,
        password: 'password',
        expiresAt: Date.now() + 3600000
      });

      // Get from cache
      const cached = calDAVClient.getAuthFromCache(mockiCloudConfig);
      
      expect(cached).toBeDefined();
      expect(cached.username).toBe(mockiCloudConfig.username);
    });
  });
});

// Export test utilities
module.exports = {
  mockiCloudConfig,
  mockYahooConfig,
  mockGenericConfig,
  mockCalendar,
  mockCalDAVEvent,
  mockAppointment,
  mockIntegration
}; 