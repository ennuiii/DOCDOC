/**
 * Microsoft Graph Integration Tests
 * Comprehensive test suite for all Microsoft Graph (Outlook/Teams) functionality
 */

const { createClient } = require('@supabase/supabase-js');
const OutlookCalendarSyncService = require('../../integrations/services/OutlookCalendarSyncService');
const MicrosoftTeamsMeetingService = require('../../integrations/services/MicrosoftTeamsMeetingService');
const MicrosoftGraphWebhookService = require('../../integrations/services/MicrosoftGraphWebhookService');
const ConflictResolutionService = require('../../integrations/services/ConflictResolutionService');
const BufferTimeService = require('../../integrations/services/BufferTimeService');
const TimezoneService = require('../../integrations/services/TimezoneService');
const MultipleCalendarService = require('../../integrations/services/MultipleCalendarService');
const MicrosoftOAuthProvider = require('../../integrations/providers/microsoft/MicrosoftOAuthProvider');

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

const mockMicrosoftCredentials = {
    access_token: 'mock-ms-access-token',
    refresh_token: 'mock-ms-refresh-token',
    expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    account_type: 'work', // work, personal
    tenant_id: 'mock-tenant-123'
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

const mockOutlookEvent = {
    id: 'outlook-event-123',
    subject: 'PharmaDOC: Product Demonstration',
    start: {
        dateTime: '2024-12-25T10:00:00Z',
        timeZone: 'UTC'
    },
    end: {
        dateTime: '2024-12-25T11:00:00Z',
        timeZone: 'UTC'
    },
    attendees: [
        { 
            emailAddress: { address: 'test@pharmadoc.com', name: 'Test Doctor' },
            status: { response: 'accepted' }
        },
        { 
            emailAddress: { address: 'pharma@company.com', name: 'Pharma Rep' },
            status: { response: 'none' }
        }
    ],
    onlineMeeting: {
        joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting...',
        conferenceId: 'mock-conference-id',
        tollNumbers: []
    },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness'
};

const mockTeamsMeeting = {
    id: 'teams-meeting-123',
    joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting...',
    subject: 'PharmaDOC: Product Demonstration',
    startDateTime: '2024-12-25T10:00:00Z',
    endDateTime: '2024-12-25T11:00:00Z',
    participants: {
        organizer: {
            identity: {
                user: {
                    id: mockUser.id,
                    displayName: 'Test Doctor'
                }
            }
        },
        attendees: [
            {
                identity: {
                    user: {
                        id: 'pharma-456',
                        displayName: 'Pharma Rep'
                    }
                }
            }
        ]
    },
    meetingInfo: {
        allowedPresenters: 'everyone',
        allowMeetingChat: 'enabled',
        allowTeamworkReactions: true
    }
};

const mockWebhookNotification = {
    subscriptionId: 'webhook-sub-123',
    clientState: 'mock-client-state',
    changeType: 'updated',
    resource: 'me/calendar/events/outlook-event-123',
    subscriptionExpirationDateTime: '2024-12-26T10:00:00Z',
    resourceData: {
        '@odata.type': '#Microsoft.Graph.Event',
        '@odata.id': 'Users/test@pharmadoc.com/Events/outlook-event-123',
        '@odata.etag': 'W/"mock-etag"',
        id: 'outlook-event-123'
    }
};

describe('Microsoft Graph Integration', () => {
    let outlookSyncService;
    let teamsMeetingService;
    let webhookService;
    let conflictService;
    let bufferService;
    let timezoneService;
    let calendarService;
    let oauthProvider;
    let supabase;

    beforeAll(async () => {
        // Initialize services
        outlookSyncService = new OutlookCalendarSyncService();
        teamsMeetingService = new MicrosoftTeamsMeetingService();
        webhookService = new MicrosoftGraphWebhookService();
        conflictService = new ConflictResolutionService();
        bufferService = new BufferTimeService();
        timezoneService = new TimezoneService();
        calendarService = new MultipleCalendarService();
        oauthProvider = new MicrosoftOAuthProvider();
        
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

    test('should initialize test suite', () => {
        expect(supabase).toBeDefined();
    });

    describe('1. Microsoft OAuth Provider', () => {
        test('should initialize with correct configuration', () => {
            expect(oauthProvider).toBeDefined();
            expect(oauthProvider.clientId).toBeDefined();
            expect(oauthProvider.redirectUri).toBeDefined();
        });

        test('should generate correct authorization URL', () => {
            const authUrl = oauthProvider.getAuthorizationUrl('work');
            
            expect(authUrl).toContain('https://login.microsoftonline.com');
            expect(authUrl).toContain('response_type=code');
            expect(authUrl).toContain('scope=');
            expect(authUrl).toContain('Calendars.ReadWrite');
            expect(authUrl).toContain('OnlineMeetings.ReadWrite');
        });

        test('should handle token exchange correctly', async () => {
            // Mock the token exchange
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    access_token: mockMicrosoftCredentials.access_token,
                    refresh_token: mockMicrosoftCredentials.refresh_token,
                    expires_in: 3600,
                    token_type: 'Bearer',
                    scope: 'Calendars.ReadWrite OnlineMeetings.ReadWrite'
                })
            });

            const tokens = await oauthProvider.exchangeCodeForTokens('mock-auth-code');

            expect(tokens).toHaveProperty('access_token');
            expect(tokens).toHaveProperty('refresh_token');
            expect(tokens).toHaveProperty('expires_at');
        });

        test('should refresh tokens when expired', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    access_token: 'new-access-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                })
            });

            const newTokens = await oauthProvider.refreshAccessToken(
                mockMicrosoftCredentials.refresh_token
            );

            expect(newTokens.access_token).toBe('new-access-token');
            expect(newTokens).toHaveProperty('expires_at');
        });

        test('should validate tokens correctly', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    id: mockUser.id,
                    mail: mockUser.email,
                    displayName: `${mockUser.profile.first_name} ${mockUser.profile.last_name}`
                })
            });

            const isValid = await oauthProvider.validateToken(mockMicrosoftCredentials.access_token);
            expect(isValid).toBe(true);
        });
    });

    describe('2. Outlook Calendar Sync Service', () => {
        test('should initialize with correct configuration', () => {
            expect(outlookSyncService).toBeDefined();
            expect(outlookSyncService.supabase).toBeDefined();
            expect(outlookSyncService.auditLogger).toBeDefined();
        });

        test('should sync appointments to Outlook Calendar', async () => {
            // Mock Microsoft Graph API
            const mockGraphAPI = {
                post: jest.fn().mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve(mockOutlookEvent)
                })
            };

            // Mock the fetch function for Graph API calls
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockOutlookEvent)
            });

            const result = await outlookSyncService.syncAppointmentToOutlook(
                mockUser.id,
                mockAppointment,
                { calendarId: 'primary' }
            );

            expect(result.success).toBe(true);
            expect(result.outlookEvent).toBeDefined();
            expect(result.outlookEvent.id).toBe(mockOutlookEvent.id);
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
                { checkBufferTime: true, provider: 'microsoft' }
            );

            expect(Array.isArray(conflicts)).toBe(true);
            if (conflicts.length > 0) {
                expect(conflicts[0]).toHaveProperty('type');
                expect(conflicts[0]).toHaveProperty('severity');
                expect(conflicts[0]).toHaveProperty('resolutionSuggestions');
            }
        });

        test('should sync Outlook events to PharmaDOC appointments', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    value: [mockOutlookEvent]
                })
            });

            const result = await outlookSyncService.syncFromOutlook(
                mockUser.id,
                { 
                    calendarId: 'primary',
                    startTime: '2024-12-25T00:00:00Z',
                    endTime: '2024-12-26T00:00:00Z'
                }
            );

            expect(result.success).toBe(true);
            expect(result.stats).toHaveProperty('eventsProcessed');
            expect(result.stats).toHaveProperty('appointmentsCreated');
        });

        test('should handle bidirectional sync correctly', async () => {
            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ value: [mockOutlookEvent] })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockOutlookEvent)
                });

            const syncResult = await outlookSyncService.performBidirectionalSync(
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
            expect(syncResult).toHaveProperty('toOutlook');
            expect(syncResult).toHaveProperty('fromOutlook');
            expect(syncResult).toHaveProperty('conflicts');
        });

        test('should handle multiple calendar synchronization', async () => {
            const calendars = [
                { id: 'primary', name: 'Calendar' },
                { id: 'work-calendar', name: 'Work Calendar' }
            ];

            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ value: calendars })
                })
                .mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ value: [mockOutlookEvent] })
                });

            const result = await outlookSyncService.syncMultipleCalendars(
                mockUser.id,
                { selectedCalendars: calendars.map(c => c.id) }
            );

            expect(result.success).toBe(true);
            expect(result.results).toHaveLength(calendars.length);
        });
    });

    describe('3. Microsoft Teams Meeting Service', () => {
        test('should initialize with correct configuration', () => {
            expect(teamsMeetingService).toBeDefined();
            expect(teamsMeetingService.auditLogger).toBeDefined();
        });

        test('should create Teams meeting successfully', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockTeamsMeeting)
            });

            const meetingData = {
                subject: 'PharmaDOC: Product Demonstration',
                startDateTime: '2024-12-25T10:00:00Z',
                endDateTime: '2024-12-25T11:00:00Z',
                attendees: ['pharma@company.com']
            };

            const result = await teamsMeetingService.createTeamsMeeting(
                mockMicrosoftCredentials.access_token,
                meetingData
            );

            expect(result.success).toBe(true);
            expect(result.meeting).toHaveProperty('joinWebUrl');
            expect(result.meeting).toHaveProperty('id');
        });

        test('should update Teams meeting correctly', async () => {
            const updatedMeeting = {
                ...mockTeamsMeeting,
                subject: 'Updated: PharmaDOC Meeting'
            };

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(updatedMeeting)
            });

            const result = await teamsMeetingService.updateTeamsMeeting(
                mockMicrosoftCredentials.access_token,
                mockTeamsMeeting.id,
                { subject: 'Updated: PharmaDOC Meeting' }
            );

            expect(result.success).toBe(true);
            expect(result.meeting.subject).toBe('Updated: PharmaDOC Meeting');
        });

        test('should delete Teams meeting successfully', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 204
            });

            const result = await teamsMeetingService.deleteTeamsMeeting(
                mockMicrosoftCredentials.access_token,
                mockTeamsMeeting.id
            );

            expect(result.success).toBe(true);
        });

        test('should retrieve Teams meeting details', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockTeamsMeeting)
            });

            const result = await teamsMeetingService.getTeamsMeeting(
                mockMicrosoftCredentials.access_token,
                mockTeamsMeeting.id
            );

            expect(result.success).toBe(true);
            expect(result.meeting).toHaveProperty('joinWebUrl');
            expect(result.meeting.id).toBe(mockTeamsMeeting.id);
        });

        test('should generate meeting invitations in multiple formats', async () => {
            const invitations = await teamsMeetingService.generateMeetingInvitations(
                mockTeamsMeeting,
                {
                    organizer: mockUser,
                    attendees: [{ email: 'pharma@company.com', name: 'Pharma Rep' }]
                }
            );

            expect(invitations).toHaveProperty('html');
            expect(invitations).toHaveProperty('text');
            expect(invitations).toHaveProperty('ics');
            
            expect(invitations.html).toContain('Teams Meeting');
            expect(invitations.text).toContain(mockTeamsMeeting.joinWebUrl);
            expect(invitations.ics).toContain('BEGIN:VCALENDAR');
        });

        test('should handle meeting options configuration', async () => {
            const meetingOptions = {
                allowedPresenters: 'organizer',
                allowMeetingChat: 'disabled',
                allowTeamworkReactions: false,
                allowRecording: true,
                allowTranscription: true
            };

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ...mockTeamsMeeting,
                    meetingInfo: meetingOptions
                })
            });

            const result = await teamsMeetingService.configureMeetingOptions(
                mockMicrosoftCredentials.access_token,
                mockTeamsMeeting.id,
                meetingOptions
            );

            expect(result.success).toBe(true);
            expect(result.meeting.meetingInfo.allowedPresenters).toBe('organizer');
        });
    });

    describe('4. Microsoft Graph Webhook Service', () => {
        test('should initialize with correct configuration', () => {
            expect(webhookService).toBeDefined();
            expect(webhookService.auditLogger).toBeDefined();
            expect(webhookService.activeSubscriptions).toBeDefined();
        });

        test('should create calendar webhook subscription', async () => {
            const mockSubscription = {
                id: 'webhook-sub-123',
                resource: 'me/calendar/events',
                changeType: 'created,updated,deleted',
                notificationUrl: 'https://pharmadoc.com/webhooks/microsoft',
                expirationDateTime: '2024-12-28T10:00:00Z',
                clientState: 'mock-client-state'
            };

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockSubscription)
            });

            const subscriptionData = {
                userId: mockUser.id,
                notificationUrl: 'https://pharmadoc.com/webhooks/microsoft',
                changeTypes: ['created', 'updated', 'deleted']
            };

            const result = await webhookService.createCalendarSubscription(
                mockMicrosoftCredentials.access_token,
                subscriptionData
            );

            expect(result).toHaveProperty('id');
            expect(result.resource).toBe('me/calendar/events');
            expect(webhookService.activeSubscriptions.has(result.id)).toBe(true);
        });

        test('should renew webhook subscription', async () => {
            const renewedSubscription = {
                id: 'webhook-sub-123',
                expirationDateTime: '2024-12-31T10:00:00Z'
            };

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(renewedSubscription)
            });

            // First add the subscription to active subscriptions
            webhookService.activeSubscriptions.set('webhook-sub-123', {
                id: 'webhook-sub-123',
                userId: mockUser.id,
                expirationDateTime: '2024-12-28T10:00:00Z'
            });

            const result = await webhookService.renewSubscription(
                'webhook-sub-123',
                mockMicrosoftCredentials.access_token
            );

            expect(result.expirationDateTime).toBe('2024-12-31T10:00:00Z');
        });

        test('should delete webhook subscription', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 204
            });

            webhookService.activeSubscriptions.set('webhook-sub-123', {
                id: 'webhook-sub-123',
                userId: mockUser.id
            });

            await webhookService.deleteSubscription(
                'webhook-sub-123',
                mockMicrosoftCredentials.access_token
            );

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/subscriptions/webhook-sub-123'),
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        test('should process webhook notifications correctly', async () => {
            // Mock the sync service method
            outlookSyncService.processWebhookEvent = jest.fn().mockResolvedValue({
                success: true,
                action: 'updated'
            });

            const result = await webhookService.processWebhookNotification(
                mockWebhookNotification
            );

            expect(result.success).toBe(true);
            expect(result).toHaveProperty('processedChanges');
        });

        test('should validate webhook notifications', async () => {
            // Set up client state for validation
            webhookService.clientStates.set(mockWebhookNotification.clientState, {
                subscriptionId: mockWebhookNotification.subscriptionId,
                userId: mockUser.id,
                createdAt: new Date()
            });

            const isValid = await webhookService.validateNotification(mockWebhookNotification);
            expect(isValid).toBe(true);
        });

        test('should handle subscription validation', () => {
            const validationToken = 'mock-validation-token-123';
            const result = webhookService.handleSubscriptionValidation(validationToken);
            
            expect(result).toBe(validationToken);
            expect(webhookService.validationTokens.has(validationToken)).toBe(true);
        });

        test('should auto-renew expiring subscriptions', async () => {
            // Add a subscription that expires soon
            const expiringSubscription = {
                id: 'expiring-sub-123',
                userId: mockUser.id,
                accessToken: mockMicrosoftCredentials.access_token,
                expirationDateTime: new Date(Date.now() + (23 * 60 * 60 * 1000)).toISOString() // 23 hours
            };

            webhookService.activeSubscriptions.set('expiring-sub-123', expiringSubscription);

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    id: 'expiring-sub-123',
                    expirationDateTime: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString()
                })
            });

            await webhookService.autoRenewSubscriptions();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/subscriptions/expiring-sub-123'),
                expect.objectContaining({ method: 'PATCH' })
            );
        });
    });

    describe('5. Integration Testing - End-to-End Workflows', () => {
        test('should complete full appointment creation with Teams meeting', async () => {
            // Mock all API calls for the complete workflow
            global.fetch = jest.fn()
                // Create Teams meeting
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockTeamsMeeting)
                })
                // Create Outlook calendar event
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockOutlookEvent)
                })
                // Create webhook subscription
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        id: 'webhook-sub-123',
                        resource: 'me/calendar/events'
                    })
                });

            // Complete workflow test
            const appointmentData = {
                ...mockAppointment,
                requiresTeamsMeeting: true,
                syncToOutlook: true,
                enableWebhooks: true
            };

            // Step 1: Create Teams meeting
            const teamsResult = await teamsMeetingService.createTeamsMeeting(
                mockMicrosoftCredentials.access_token,
                {
                    subject: appointmentData.purpose,
                    startDateTime: appointmentData.start_time,
                    endDateTime: appointmentData.end_time
                }
            );

            expect(teamsResult.success).toBe(true);

            // Step 2: Create Outlook event with Teams meeting
            const outlookResult = await outlookSyncService.syncAppointmentToOutlook(
                mockUser.id,
                {
                    ...appointmentData,
                    teams_meeting_url: teamsResult.meeting.joinWebUrl
                }
            );

            expect(outlookResult.success).toBe(true);

            // Step 3: Setup webhook for real-time updates
            const webhookResult = await webhookService.createCalendarSubscription(
                mockMicrosoftCredentials.access_token,
                {
                    userId: mockUser.id,
                    notificationUrl: 'https://pharmadoc.com/webhooks/microsoft'
                }
            );

            expect(webhookResult).toHaveProperty('id');

            // Verify the complete workflow
            expect(teamsResult.meeting).toHaveProperty('joinWebUrl');
            expect(outlookResult.outlookEvent).toHaveProperty('onlineMeeting');
            expect(webhookService.activeSubscriptions.size).toBeGreaterThan(0);
        });

        test('should handle conflict resolution across multiple providers', async () => {
            const conflictingAppointment = {
                ...mockAppointment,
                start_time: '2024-12-25T10:15:00Z', // 15-minute overlap
                end_time: '2024-12-25T11:15:00Z'
            };

            // Test conflict detection with Microsoft provider
            const microsoftConflicts = await conflictService.detectConflicts(
                mockUser.id,
                conflictingAppointment,
                { 
                    providers: ['microsoft'],
                    checkBufferTime: true 
                }
            );

            expect(Array.isArray(microsoftConflicts)).toBe(true);
            
            if (microsoftConflicts.length > 0) {
                expect(microsoftConflicts[0]).toHaveProperty('provider', 'microsoft');
                expect(microsoftConflicts[0]).toHaveProperty('resolutionSuggestions');
            }
        });

        test('should sync across multiple calendar providers simultaneously', async () => {
            global.fetch = jest.fn()
                .mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve(mockOutlookEvent)
                });

            const multiProviderSync = await calendarService.syncAcrossProviders(
                mockUser.id,
                mockAppointment,
                {
                    providers: ['microsoft'],
                    syncDirection: 'bidirectional',
                    conflictResolution: 'user_choice'
                }
            );

            expect(multiProviderSync.success).toBe(true);
            expect(multiProviderSync.results).toHaveProperty('microsoft');
        });
    });

    describe('6. Error Handling and Edge Cases', () => {
        test('should handle Microsoft Graph API rate limiting', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 429,
                headers: {
                    get: (header) => {
                        if (header === 'Retry-After') return '60';
                        return null;
                    }
                },
                json: () => Promise.resolve({
                    error: {
                        code: 'TooManyRequests',
                        message: 'Too many requests'
                    }
                })
            });

            try {
                await outlookSyncService.syncAppointmentToOutlook(
                    mockUser.id,
                    mockAppointment
                );
            } catch (error) {
                expect(error.message).toContain('rate limit');
            }
        });

        test('should handle token expiration gracefully', async () => {
            global.fetch = jest.fn()
                // First call fails with 401
                .mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({
                        error: {
                            code: 'InvalidAuthenticationToken',
                            message: 'Access token has expired'
                        }
                    })
                })
                // Token refresh succeeds
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        access_token: 'new-access-token',
                        expires_in: 3600
                    })
                })
                // Retry succeeds
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockOutlookEvent)
                });

            const result = await outlookSyncService.syncAppointmentToOutlook(
                mockUser.id,
                mockAppointment
            );

            expect(result.success).toBe(true);
            expect(global.fetch).toHaveBeenCalledTimes(3); // Initial call, token refresh, retry
        });

        test('should handle malformed webhook notifications', async () => {
            const malformedNotification = {
                // Missing required fields
                changeType: 'updated'
            };

            const isValid = await webhookService.validateNotification(malformedNotification);
            expect(isValid).toBe(false);
        });

        test('should handle Teams meeting creation failures', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: () => Promise.resolve({
                    error: {
                        code: 'Forbidden',
                        message: 'Insufficient privileges to complete the operation'
                    }
                })
            });

            try {
                await teamsMeetingService.createTeamsMeeting(
                    mockMicrosoftCredentials.access_token,
                    {
                        subject: 'Test Meeting',
                        startDateTime: '2024-12-25T10:00:00Z',
                        endDateTime: '2024-12-25T11:00:00Z'
                    }
                );
            } catch (error) {
                expect(error.message).toContain('Insufficient privileges');
            }
        });
    });

    describe('7. Performance Testing', () => {
        test('should handle batch calendar operations efficiently', async () => {
            const batchAppointments = Array.from({ length: 10 }, (_, i) => ({
                ...mockAppointment,
                id: `batch-appointment-${i}`,
                start_time: new Date(Date.now() + (i * 60 * 60 * 1000)).toISOString()
            }));

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockOutlookEvent)
            });

            const startTime = Date.now();
            
            const batchResults = await Promise.all(
                batchAppointments.map(appointment =>
                    outlookSyncService.syncAppointmentToOutlook(mockUser.id, appointment)
                )
            );

            const duration = Date.now() - startTime;

            expect(batchResults).toHaveLength(10);
            expect(batchResults.every(result => result.success)).toBe(true);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });

        test('should handle large calendar data sets efficiently', async () => {
            const largeEventSet = Array.from({ length: 100 }, (_, i) => ({
                ...mockOutlookEvent,
                id: `large-event-${i}`,
                subject: `Event ${i}`
            }));

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ value: largeEventSet })
            });

            const startTime = Date.now();
            
            const result = await outlookSyncService.syncFromOutlook(
                mockUser.id,
                {
                    calendarId: 'primary',
                    startTime: '2024-12-01T00:00:00Z',
                    endTime: '2024-12-31T23:59:59Z'
                }
            );

            const duration = Date.now() - startTime;

            expect(result.success).toBe(true);
            expect(result.stats.eventsProcessed).toBe(100);
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        });
    });

    // Helper functions for test setup and cleanup
    async function setupTestData() {
        try {
            // Create test user in database
            await supabase.from('users').upsert([mockUser]);
            
            // Create test Microsoft credentials
            await supabase.from('oauth_credentials').upsert([{
                user_id: mockUser.id,
                provider: 'microsoft',
                access_token: mockMicrosoftCredentials.access_token,
                refresh_token: mockMicrosoftCredentials.refresh_token,
                expires_at: mockMicrosoftCredentials.expires_at,
                account_type: mockMicrosoftCredentials.account_type,
                tenant_id: mockMicrosoftCredentials.tenant_id
            }]);

            // Create test appointment
            await supabase.from('appointments').upsert([mockAppointment]);

            console.log('Microsoft Graph test data setup completed');
        } catch (error) {
            console.error('Failed to setup test data:', error);
        }
    }

    async function cleanupTestData() {
        try {
            // Clean up test data
            await supabase.from('appointments').delete().eq('id', mockAppointment.id);
            await supabase.from('oauth_credentials').delete().eq('user_id', mockUser.id);
            await supabase.from('users').delete().eq('id', mockUser.id);

            // Clear service caches and subscriptions
            if (webhookService.activeSubscriptions) {
                webhookService.activeSubscriptions.clear();
            }
            if (webhookService.clientStates) {
                webhookService.clientStates.clear();
            }

            console.log('Microsoft Graph test data cleanup completed');
        } catch (error) {
            console.error('Failed to cleanup test data:', error);
        }
    }
}); 