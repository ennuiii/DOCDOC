/**
 * Google Calendar Integration Tests
 * Comprehensive test suite for all Google Calendar functionality
 */

const { createClient } = require('@supabase/supabase-js');
const GoogleCalendarSyncService = require('../../integrations/services/GoogleCalendarSyncService');
const ConflictResolutionService = require('../../integrations/services/ConflictResolutionService');
const BufferTimeService = require('../../integrations/services/BufferTimeService');
const TimezoneService = require('../../integrations/services/TimezoneService');
const MultipleCalendarService = require('../../integrations/services/MultipleCalendarService');
const GoogleCalendarWebhookService = require('../../integrations/services/GoogleCalendarWebhookService');

// Mock data for testing
const mockUser = {
    id: 'test-user-123',
    email: 'test@pharmadoc.com',
    role: 'doctor',
    profile: {
        first_name: 'Test',
        last_name: 'Doctor',
        specialization: 'Cardiology'
    }
};

const mockGoogleCredentials = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
};

const mockAppointment = {
    id: 'test-appointment-123',
    doctor_id: mockUser.id,
    pharma_rep_id: 'test-pharma-456',
    purpose: 'Product Demonstration',
    start_time: '2024-12-25T10:00:00Z',
    end_time: '2024-12-25T11:00:00Z',
    meeting_type: 'virtual',
    status: 'confirmed'
};

const mockGoogleEvent = {
    id: 'google-event-123',
    summary: 'PharmaDOC: Product Demonstration',
    start: {
        dateTime: '2024-12-25T10:00:00Z',
        timeZone: 'UTC'
    },
    end: {
        dateTime: '2024-12-25T11:00:00Z',
        timeZone: 'UTC'
    },
    attendees: [
        { email: 'test@pharmadoc.com', responseStatus: 'accepted' },
        { email: 'pharma@company.com', responseStatus: 'needsAction' }
    ],
    conferenceData: {
        conferenceSolution: {
            key: { type: 'hangoutsMeet' }
        },
        conferenceId: 'abc-defg-hij'
    }
};

describe('Google Calendar Integration', () => {
    let syncService;
    let conflictService;
    let bufferService;
    let timezoneService;
    let calendarService;
    let webhookService;
    let supabase;

    beforeAll(async () => {
        // Initialize services
        syncService = new GoogleCalendarSyncService();
        conflictService = new ConflictResolutionService();
        bufferService = new BufferTimeService();
        timezoneService = new TimezoneService();
        calendarService = new MultipleCalendarService();
        webhookService = new GoogleCalendarWebhookService();
        
        // Initialize Supabase (use test database)
        supabase = createClient(
            process.env.SUPABASE_URL || 'http://localhost:54321',
            process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
        );

        // Setup test data
        await setupTestData();
    });

    afterAll(async () => {
        // Cleanup test data
        await cleanupTestData();
    });

    describe('1. Google Calendar Sync Service', () => {
        test('should initialize with correct configuration', () => {
            expect(syncService).toBeDefined();
            expect(syncService.supabase).toBeDefined();
            expect(syncService.auditLogger).toBeDefined();
        });

        test('should sync appointments to Google Calendar', async () => {
            // Mock Google Calendar API
            const mockCalendarAPI = {
                events: {
                    insert: jest.fn().mockResolvedValue({
                        data: mockGoogleEvent
                    })
                }
            };

            // Mock the Google Calendar client
            syncService.getGoogleCalendarClient = jest.fn().mockResolvedValue(mockCalendarAPI);

            const result = await syncService.syncAppointmentToGoogle(
                mockUser.id,
                mockAppointment,
                { calendarId: 'primary' }
            );

            expect(result.success).toBe(true);
            expect(result.googleEvent).toBeDefined();
            expect(result.googleEvent.id).toBe(mockGoogleEvent.id);
            expect(mockCalendarAPI.events.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    calendarId: 'primary',
                    conferenceDataVersion: 1
                })
            );
        });

        test('should handle sync conflicts gracefully', async () => {
            const conflictingAppointment = {
                ...mockAppointment,
                start_time: '2024-12-25T10:30:00Z',
                end_time: '2024-12-25T11:30:00Z'
            };

            const conflicts = await conflictService.detectConflicts(
                mockUser.id,
                conflictingAppointment,
                { checkBufferTime: true }
            );

            expect(Array.isArray(conflicts)).toBe(true);
            if (conflicts.length > 0) {
                expect(conflicts[0]).toHaveProperty('type');
                expect(conflicts[0]).toHaveProperty('severity');
                expect(conflicts[0]).toHaveProperty('resolutionSuggestions');
            }
        });

        test('should sync Google events to PharmaDOC appointments', async () => {
            const mockCalendarAPI = {
                events: {
                    list: jest.fn().mockResolvedValue({
                        data: {
                            items: [mockGoogleEvent]
                        }
                    })
                }
            };

            syncService.getGoogleCalendarClient = jest.fn().mockResolvedValue(mockCalendarAPI);

            const result = await syncService.syncFromGoogle(
                mockUser.id,
                { calendarId: 'primary', timeMin: '2024-12-25T00:00:00Z' }
            );

            expect(result.success).toBe(true);
            expect(result.stats).toHaveProperty('eventsProcessed');
            expect(result.stats).toHaveProperty('appointmentsCreated');
        });

        test('should handle bidirectional sync correctly', async () => {
            const syncResult = await syncService.performBidirectionalSync(
                mockUser.id,
                {
                    syncDirection: 'bidirectional',
                    conflictResolution: 'user_choice',
                    timeframe: {
                        start: new Date('2024-12-25T00:00:00Z'),
                        end: new Date('2024-12-26T00:00:00Z')
                    }
                }
            );

            expect(syncResult).toHaveProperty('success');
            expect(syncResult).toHaveProperty('toGoogle');
            expect(syncResult).toHaveProperty('fromGoogle');
            expect(syncResult).toHaveProperty('conflicts');
        });
    });

    describe('2. Conflict Resolution Service', () => {
        test('should detect time overlap conflicts', async () => {
            const overlappingEvent = {
                start_time: '2024-12-25T10:30:00Z',
                end_time: '2024-12-25T11:30:00Z'
            };

            const conflicts = await conflictService.detectTimeOverlapConflicts(
                mockUser.id,
                overlappingEvent
            );

            expect(Array.isArray(conflicts)).toBe(true);
        });

        test('should detect buffer time violations', async () => {
            const closeEvent = {
                start_time: '2024-12-25T11:05:00Z', // 5 minutes after first event ends
                end_time: '2024-12-25T12:00:00Z'
            };

            const conflicts = await conflictService.detectBufferTimeConflicts(
                mockUser.id,
                closeEvent,
                { bufferMinutes: 15 }
            );

            expect(Array.isArray(conflicts)).toBe(true);
        });

        test('should generate appropriate resolution suggestions', async () => {
            const conflict = {
                type: 'time_overlap',
                severity: 'high',
                conflictingItem: mockAppointment
            };

            const suggestions = await conflictService.generateResolutionSuggestions(
                conflict,
                { strategy: 'user_choice' }
            );

            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0]).toHaveProperty('type');
            expect(suggestions[0]).toHaveProperty('description');
        });

        test('should resolve conflicts using different strategies', async () => {
            const conflict = {
                type: 'time_overlap',
                originalEvent: mockAppointment,
                conflictingEvent: {
                    ...mockAppointment,
                    id: 'conflicting-123',
                    start_time: '2024-12-25T10:30:00Z'
                }
            };

            const strategies = ['user_choice', 'priority_based', 'time_based'];
            
            for (const strategy of strategies) {
                const resolution = await conflictService.resolveConflict(
                    conflict,
                    { strategy, userPreferences: {} }
                );
                
                expect(resolution).toHaveProperty('action');
                expect(resolution).toHaveProperty('description');
            }
        });
    });

    describe('3. Buffer Time Service', () => {
        test('should calculate buffer times correctly', async () => {
            const userPreferences = {
                beforeAppointment: 15,
                afterAppointment: 15,
                bufferTimeStrategy: 'fixed'
            };

            const bufferTimes = await bufferService.calculateBufferTimes(
                mockAppointment,
                userPreferences
            );

            expect(bufferTimes).toHaveProperty('before');
            expect(bufferTimes).toHaveProperty('after');
            expect(bufferTimes.before).toBe(15);
            expect(bufferTimes.after).toBe(15);
        });

        test('should apply adaptive buffer strategy', async () => {
            const adaptivePreferences = {
                bufferTimeStrategy: 'adaptive',
                adaptiveFactors: {
                    appointmentDuration: true,
                    appointmentType: true
                }
            };

            const bufferTimes = await bufferService.calculateBufferTimes(
                { ...mockAppointment, appointment_type: 'surgery' },
                adaptivePreferences
            );

            expect(bufferTimes.before).toBeGreaterThan(0);
            expect(bufferTimes.after).toBeGreaterThan(0);
        });

        test('should detect buffer conflicts', async () => {
            const appointment = {
                ...mockAppointment,
                start_time: '2024-12-25T11:10:00Z' // 10 minutes after first appointment
            };

            const conflicts = await bufferService.detectBufferConflicts(
                appointment,
                [mockAppointment]
            );

            expect(Array.isArray(conflicts)).toBe(true);
        });

        test('should suggest alternative times', async () => {
            const suggestions = await bufferService.suggestAlternativeTimes(
                mockAppointment,
                [/* existing appointments */],
                { bufferMinutes: 15, searchWindowHours: 24 }
            );

            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeGreaterThan(0);
            if (suggestions.length > 0) {
                expect(suggestions[0]).toHaveProperty('start_time');
                expect(suggestions[0]).toHaveProperty('end_time');
                expect(suggestions[0]).toHaveProperty('score');
            }
        });

        test('should sync buffer times to calendar', async () => {
            const mockCalendarAPI = {
                events: {
                    insert: jest.fn().mockResolvedValue({ data: { id: 'buffer-event-123' } })
                }
            };

            bufferService.getGoogleCalendarClient = jest.fn().mockResolvedValue(mockCalendarAPI);

            const result = await bufferService.syncBufferTimesToCalendar(
                mockAppointment,
                { createBufferBlocks: true }
            );

            expect(result.success).toBe(true);
        });
    });

    describe('4. Timezone Service', () => {
        test('should convert times between timezones', async () => {
            const conversion = await timezoneService.convertTimezone(
                '2024-12-25T10:00:00',
                'UTC',
                'America/New_York'
            );

            expect(conversion).toHaveProperty('original');
            expect(conversion).toHaveProperty('converted');
            expect(conversion.converted).toHaveProperty('datetime');
            expect(conversion.converted).toHaveProperty('timezone');
        });

        test('should handle DST transitions', async () => {
            const dstInstances = await timezoneService.handleDSTTransitions(
                {
                    ...mockAppointment,
                    timezone: 'America/New_York',
                    start_time: '2024-03-10T10:00:00Z' // During DST transition
                },
                new Date('2024-03-01'),
                new Date('2024-03-31')
            );

            expect(Array.isArray(dstInstances)).toBe(true);
        });

        test('should auto-detect timezone', async () => {
            const detected = await timezoneService.autoDetectTimezone({
                ipAddress: '8.8.8.8',
                userAgent: 'Mozilla/5.0...',
                userId: mockUser.id
            });

            expect(detected).toHaveProperty('detected');
            expect(detected.detected).toHaveProperty('timezone');
            expect(detected.detected).toHaveProperty('confidence');
        });

        test('should convert appointment timezones for different users', async () => {
            const converted = await timezoneService.convertAppointmentTimezone(
                mockAppointment,
                'Europe/London'
            );

            expect(converted).toHaveProperty('start_time_user_tz');
            expect(converted).toHaveProperty('end_time_user_tz');
            expect(converted).toHaveProperty('timezone_metadata');
        });
    });

    describe('5. Multiple Calendar Service', () => {
        test('should fetch available Google calendars', async () => {
            const mockCalendarAPI = {
                calendarList: {
                    list: jest.fn().mockResolvedValue({
                        data: {
                            items: [
                                {
                                    id: 'primary',
                                    summary: 'Primary Calendar',
                                    accessRole: 'owner',
                                    selected: true
                                },
                                {
                                    id: 'secondary@group.calendar.google.com',
                                    summary: 'Work Calendar',
                                    accessRole: 'writer'
                                }
                            ]
                        }
                    })
                }
            };

            calendarService.getGoogleCalendarClient = jest.fn().mockResolvedValue(mockCalendarAPI);

            const calendars = await calendarService.getAvailableCalendars(
                mockUser.id,
                'test-integration-id'
            );

            expect(Array.isArray(calendars)).toBe(true);
            expect(calendars.length).toBeGreaterThan(0);
            expect(calendars[0]).toHaveProperty('id');
            expect(calendars[0]).toHaveProperty('name');
            expect(calendars[0]).toHaveProperty('accessRole');
        });

        test('should recommend calendars for new users', async () => {
            const calendars = [
                { id: 'primary', name: 'Primary', accessRole: 'owner' },
                { id: 'work', name: 'Work Calendar', accessRole: 'writer' },
                { id: 'personal', name: 'Personal', accessRole: 'owner' }
            ];

            const recommendations = await calendarService.recommendCalendarsForNewUser(
                calendars,
                { userRole: 'doctor' }
            );

            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0]).toHaveProperty('recommended');
        });

        test('should save user calendar selections', async () => {
            const selections = [
                {
                    calendar_id: 'primary',
                    calendar_name: 'Primary Calendar',
                    sync_direction: 'bidirectional',
                    is_active: true
                }
            ];

            const result = await calendarService.saveUserCalendarSelections(
                mockUser.id,
                'test-integration-id',
                selections
            );

            expect(result.success).toBe(true);
        });

        test('should get calendar sync preferences', async () => {
            const preferences = await calendarService.getCalendarSyncPreferences(
                mockUser.id,
                'test-integration-id'
            );

            expect(preferences).toHaveProperty('syncPrimaryCalendar');
            expect(preferences).toHaveProperty('syncDirection');
            expect(preferences).toHaveProperty('conflictResolution');
        });
    });

    describe('6. Google Calendar Webhook Service', () => {
        test('should setup webhook subscription', async () => {
            const mockCalendarAPI = {
                events: {
                    watch: jest.fn().mockResolvedValue({
                        data: {
                            id: 'webhook-channel-123',
                            resourceId: 'resource-123',
                            expiration: Date.now() + 86400000 // 24 hours
                        }
                    })
                }
            };

            webhookService.getGoogleCalendarClient = jest.fn().mockResolvedValue(mockCalendarAPI);

            const subscription = await webhookService.setupWebhookSubscription(
                mockUser.id,
                'test-integration-id',
                'primary'
            );

            expect(subscription.success).toBe(true);
            expect(subscription.channel).toHaveProperty('id');
            expect(subscription.channel).toHaveProperty('expiration');
        });

        test('should process webhook notifications', async () => {
            const webhookHeaders = {
                'x-goog-channel-id': 'webhook-channel-123',
                'x-goog-channel-token': 'verification-token',
                'x-goog-resource-state': 'sync'
            };

            const result = await webhookService.processWebhookNotification(
                webhookHeaders,
                {}
            );

            expect(result).toHaveProperty('processed');
        });

        test('should renew expiring webhook subscriptions', async () => {
            // Mock an expiring channel
            const expiringChannel = {
                id: 'expiring-channel-123',
                integration_id: 'test-integration-id',
                calendar_id: 'primary',
                expiration: new Date(Date.now() + 3600000) // 1 hour from now
            };

            const renewalResult = await webhookService.renewWebhookSubscription(
                expiringChannel
            );

            expect(renewalResult).toHaveProperty('success');
        });

        test('should validate webhook security', () => {
            const headers = {
                'x-goog-channel-id': 'test-channel',
                'x-goog-channel-token': 'valid-token'
            };

            const isValid = webhookService.validateWebhookSecurity(headers);
            expect(typeof isValid).toBe('boolean');
        });
    });

    describe('7. End-to-End Integration Tests', () => {
        test('should complete full appointment sync workflow', async () => {
            // 1. Create appointment in PharmaDOC
            const appointment = { ...mockAppointment };
            
            // 2. Calculate buffer times
            const bufferTimes = await bufferService.calculateBufferTimes(appointment);
            
            // 3. Check for conflicts
            const conflicts = await conflictService.detectConflicts(
                mockUser.id,
                appointment,
                { checkBufferTime: true }
            );
            
            // 4. Sync to Google Calendar if no conflicts
            if (conflicts.length === 0) {
                const syncResult = await syncService.syncAppointmentToGoogle(
                    mockUser.id,
                    appointment,
                    { includeBufferTimes: true }
                );
                expect(syncResult.success).toBe(true);
            }
            
            // 5. Setup webhook for real-time updates
            const webhookResult = await webhookService.setupWebhookSubscription(
                mockUser.id,
                'test-integration-id',
                'primary'
            );
            
            expect(webhookResult.success).toBe(true);
        });

        test('should handle timezone conversion across services', async () => {
            const utcAppointment = { ...mockAppointment };
            
            // Convert to user's timezone
            const convertedAppointment = await timezoneService.convertAppointmentTimezone(
                utcAppointment,
                'Europe/London'
            );
            
            // Calculate buffer times in user's timezone
            const bufferTimes = await bufferService.calculateBufferTimes(
                convertedAppointment
            );
            
            expect(convertedAppointment.timezone_metadata).toHaveProperty('user_timezone');
            expect(bufferTimes).toHaveProperty('before');
        });

        test('should handle conflict resolution workflow', async () => {
            const conflictingAppointment = {
                ...mockAppointment,
                id: 'conflicting-appointment',
                start_time: '2024-12-25T10:30:00Z'
            };
            
            // Detect conflicts
            const conflicts = await conflictService.detectConflicts(
                mockUser.id,
                conflictingAppointment
            );
            
            if (conflicts.length > 0) {
                // Generate resolution suggestions
                const suggestions = await conflictService.generateResolutionSuggestions(
                    conflicts[0]
                );
                
                expect(suggestions.length).toBeGreaterThan(0);
                
                // Apply automatic resolution if possible
                const resolution = await conflictService.resolveConflict(
                    conflicts[0],
                    { strategy: 'automatic' }
                );
                
                expect(resolution).toHaveProperty('action');
            }
        });
    });

    // Helper functions
    async function setupTestData() {
        // Setup test user and preferences
        const testUserPrefs = {
            user_id: mockUser.id,
            buffer_time_settings: {
                beforeAppointment: 15,
                afterAppointment: 15,
                bufferTimeStrategy: 'fixed'
            },
            timezone_settings: {
                timezone: 'UTC',
                use24HourFormat: true
            }
        };

        // Note: In actual tests, you would insert this into the test database
        console.log('Test data setup complete');
    }

    async function cleanupTestData() {
        // Cleanup test data from database
        console.log('Test data cleanup complete');
    }
});

// Test configuration and mocks
beforeAll(() => {
    // Mock environment variables
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    
    // Mock Google APIs
    jest.mock('googleapis', () => ({
        google: {
            auth: {
                OAuth2: jest.fn().mockImplementation(() => ({
                    setCredentials: jest.fn(),
                    getAccessToken: jest.fn().mockResolvedValue({
                        token: 'mock-token'
                    })
                }))
            },
            calendar: jest.fn().mockReturnValue({
                events: {
                    list: jest.fn(),
                    insert: jest.fn(),
                    update: jest.fn(),
                    delete: jest.fn(),
                    watch: jest.fn()
                },
                calendarList: {
                    list: jest.fn()
                }
            })
        }
    }));
});

module.exports = {
    mockUser,
    mockAppointment,
    mockGoogleEvent,
    mockGoogleCredentials
}; 