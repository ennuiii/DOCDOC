import AuditLogger from './AuditLogger.js';
import RateLimitManager from './RateLimitManager.js';
import TimezoneService from './TimezoneService.js';
import ConflictResolutionService from './ConflictResolutionService.js';
import BufferTimeService from './BufferTimeService.js';
import { MicrosoftTeamsMeetingService } from './MicrosoftTeamsMeetingService.js';
import MicrosoftOAuthProvider from '../providers/microsoft/MicrosoftOAuthProvider.js';

/**
 * Outlook Calendar Synchronization Service
 * Handles bidirectional synchronization between PharmaDOC and Outlook calendars
 * via Microsoft Graph API
 */
export default class OutlookCalendarSyncService {
  constructor() {
    console.log('🔵 [MICROSOFT-DEBUG] OutlookCalendarSyncService constructor called');
    console.log('🔵 [MICROSOFT-DEBUG] Environment check:', {
      hasMicrosoftClientId: !!process.env.MICROSOFT_CLIENT_ID,
      hasMicrosoftClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
      nodeEnv: process.env.NODE_ENV
    });
    
    this.auditLogger = new AuditLogger('OutlookCalendarSync');
    this.rateLimiter = new RateLimitManager({
      requests: 2000,
      window: 300000, // 5 minutes for Microsoft Graph
      burstLimit: 100
    });
    
    try {
      this.timezoneService = new TimezoneService();
      this.conflictResolver = new ConflictResolutionService();
      this.bufferTimeService = new BufferTimeService();
      this.teamsService = new MicrosoftTeamsMeetingService();
      this.oauthProvider = new MicrosoftOAuthProvider();
      console.log('🔵 [MICROSOFT-DEBUG] All services initialized successfully (including Teams service)');
    } catch (initError) {
      console.error('❌ [MICROSOFT-DEBUG] Service initialization failed:', initError);
      throw new Error(`Failed to initialize OutlookCalendarSyncService: ${initError.message}`);
    }
    
    // Microsoft Graph API endpoints
    this.graphUrl = 'https://graph.microsoft.com/v1.0';
    this.betaGraphUrl = 'https://graph.microsoft.com/beta';
    
    // Sync state management
    this.syncStates = new Map();
    this.syncIntervals = new Map();
    
    console.log('✅ [MICROSOFT-DEBUG] OutlookCalendarSyncService initialized with Graph URL:', this.graphUrl);
  }

  /**
   * Initialize sync for a user
   * @param {string} userId - User ID
   * @param {string} accessToken - Microsoft access token
   * @param {Object} syncSettings - Sync configuration
   */
  async initializeSync(userId, accessToken, syncSettings = {}) {
    console.log('🔵 [MICROSOFT-DEBUG] =================================');
    console.log('🔵 [MICROSOFT-DEBUG] STARTING MICROSOFT SYNC INITIALIZATION');
    console.log('🔵 [MICROSOFT-DEBUG] =================================');
    
    try {
      console.log('🔵 [MICROSOFT-DEBUG] Input validation:');
      console.log('🔵 [MICROSOFT-DEBUG] - User ID:', userId || 'MISSING');
      console.log('🔵 [MICROSOFT-DEBUG] - Access Token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'MISSING');
      console.log('🔵 [MICROSOFT-DEBUG] - Sync Settings:', JSON.stringify(syncSettings, null, 2));
      
      if (!userId) {
        console.error('❌ [MICROSOFT-DEBUG] Missing required userId parameter');
        throw new Error('User ID is required for Microsoft sync initialization');
      }
      
      if (!accessToken) {
        console.error('❌ [MICROSOFT-DEBUG] Missing required accessToken parameter');
        throw new Error('Access token is required for Microsoft sync initialization');
      }
      
      this.auditLogger.log('info', 'Initializing Outlook sync', { userId });

      const {
        syncDirection = 'bidirectional', // 'to-outlook', 'from-outlook', 'bidirectional'
        selectedCalendars = ['primary'],
        syncInterval = 300000, // 5 minutes
        enableConflictResolution = true,
        enableBufferTime = true,
        includeTeamsMeetings = true,
        forceFull = false
      } = syncSettings;

      console.log('🔵 [MICROSOFT-DEBUG] Parsed sync configuration:', {
        syncDirection,
        selectedCalendars,
        syncInterval,
        enableConflictResolution,
        enableBufferTime,
        includeTeamsMeetings,
        forceFull
      });

      // Validate token first
      console.log('🔵 [MICROSOFT-DEBUG] Step 1: Validating Microsoft access token...');
      let isValidToken = false;
      let tokenValidationError = null;
      
      try {
        isValidToken = await this.oauthProvider.validateToken(accessToken);
        console.log('🔵 [MICROSOFT-DEBUG] Token validation result:', isValidToken);
      } catch (validationError) {
        console.error('❌ [MICROSOFT-DEBUG] Token validation error:', validationError);
        tokenValidationError = validationError;
      }
      
      if (!isValidToken) {
        console.error('❌ [MICROSOFT-DEBUG] Invalid Microsoft access token');
        console.error('❌ [MICROSOFT-DEBUG] Token validation error details:', tokenValidationError?.message || 'Unknown error');
        throw new Error(`Invalid Microsoft access token: ${tokenValidationError?.message || 'Token validation failed'}`);
      }

      // Get user profile
      console.log('🔵 [MICROSOFT-DEBUG] Step 2: Getting user profile...');
      let userProfile = null;
      try {
        userProfile = await this.oauthProvider.getUserProfile(accessToken);
        console.log('🔵 [MICROSOFT-DEBUG] User profile received:', {
          id: userProfile?.id,
          email: userProfile?.mail || userProfile?.userPrincipalName,
          name: userProfile?.displayName,
          jobTitle: userProfile?.jobTitle,
          officeLocation: userProfile?.officeLocation
        });
      } catch (profileError) {
        console.error('❌ [MICROSOFT-DEBUG] Failed to get user profile:', profileError);
        throw new Error(`Failed to get Microsoft user profile: ${profileError.message}`);
      }
      
      // Get calendars
      console.log('🔵 [MICROSOFT-DEBUG] Step 3: Getting calendars...');
      let calendars = [];
      try {
        calendars = await this.getCalendars(accessToken);
        console.log('🔵 [MICROSOFT-DEBUG] Calendars received:', {
          count: calendars.length,
          calendars: calendars.map(cal => ({
            id: cal.id,
            name: cal.name,
            isDefaultCalendar: cal.isDefaultCalendar,
            canEdit: cal.canEdit
          }))
        });
      } catch (calendarError) {
        console.error('❌ [MICROSOFT-DEBUG] Failed to get calendars:', calendarError);
        throw new Error(`Failed to get Microsoft calendars: ${calendarError.message}`);
      }

      // Initialize sync state
      console.log('🔵 [MICROSOFT-DEBUG] Step 4: Initializing sync state...');
      this.syncStates.set(userId, {
        accessToken,
        userProfile,
        calendars,
        syncSettings: {
          ...syncSettings,
          syncDirection,
          selectedCalendars,
          syncInterval,
          enableConflictResolution,
          enableBufferTime,
          includeTeamsMeetings,
          forceFull
        },
        lastSync: null,
        lastDeltaToken: null,
        isActive: true,
        syncErrors: [],
        syncStats: {
          appointmentsToOutlook: 0,
          appointmentsFromOutlook: 0,
          conflicts: 0,
          errors: 0
        },
        initializationTime: new Date().toISOString()
      });

      console.log('🔵 [MICROSOFT-DEBUG] Sync state initialized successfully');

      // Set up automatic sync interval
      if (syncInterval > 0) {
        console.log('🔵 [MICROSOFT-DEBUG] Setting up automatic sync interval:', syncInterval, 'ms');
        const intervalId = setInterval(async () => {
          try {
            console.log('🔵 [MICROSOFT-DEBUG] Running automatic sync for user:', userId);
            await this.performSync(userId);
          } catch (error) {
            console.error('❌ [MICROSOFT-DEBUG] Automatic sync failed:', error);
            this.auditLogger.log('error', 'Automatic sync failed', { userId, error: error.message });
          }
        }, syncInterval);

        this.syncIntervals.set(userId, intervalId);
        console.log('🔵 [MICROSOFT-DEBUG] Automatic sync interval set up with ID:', intervalId);
      }

      // Perform initial sync
      console.log('🔵 [MICROSOFT-DEBUG] Step 5: Performing initial sync...');
      let initialSyncResult = null;
      try {
        initialSyncResult = await this.performSync(userId);
        console.log('🔵 [MICROSOFT-DEBUG] Initial sync completed:', initialSyncResult);
      } catch (initialSyncError) {
        console.error('❌ [MICROSOFT-DEBUG] Initial sync failed:', initialSyncError);
        // Don't throw here - let the initialization succeed even if first sync fails
        this.auditLogger.log('error', 'Initial sync failed during initialization', { 
          userId, 
          error: initialSyncError.message 
        });
      }

      this.auditLogger.log('info', 'Outlook sync initialized successfully', {
        userId,
        calendarsCount: calendars.length,
        syncDirection,
        includeTeamsMeetings,
        initialSyncSuccess: !!initialSyncResult
      });

      console.log('🔵 [MICROSOFT-DEBUG] =================================');
      console.log('🔵 [MICROSOFT-DEBUG] MICROSOFT SYNC INITIALIZATION COMPLETED');
      console.log('🔵 [MICROSOFT-DEBUG] =================================');

      return {
        success: true,
        calendars,
        userProfile,
        syncSettings: this.syncStates.get(userId).syncSettings,
        initialSyncResult
      };
    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] =================================');
      console.error('❌ [MICROSOFT-DEBUG] MICROSOFT SYNC INITIALIZATION FAILED');
      console.error('❌ [MICROSOFT-DEBUG] =================================');
      console.error('❌ [MICROSOFT-DEBUG] Error details:', {
        message: error.message,
        stack: error.stack,
        userId: userId,
        syncSettings: syncSettings
      });
      
      this.auditLogger.log('error', 'Failed to initialize Outlook sync', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Microsoft sync initialization failed: ${error.message}`);
    }
  }

  /**
   * Perform bidirectional sync between PharmaDOC and Outlook
   * @param {string} userId - User ID
   */
  async performSync(userId) {
    console.log('🔵 [MICROSOFT-DEBUG] =================================');
    console.log('🔵 [MICROSOFT-DEBUG] STARTING MICROSOFT SYNC EXECUTION');
    console.log('🔵 [MICROSOFT-DEBUG] =================================');
    console.log('🔵 [MICROSOFT-DEBUG] performSync called for user:', userId);
    
    const syncState = this.syncStates.get(userId);
    if (!syncState) {
      console.error('❌ [MICROSOFT-DEBUG] No sync state found for user:', userId);
      console.error('❌ [MICROSOFT-DEBUG] Available sync states:', Array.from(this.syncStates.keys()));
      throw new Error('Sync not initialized for user - please run initializeSync first');
    }
    
    if (!syncState.isActive) {
      console.error('❌ [MICROSOFT-DEBUG] Sync is inactive for user:', userId);
      throw new Error('Sync is inactive for user');
    }

    console.log('🔵 [MICROSOFT-DEBUG] Sync state found:', {
      isActive: syncState.isActive,
      lastSync: syncState.lastSync,
      syncDirection: syncState.syncSettings?.syncDirection,
      calendarsCount: syncState.calendars?.length || 0,
      hasAccessToken: !!syncState.accessToken,
      syncStatsSnapshot: syncState.syncStats
    });

    try {
              await this.rateLimiter.checkRateLimit('microsoft', userId, 'sync');
      
      this.auditLogger.log('info', 'Starting Outlook sync', { userId });
      console.log('🔵 [MICROSOFT-DEBUG] Rate limit check passed, starting sync process...');

      const { syncSettings, lastSync, accessToken } = syncState;
      const syncStartTime = new Date();
      
      console.log('🔵 [MICROSOFT-DEBUG] Sync execution details:', {
        syncDirection: syncSettings.syncDirection,
        selectedCalendars: syncSettings.selectedCalendars,
        lastSync: lastSync,
        forceFull: syncSettings.forceFull,
        enableConflictResolution: syncSettings.enableConflictResolution,
        syncStartTime: syncStartTime.toISOString()
      });

      // Step 1: Get PharmaDOC appointments and Outlook events
      console.log('🔵 [MICROSOFT-DEBUG] Step 1: Fetching data from both systems...');
      let appointments = [];
      let outlookEvents = { events: [], deltaToken: null };
      
      try {
        console.log('🔵 [MICROSOFT-DEBUG] Fetching PharmaDOC appointments...');
        appointments = await this.getPharmaDOCAppointments(userId, lastSync);
        console.log('🔵 [MICROSOFT-DEBUG] PharmaDOC appointments fetched:', {
          count: appointments.length,
          sample: appointments.slice(0, 3).map(apt => ({
            id: apt.id,
            title: apt.title,
            startTime: apt.start_time,
            outlook_event_id: apt.outlook_event_id
          }))
        });
      } catch (aptError) {
        console.error('❌ [MICROSOFT-DEBUG] Failed to fetch PharmaDOC appointments:', aptError);
        throw new Error(`Failed to fetch PharmaDOC appointments: ${aptError.message}`);
      }
      
      try {
        console.log('🔵 [MICROSOFT-DEBUG] Fetching Outlook events...');
        outlookEvents = await this.getOutlookEvents(accessToken, {
          selectedCalendars: syncSettings.selectedCalendars,
          since: lastSync,
          deltaToken: syncState.lastDeltaToken,
          forceFull: syncSettings.forceFull
        });
        console.log('🔵 [MICROSOFT-DEBUG] Outlook events fetched:', {
          count: outlookEvents.events.length,
          hasDeltaToken: !!outlookEvents.deltaToken,
          sample: outlookEvents.events.slice(0, 3).map(event => ({
            id: event.id,
            subject: event.subject,
            start: event.start,
            organizer: event.organizer?.emailAddress?.address
          }))
        });
      } catch (eventsError) {
        console.error('❌ [MICROSOFT-DEBUG] Failed to fetch Outlook events:', eventsError);
        throw new Error(`Failed to fetch Outlook events: ${eventsError.message}`);
      }

      // Step 2: Perform sync based on direction
      console.log('🔵 [MICROSOFT-DEBUG] Step 2: Performing sync operations...');
      let syncResults = {
        pharmaToOutlook: { created: 0, updated: 0, deleted: 0, errors: [] },
        outlookToPharma: { created: 0, updated: 0, deleted: 0, errors: [] },
        conflicts: [],
        deltaToken: outlookEvents.deltaToken
      };

      // Sync PharmaDOC appointments to Outlook
      if (syncSettings.syncDirection === 'to-outlook' || syncSettings.syncDirection === 'bidirectional') {
        console.log('🔵 [MICROSOFT-DEBUG] Syncing PharmaDOC appointments to Outlook...');
        try {
          const pharmaToOutlookResults = await this.syncAppointmentsToOutlook(
            userId, 
            appointments, 
            accessToken, 
            syncSettings
          );
          syncResults.pharmaToOutlook = pharmaToOutlookResults;
          console.log('🔵 [MICROSOFT-DEBUG] PharmaDOC to Outlook sync completed:', pharmaToOutlookResults);
        } catch (pharmaToOutlookError) {
          console.error('❌ [MICROSOFT-DEBUG] PharmaDOC to Outlook sync failed:', pharmaToOutlookError);
          syncResults.pharmaToOutlook.errors.push(pharmaToOutlookError.message);
        }
      }

      // Sync Outlook events to PharmaDOC
      if (syncSettings.syncDirection === 'from-outlook' || syncSettings.syncDirection === 'bidirectional') {
        console.log('🔵 [MICROSOFT-DEBUG] Syncing Outlook events to PharmaDOC...');
        try {
          const outlookToPharmaResults = await this.syncEventsFromOutlook(
            userId, 
            outlookEvents.events, 
            syncSettings
          );
          syncResults.outlookToPharma = outlookToPharmaResults;
          console.log('🔵 [MICROSOFT-DEBUG] Outlook to PharmaDOC sync completed:', outlookToPharmaResults);
        } catch (outlookToPharmaError) {
          console.error('❌ [MICROSOFT-DEBUG] Outlook to PharmaDOC sync failed:', outlookToPharmaError);
          syncResults.outlookToPharma.errors.push(outlookToPharmaError.message);
        }
      }

      // Step 3: Update sync state
      console.log('🔵 [MICROSOFT-DEBUG] Step 3: Updating sync state...');
      syncState.lastSync = syncStartTime.toISOString();
      if (outlookEvents.deltaToken) {
        syncState.lastDeltaToken = outlookEvents.deltaToken;
        console.log('🔵 [MICROSOFT-DEBUG] Delta token updated:', outlookEvents.deltaToken.substring(0, 50) + '...');
      }
      
      // Update sync statistics
      syncState.syncStats.appointmentsToOutlook += syncResults.pharmaToOutlook.created + syncResults.pharmaToOutlook.updated;
      syncState.syncStats.appointmentsFromOutlook += syncResults.outlookToPharma.created + syncResults.outlookToPharma.updated;
      syncState.syncStats.errors += syncResults.pharmaToOutlook.errors.length + syncResults.outlookToPharma.errors.length;

      const syncEndTime = new Date();
      const syncDuration = syncEndTime.getTime() - syncStartTime.getTime();
      
      console.log('🔵 [MICROSOFT-DEBUG] =================================');
      console.log('🔵 [MICROSOFT-DEBUG] MICROSOFT SYNC EXECUTION COMPLETED');
      console.log('🔵 [MICROSOFT-DEBUG] =================================');
      console.log('🔵 [MICROSOFT-DEBUG] Final sync results:', {
        duration: `${syncDuration}ms`,
        pharmaToOutlook: syncResults.pharmaToOutlook,
        outlookToPharma: syncResults.outlookToPharma,
        totalErrors: syncResults.pharmaToOutlook.errors.length + syncResults.outlookToPharma.errors.length,
        updatedStats: syncState.syncStats
      });

      this.auditLogger.log('info', 'Outlook sync completed successfully', {
        userId,
        duration: syncDuration,
        results: syncResults,
        syncStats: syncState.syncStats
      });

      return {
        success: true,
        duration: syncDuration,
        results: syncResults,
        lastSync: syncState.lastSync,
        syncStats: syncState.syncStats
      };
    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] =================================');
      console.error('❌ [MICROSOFT-DEBUG] MICROSOFT SYNC EXECUTION FAILED');
      console.error('❌ [MICROSOFT-DEBUG] =================================');
      console.error('❌ [MICROSOFT-DEBUG] Sync error details:', {
        message: error.message,
        stack: error.stack,
        userId: userId,
        syncState: syncState ? {
          isActive: syncState.isActive,
          lastSync: syncState.lastSync,
          syncDirection: syncState.syncSettings?.syncDirection
        } : 'null'
      });

      // Update sync state with error
      if (syncState) {
        syncState.syncErrors.push({
          timestamp: new Date().toISOString(),
          error: error.message,
          stack: error.stack
        });
        syncState.syncStats.errors++;
      }

      this.auditLogger.log('error', 'Outlook sync failed', {
        userId,
        error: error.message,
        stack: error.stack
      });

      throw new Error(`Microsoft sync failed: ${error.message}`);
    }
  }

  /**
   * Get user's Outlook calendars
   * @param {string} accessToken - Microsoft access token
   * @returns {Array} List of calendars
   */
  async getCalendars(accessToken) {
    console.log('🔵 [MICROSOFT-DEBUG] getCalendars called');
    try {
              await this.rateLimiter.checkRateLimit('microsoft', null, 'get_calendars');
      
      console.log('🔵 [MICROSOFT-DEBUG] Making request to Microsoft Graph API for calendars...');
      const response = await fetch(`${this.graphUrl}/me/calendars`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      console.log('🔵 [MICROSOFT-DEBUG] Calendar API response status:', response.status);
      
      if (!response.ok) {
        console.error('❌ [MICROSOFT-DEBUG] Calendar API request failed:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url
        });
        
        // Try to get error details
        let errorDetails = 'Unknown error';
        try {
          const errorBody = await response.text();
          console.error('❌ [MICROSOFT-DEBUG] Calendar API error body:', errorBody);
          errorDetails = errorBody;
        } catch (parseError) {
          console.error('❌ [MICROSOFT-DEBUG] Could not parse error response:', parseError);
        }
        
        await this.oauthProvider.handleApiError(response, 'Get calendars');
      }

      const data = await response.json();
      console.log('🔵 [MICROSOFT-DEBUG] Calendar API response data:', {
        calendarCount: data.value?.length || 0,
        hasNextLink: !!data['@odata.nextLink']
      });

      const calendars = data.value.map(calendar => {
        console.log('🔵 [MICROSOFT-DEBUG] Processing calendar:', {
          id: calendar.id,
          name: calendar.name,
          isDefaultCalendar: calendar.isDefaultCalendar,
          canEdit: calendar.canEdit,
          owner: calendar.owner?.name
        });

        return {
          id: calendar.id,
          name: calendar.name,
          isDefaultCalendar: calendar.isDefaultCalendar || false,
          canEdit: calendar.canEdit !== false, // Default to true if not specified
          color: calendar.color,
          owner: calendar.owner,
          isRemovable: calendar.isRemovable,
          canShare: calendar.canShare,
          canViewPrivateItems: calendar.canViewPrivateItems
        };
      });

      console.log('🔵 [MICROSOFT-DEBUG] Successfully processed calendars:', {
        totalCount: calendars.length,
        defaultCalendar: calendars.find(cal => cal.isDefaultCalendar)?.name || 'Not found',
        editableCount: calendars.filter(cal => cal.canEdit).length
      });

      this.auditLogger.log('info', 'Retrieved Outlook calendars', {
        count: calendars.length,
        defaultFound: calendars.some(cal => cal.isDefaultCalendar)
      });

      return calendars;
    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] Failed to get calendars:', {
        error: error.message,
        stack: error.stack
      });
      
      this.auditLogger.log('error', 'Failed to get Outlook calendars', {
        error: error.message
      });
      throw new Error(`Failed to retrieve Outlook calendars: ${error.message}`);
    }
  }

  /**
   * Get Outlook calendar events
   * @param {string} accessToken - Microsoft access token
   * @param {Object} options - Query options
   * @returns {Object} Events data with delta token
   */
  async getOutlookEvents(accessToken, options = {}) {
    console.log('🔵 [MICROSOFT-DEBUG] getOutlookEvents called with options:', options);
    
    try {
              await this.rateLimiter.checkRateLimit('microsoft', null, 'get_events');
      
      const {
        selectedCalendars = ['primary'],
        since = null,
        deltaToken = null,
        timeMin = new Date().toISOString(),
        timeMax = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString(), // 30 days
        maxResults = 250,
        forceFull = false
      } = options;

      console.log('🔵 [MICROSOFT-DEBUG] Parsed getOutlookEvents options:', {
        selectedCalendars,
        since,
        hasDeltaToken: !!deltaToken,
        timeMin,
        timeMax,
        maxResults,
        forceFull
      });

      let allEvents = [];
      let finalDeltaToken = null;

      // Process each selected calendar
      for (const calendarId of selectedCalendars) {
        console.log('🔵 [MICROSOFT-DEBUG] Processing calendar:', calendarId);
        
        try {
          let calendarEvents = [];
          let nextLink = null;
          
          // Build initial query URL
          const calendar = calendarId === 'primary' ? 'me/calendar' : `me/calendars/${calendarId}`;
          let queryUrl = `${this.graphUrl}/${calendar}/events`;
          
          // Use delta query if we have a delta token and not forcing full sync
          if (deltaToken && !forceFull) {
            console.log('🔵 [MICROSOFT-DEBUG] Using delta query for incremental sync');
            queryUrl = `${this.graphUrl}/${calendar}/events/delta`;
            const deltaParams = new URLSearchParams({
              '$deltatoken': deltaToken,
              '$top': maxResults.toString()
            });
            queryUrl += `?${deltaParams.toString()}`;
          } else {
            console.log('🔵 [MICROSOFT-DEBUG] Using full query for complete sync');
            const params = new URLSearchParams({
              '$select': 'id,subject,start,end,location,attendees,organizer,body,webLink,isOnlineMeeting,onlineMeetingUrl,categories,importance,sensitivity,showAs,responseStatus,lastModifiedDateTime,createdDateTime',
              '$orderby': 'start/dateTime',
              '$top': maxResults.toString()
            });
            
            if (since) {
              params.append('$filter', `lastModifiedDateTime ge ${since}`);
            } else {
              params.append('$filter', `start/dateTime ge '${timeMin}' and start/dateTime le '${timeMax}'`);
            }
            
            queryUrl += `?${params.toString()}`;
          }
          
          console.log('🔵 [MICROSOFT-DEBUG] Initial query URL constructed:', queryUrl.substring(0, 150) + '...');

          // Fetch events with pagination
          do {
            console.log('🔵 [MICROSOFT-DEBUG] Making request to:', nextLink || 'initial URL');
            
            const response = await fetch(nextLink || queryUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Prefer': 'outlook.timezone="UTC"'
              }
            });

            console.log('🔵 [MICROSOFT-DEBUG] Events API response status:', response.status);

            if (!response.ok) {
              console.error('❌ [MICROSOFT-DEBUG] Events API request failed:', {
                status: response.status,
                statusText: response.statusText,
                url: response.url
              });
              
              // Try to get error details
              let errorDetails = 'Unknown error';
              try {
                const errorBody = await response.text();
                console.error('❌ [MICROSOFT-DEBUG] Events API error body:', errorBody);
                errorDetails = errorBody;
              } catch (parseError) {
                console.error('❌ [MICROSOFT-DEBUG] Could not parse error response:', parseError);
              }
              
              await this.oauthProvider.handleApiError(response, 'Get calendar events');
            }

            const data = await response.json();
            console.log('🔵 [MICROSOFT-DEBUG] Events API response data:', {
              eventsCount: data.value?.length || 0,
              hasNextLink: !!data['@odata.nextLink'],
              hasDeltaLink: !!data['@odata.deltaLink'],
              calendar: calendarId
            });

            if (data.value) {
              calendarEvents = calendarEvents.concat(data.value);
              console.log('🔵 [MICROSOFT-DEBUG] Added events to collection. Total for this calendar:', calendarEvents.length);
            }

            // Get next page link or delta link
            nextLink = data['@odata.nextLink'];
            if (data['@odata.deltaLink']) {
              // Extract delta token from delta link
              const deltaUrl = new URL(data['@odata.deltaLink']);
              finalDeltaToken = deltaUrl.searchParams.get('$deltatoken');
              console.log('🔵 [MICROSOFT-DEBUG] Extracted delta token:', finalDeltaToken ? finalDeltaToken.substring(0, 50) + '...' : 'null');
            }

          } while (nextLink);

          console.log('🔵 [MICROSOFT-DEBUG] Completed fetching events for calendar:', {
            calendarId,
            eventsCount: calendarEvents.length,
            finalDeltaToken: !!finalDeltaToken
          });

          // Process and filter events
          const processedEvents = calendarEvents
            .filter(event => {
              // Filter out cancelled events
              if (event.isCancelled) {
                console.log('🔵 [MICROSOFT-DEBUG] Skipping cancelled event:', event.id);
                return false;
              }
              return true;
            })
            .map(event => {
              console.log('🔵 [MICROSOFT-DEBUG] Processing event:', {
                id: event.id,
                subject: event.subject,
                start: event.start?.dateTime,
                organizer: event.organizer?.emailAddress?.address,
                isOnlineMeeting: event.isOnlineMeeting
              });

              return {
                ...event,
                calendarId: calendarId,
                sourceCalendar: calendarId
              };
            });

          allEvents = allEvents.concat(processedEvents);
          console.log('🔵 [MICROSOFT-DEBUG] Calendar processing complete. Total events so far:', allEvents.length);

        } catch (calendarError) {
          console.error('❌ [MICROSOFT-DEBUG] Failed to fetch events from calendar:', {
            calendarId,
            error: calendarError.message,
            stack: calendarError.stack
          });
          
          this.auditLogger.log('error', 'Failed to fetch events from calendar', {
            calendarId,
            error: calendarError.message
          });
          
          // Continue with other calendars even if one fails
          continue;
        }
      }

      console.log('🔵 [MICROSOFT-DEBUG] Final getOutlookEvents results:', {
        totalEvents: allEvents.length,
        calendarsProcessed: selectedCalendars.length,
        hasFinalDeltaToken: !!finalDeltaToken,
        eventSample: allEvents.slice(0, 3).map(event => ({
          id: event.id,
          subject: event.subject,
          start: event.start?.dateTime,
          calendarId: event.calendarId
        }))
      });

      this.auditLogger.log('info', 'Retrieved Outlook events', {
        eventsCount: allEvents.length,
        calendarsCount: selectedCalendars.length,
        usedDeltaToken: !!deltaToken,
        gotNewDeltaToken: !!finalDeltaToken
      });

      return {
        events: allEvents,
        deltaToken: finalDeltaToken || deltaToken, // Return new token or keep old one
        calendars: selectedCalendars
      };

    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] Failed to get Outlook events:', {
        error: error.message,
        stack: error.stack,
        options: options
      });
      
      this.auditLogger.log('error', 'Failed to get Outlook events', {
        error: error.message,
        options: options
      });
      
      throw new Error(`Failed to retrieve Outlook events: ${error.message}`);
    }
  }

  /**
   * Create or update Outlook calendar event
   * @param {string} accessToken - Microsoft access token
   * @param {Object} appointment - PharmaDOC appointment
   * @param {string} calendarId - Target calendar ID
   * @param {Object} options - Creation options
   * @returns {Object} Created/updated event
   */
  async createOrUpdateOutlookEvent(accessToken, appointment, calendarId = 'primary', options = {}) {
    try {
      console.log('🔵 [MICROSOFT-DEBUG] createOrUpdateOutlookEvent called:', {
        appointmentId: appointment.id,
        calendarId,
        hasOutlookEventId: !!appointment.outlookEventId,
        videoProvider: appointment.video_provider,
        options
      });
      
      await this.rateLimiter.checkRateLimit('microsoft', null, 'create_event');

      let outlookEvent;

      // Check if this should include Teams meeting creation (matching Google Meet pattern)
      if (appointment.video_provider === 'microsoft_teams' || options.includeTeamsMeeting) {
        console.log('🎥 [MICROSOFT-DEBUG] Creating Outlook event with Teams meeting...', {
          appointmentId: appointment.id,
          videoProvider: appointment.video_provider,
          includeTeamsMeeting: options.includeTeamsMeeting,
          hasTeamsService: !!this.teamsService
        });
        
        // Step 1: Create Teams meeting first (like Google Meet does)
        const meetingData = {
          subject: `PharmaDOC: ${appointment.title}`,
          startTime: `${appointment.timeslot_date}T${appointment.start_time}`,
          endTime: `${appointment.timeslot_date}T${appointment.end_time}`,
          timezone: options.timeZone || 'UTC',
          attendees: [
            ...(appointment.doctor_email ? [{ email: appointment.doctor_email, role: 'attendee' }] : []),
            ...(appointment.pharma_rep_email ? [{ email: appointment.pharma_rep_email, role: 'attendee' }] : [])
          ].filter(Boolean),
          allowedPresenters: appointment.integration_data?.teams?.allowed_presenters || 'everyone',
          recordAutomatically: appointment.integration_data?.teams?.record_automatically || false,
          allowTeamsMeetingOptions: {
            allowAnonymous: appointment.integration_data?.teams?.allow_anonymous !== false,
            allowPSTN: appointment.integration_data?.teams?.allow_pstn !== false
          },
          lobbyBypassSettings: {
            scope: appointment.integration_data?.teams?.lobby_bypass_scope || 'organization',
            isDialInBypassEnabled: appointment.integration_data?.teams?.dial_in_bypass || false
          }
        };

        console.log('📊 [MICROSOFT-DEBUG] Teams meeting data:', {
          subject: meetingData.subject,
          attendees: meetingData.attendees.length,
          timeZone: meetingData.timezone
        });

        // Create the Teams meeting 
        console.log('🔵 [MICROSOFT-DEBUG] About to call teamsService.createMeeting with:', {
          hasAccessToken: !!accessToken,
          accessTokenLength: accessToken ? accessToken.length : 0,
          meetingDataKeys: Object.keys(meetingData),
          teamsServiceType: typeof this.teamsService
        });

        let meetingResult;
        try {
          meetingResult = await this.teamsService.createMeeting(accessToken, meetingData);
          console.log('📹 [MICROSOFT-DEBUG] Teams meeting creation result:', {
            success: meetingResult?.success,
            meetingId: meetingResult?.meeting?.id,
            joinUrl: meetingResult?.meeting?.joinUrl ? meetingResult.meeting.joinUrl.substring(0, 60) + '...' : null,
            fullResultKeys: Object.keys(meetingResult || {})
          });
        } catch (teamsError) {
          console.error('❌ [MICROSOFT-DEBUG] Teams meeting creation failed:', {
            error: teamsError.message,
            stack: teamsError.stack,
            accessTokenValid: !!accessToken && accessToken.length > 0
          });
          // Continue without Teams meeting if creation fails
          meetingResult = { success: false, error: teamsError.message };
        }

        // Step 2: Create calendar event with Teams meeting link embedded (like Google Meet)
        console.log('🔵 [MICROSOFT-DEBUG] Preparing event data with Teams integration...', {
          hasJoinUrl: !!meetingResult?.meeting?.joinUrl,
          joinUrlPreview: meetingResult?.meeting?.joinUrl ? meetingResult.meeting.joinUrl.substring(0, 40) + '...' : null
        });

        const eventData = await this.mapAppointmentToOutlookEvent(appointment, {
          ...options,
          teamsJoinUrl: meetingResult?.meeting?.joinUrl // Pass Teams link to event mapping
        });
        
        console.log('🔵 [MICROSOFT-DEBUG] Event data prepared:', {
          subject: eventData.subject,
          hasTeamsInBody: eventData.body.content.includes('teams.microsoft.com'),
          bodyLength: eventData.body.content.length,
          isOnlineMeeting: eventData.isOnlineMeeting
        });
        
        console.log('🔵 [MICROSOFT-DEBUG] Creating calendar event with embedded Teams link...');
        
        const apiPath = calendarId === 'primary' ? '/me/calendar/events' : `/me/calendars/${calendarId}/events`;
        let response;
        
        if (appointment.outlookEventId) {
          // Update existing event
          const updateUrl = `${this.graphUrl}${apiPath}/${appointment.outlookEventId}`;
          response = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
          });
        } else {
          // Create new event
          const createUrl = `${this.graphUrl}${apiPath}`;
          response = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
          });
        }

        if (!response.ok) {
          console.error('❌ [MICROSOFT-DEBUG] Event create/update failed:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('❌ [MICROSOFT-DEBUG] Error response body:', errorText);
          await this.oauthProvider.handleApiError(response, 'Create/Update event');
        }

        outlookEvent = await response.json();
        console.log('✅ [MICROSOFT-DEBUG] Calendar event created with Teams link');

        // Step 3: Update appointment with Teams meeting link (like Google Meet does)
        console.log('🔗 [MICROSOFT-DEBUG] Checking Teams meeting link update...', {
          hasJoinUrl: !!meetingResult?.meeting?.joinUrl,
          joinUrlLength: meetingResult?.meeting?.joinUrl?.length || 0,
          appointmentId: appointment.id,
          outlookEventId: outlookEvent?.id
        });

        if (meetingResult?.meeting?.joinUrl) {
          console.log('🔗 [MICROSOFT-DEBUG] Updating appointment with Teams link:', {
            appointmentId: appointment.id,
            joinUrlPreview: meetingResult.meeting.joinUrl.substring(0, 50) + '...'
          });
          
          try {
            await this.updateAppointmentMeetingLink(appointment.id, meetingResult.meeting.joinUrl);
            console.log('✅ [MICROSOFT-DEBUG] Teams meeting link updated successfully in database');
            
            this.auditLogger.log('info', 'TEAMS_MEETING_CREATED', {
              appointmentId: appointment.id,
              meetingUrl: meetingResult.meeting.joinUrl,
              eventId: outlookEvent.id
            });
          } catch (linkUpdateError) {
            console.error('❌ [MICROSOFT-DEBUG] Failed to update appointment with Teams link:', {
              error: linkUpdateError.message,
              appointmentId: appointment.id
            });
          }
        } else {
          console.warn('⚠️ [MICROSOFT-DEBUG] No Teams meeting link in result:', {
            meetingResultKeys: Object.keys(meetingResult || {}),
            meetingKeys: Object.keys(meetingResult?.meeting || {}),
            hasSuccess: meetingResult?.success
          });
        }
      } else {
        console.log('📅 [MICROSOFT-DEBUG] Creating regular Outlook event (no Teams meeting)');
        
        // Create regular calendar event without Teams meeting
        const eventData = await this.mapAppointmentToOutlookEvent(appointment, options);
        console.log('🔵 [MICROSOFT-DEBUG] Mapped event data:', JSON.stringify(eventData, null, 2));
        
        const apiPath = calendarId === 'primary' ? '/me/calendar/events' : `/me/calendars/${calendarId}/events`;
        console.log('🔵 [MICROSOFT-DEBUG] API path:', apiPath);
        
        let response;
        
        if (appointment.outlookEventId) {
          // Update existing event
          const updatePath = `${apiPath}/${appointment.outlookEventId}`;
          const updateUrl = `${this.graphUrl}${updatePath}`;
          console.log('🔵 [MICROSOFT-DEBUG] Updating existing event at:', updateUrl);
          
          response = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
          });
          console.log('🔵 [MICROSOFT-DEBUG] Update response status:', response.status);
        } else {
          // Create new event
          const createUrl = `${this.graphUrl}${apiPath}`;
          console.log('🔵 [MICROSOFT-DEBUG] Creating new event at:', createUrl);
          
          response = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
          });
          console.log('🔵 [MICROSOFT-DEBUG] Create response status:', response.status);
        }

        if (!response.ok) {
          console.error('❌ [MICROSOFT-DEBUG] Event create/update failed:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('❌ [MICROSOFT-DEBUG] Error response body:', errorText);
          await this.oauthProvider.handleApiError(response, 'Create/Update event');
        }

        outlookEvent = await response.json();
        console.log('✅ [MICROSOFT-DEBUG] Regular event created:', outlookEvent.id);
      }

      console.log('🎉 [MICROSOFT-DEBUG] Final Outlook Event:', {
        id: outlookEvent.id,
        subject: outlookEvent.subject,
        onlineMeeting: outlookEvent.onlineMeeting ? 'Present' : 'None',
        isOnlineMeeting: outlookEvent.isOnlineMeeting,
        webLink: outlookEvent.webLink
      });

      this.auditLogger.log('info', 'Outlook event created/updated', {
        appointmentId: appointment.id,
        eventId: outlookEvent.id,
        action: appointment.outlookEventId ? 'updated' : 'created',
        hasTeamsMeeting: !!outlookEvent.onlineMeeting
      });

      console.log('✅ [MICROSOFT-DEBUG] createOrUpdateOutlookEvent completed successfully for appointment:', appointment.id);
      return outlookEvent;
    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] Error creating calendar event for appointment:', {
        appointmentId: appointment.id,
        videoProvider: appointment.video_provider,
        error: error.message
      });
      this.auditLogger.log('error', 'Failed to create/update Outlook event', {
        appointmentId: appointment.id,
        error: error.message,
        videoProvider: appointment.video_provider
      });
      throw error;
    }
  }

  /**
   * Delete Outlook calendar event
   * @param {string} accessToken - Microsoft access token
   * @param {string} eventId - Event ID to delete
   * @param {string} calendarId - Calendar ID
   */
  async deleteOutlookEvent(accessToken, eventId, calendarId = 'primary') {
    try {
      await this.rateLimiter.checkRateLimit('microsoft', null, 'delete_event');

      const apiPath = calendarId === 'primary' ? '/me/calendar/events' : `/me/calendars/${calendarId}/events`;
      
      const response = await fetch(`${this.graphUrl}${apiPath}/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok && response.status !== 404) {
        await this.oauthProvider.handleApiError(response, 'Delete event');
      }

      this.auditLogger.log('info', 'Outlook event deleted', { eventId });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to delete Outlook event', {
        eventId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync PharmaDOC appointments to Outlook
   * @param {string} userId - User ID
   * @param {Array} appointments - PharmaDOC appointments
   * @param {string} accessToken - Microsoft access token
   * @param {Object} syncSettings - Sync configuration
   * @returns {Object} Sync results
   */
  async syncAppointmentsToOutlook(userId, appointments, accessToken, syncSettings) {
    console.log('🔵 [MICROSOFT-DEBUG] syncAppointmentsToOutlook called:', {
      userId,
      appointmentsCount: appointments.length,
      syncSettings: syncSettings
    });
    
    const results = {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
      conflicts: []
    };

    if (!appointments || appointments.length === 0) {
      console.log('🔵 [MICROSOFT-DEBUG] No appointments to sync to Outlook');
      return results;
    }

    console.log('🔵 [MICROSOFT-DEBUG] Processing appointments for Outlook sync:', {
      total: appointments.length,
      withOutlookId: appointments.filter(apt => apt.outlook_event_id).length,
      withoutOutlookId: appointments.filter(apt => !apt.outlook_event_id).length
    });

    for (const appointment of appointments) {
      try {
        console.log('🔵 [MICROSOFT-DEBUG] Processing appointment:', {
          id: appointment.id,
          title: appointment.title,
          start_time: appointment.start_time,
          outlook_event_id: appointment.outlook_event_id,
          status: appointment.status
        });

        // Check if appointment is cancelled/deleted
        if (appointment.status === 'cancelled' || appointment.status === 'deleted') {
          console.log('🔵 [MICROSOFT-DEBUG] Appointment is cancelled/deleted, checking if needs deletion in Outlook');
          
          if (appointment.outlook_event_id) {
            try {
              await this.deleteOutlookEvent(accessToken, appointment.outlook_event_id);
              console.log('🔵 [MICROSOFT-DEBUG] Successfully deleted Outlook event:', appointment.outlook_event_id);
              results.deleted++;
            } catch (deleteError) {
              console.error('❌ [MICROSOFT-DEBUG] Failed to delete Outlook event:', {
                appointmentId: appointment.id,
                outlookEventId: appointment.outlook_event_id,
                error: deleteError.message
              });
              results.errors.push({
                appointmentId: appointment.id,
                operation: 'delete',
                error: deleteError.message
              });
            }
          }
          continue;
        }

        // Convert PharmaDOC appointment to Outlook event format
        console.log('🔵 [MICROSOFT-DEBUG] Mapping appointment to Outlook event format...', {
          appointmentId: appointment.id,
          meetingType: appointment.meeting_type,
          videoProvider: appointment.video_provider,
          includeTeamsMeetings: syncSettings.includeTeamsMeetings,
          shouldCreateTeams: appointment.video_provider === 'microsoft_teams' || syncSettings.includeTeamsMeetings
        });
        
        const outlookEvent = await this.mapAppointmentToOutlookEvent(appointment, {
          includeTeamsMeeting: syncSettings.includeTeamsMeetings,
          timeZone: syncSettings.timeZone || 'UTC'
        });
        
        console.log('🔵 [MICROSOFT-DEBUG] Mapped Outlook event:', {
          subject: outlookEvent.subject,
          start: outlookEvent.start,
          end: outlookEvent.end,
          hasOnlineMeeting: !!outlookEvent.isOnlineMeeting,
          attendees: outlookEvent.attendees?.length || 0
        });

        // Determine calendar to use (default or specific)
        const targetCalendarId = syncSettings.selectedCalendars?.[0] || 'primary';
        console.log('🔵 [MICROSOFT-DEBUG] Target calendar for sync:', targetCalendarId);

        if (appointment.outlook_event_id) {
          // Update existing event
          console.log('🔵 [MICROSOFT-DEBUG] Updating existing Outlook event:', appointment.outlook_event_id);
          
          try {
            const updatedEvent = await this.createOrUpdateOutlookEvent(
              accessToken,
              appointment,
              targetCalendarId,
              { 
                eventId: appointment.outlook_event_id,
                operation: 'update'
              }
            );
            
            console.log('🔵 [MICROSOFT-DEBUG] Successfully updated Outlook event:', {
              eventId: updatedEvent.id,
              subject: updatedEvent.subject
            });
            
            results.updated++;
          } catch (updateError) {
            console.error('❌ [MICROSOFT-DEBUG] Failed to update Outlook event:', {
              appointmentId: appointment.id,
              outlookEventId: appointment.outlook_event_id,
              error: updateError.message
            });
            
            results.errors.push({
              appointmentId: appointment.id,
              operation: 'update',
              error: updateError.message
            });
          }
        } else {
          // Create new event
          console.log('🔵 [MICROSOFT-DEBUG] Creating new Outlook event for appointment:', appointment.id);
          
          try {
            const createdEvent = await this.createOrUpdateOutlookEvent(
              accessToken,
              appointment,
              targetCalendarId,
              { 
                operation: 'create'
              }
            );
            
            console.log('🔵 [MICROSOFT-DEBUG] Successfully created Outlook event:', {
              eventId: createdEvent.id,
              subject: createdEvent.subject,
              webLink: createdEvent.webLink
            });
            
            // Update PharmaDOC appointment with Outlook event ID
            await this.updateAppointmentOutlookId(appointment.id, createdEvent.id);
            console.log('🔵 [MICROSOFT-DEBUG] Updated PharmaDOC appointment with Outlook event ID');
            
            results.created++;
          } catch (createError) {
            console.error('❌ [MICROSOFT-DEBUG] Failed to create Outlook event:', {
              appointmentId: appointment.id,
              error: createError.message
            });
            
            results.errors.push({
              appointmentId: appointment.id,
              operation: 'create',
              error: createError.message
            });
          }
        }

      } catch (appointmentError) {
        console.error('❌ [MICROSOFT-DEBUG] Failed to process appointment:', {
          appointmentId: appointment.id,
          error: appointmentError.message,
          stack: appointmentError.stack
        });
        
        results.errors.push({
          appointmentId: appointment.id,
          operation: 'process',
          error: appointmentError.message
        });
      }
    }

    console.log('🔵 [MICROSOFT-DEBUG] syncAppointmentsToOutlook completed:', {
      processed: appointments.length,
      created: results.created,
      updated: results.updated,
      deleted: results.deleted,
      errors: results.errors.length,
      conflicts: results.conflicts.length
    });

    this.auditLogger.log('info', 'Completed syncing appointments to Outlook', {
      userId,
      totalProcessed: appointments.length,
      results: results
    });

    return results;
  }

  /**
   * Sync Outlook events to PharmaDOC appointments
   * @param {string} userId - User ID
   * @param {Array} events - Outlook events
   * @param {Object} syncSettings - Sync configuration
   * @returns {Object} Sync results
   */
  async syncEventsFromOutlook(userId, events, syncSettings) {
    const results = {
      synced: 0,
      conflicts: [],
      errors: []
    };

    for (const event of events) {
      try {
        // Skip events that are already managed by PharmaDOC
        if (event.categories && event.categories.includes('PharmaDOC')) {
          continue;
        }

        // Check for conflicts with existing appointments
        if (syncSettings.enableConflictResolution) {
          const conflicts = await this.checkPharmaDOCConflicts(userId, event);
          if (conflicts.length > 0) {
            results.conflicts.push({
              event,
              conflicts,
              type: 'outlook_to_appointment'
            });
            continue;
          }
        }

        // Create or update PharmaDOC appointment
        const appointment = await this.createOrUpdatePharmaDOCAppointment(userId, event);

        results.synced++;
      } catch (error) {
        results.errors.push({
          eventId: event.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Map PharmaDOC appointment to Outlook event format
   * @param {Object} appointment - PharmaDOC appointment
   * @param {Object} options - Mapping options
   * @returns {Object} Outlook event data
   */
  async mapAppointmentToOutlookEvent(appointment, options = {}) {
    const {
      includeTeamsMeeting = false,
      includeAttendees = true,
      teamsJoinUrl = null
    } = options;

    // Convert times to UTC for Microsoft Graph
    // Construct proper datetime strings from appointment data
    const startDateTimeString = `${appointment.timeslot_date}T${appointment.start_time}`;
    const endDateTimeString = `${appointment.timeslot_date}T${appointment.end_time}`;
    
    // Convert to UTC using the available convertTimezone method
    const startConversion = await this.timezoneService.convertTimezone(
      startDateTimeString,
      appointment.timezone || 'UTC',
      'UTC'
    );
    const endConversion = await this.timezoneService.convertTimezone(
      endDateTimeString,
      appointment.timezone || 'UTC',
      'UTC'
    );
    
    const startDateTime = new Date(startConversion.converted.datetime);
    const endDateTime = new Date(endConversion.converted.datetime);

    const eventData = {
      subject: `PharmaDOC: ${appointment.title}`,
      body: {
        contentType: 'text',
        content: this.buildEventDescription(appointment, { teamsJoinUrl })
      },
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'UTC'
      },
      location: {
        displayName: appointment.meeting_type === 'in-person' ? 'In-Person Meeting' : appointment.location || ''
      },
      categories: ['PharmaDOC'],
      showAs: 'busy',
      sensitivity: 'normal'
    };

    // Add attendees from appointment data (doctor and pharma rep)
    if (includeAttendees) {
      const attendees = [];
      
      // Add doctor if available
      if (appointment.doctor_email) {
        attendees.push({
          emailAddress: {
            address: appointment.doctor_email,
            name: appointment.doctor_name || 'Doctor'
          },
          type: 'required'
        });
      }
      
      // Add pharma rep if available
      if (appointment.pharma_rep_email) {
        attendees.push({
          emailAddress: {
            address: appointment.pharma_rep_email,
            name: appointment.pharma_rep_name || 'Pharma Rep'
          },
          type: 'required'
        });
      }
      
      // Add any additional attendees from appointment.attendees
      if (appointment.attendees && Array.isArray(appointment.attendees)) {
        appointment.attendees.forEach(attendee => {
          attendees.push({
            emailAddress: {
              address: attendee.email,
              name: attendee.name
            },
            type: attendee.type || 'optional'
          });
        });
      }
      
      if (attendees.length > 0) {
        eventData.attendees = attendees;
      }
    }

    // Add Teams meeting if requested or if appointment is virtual
    if (includeTeamsMeeting || appointment.meeting_type === 'virtual' && appointment.video_provider === 'microsoft_teams') {
      eventData.isOnlineMeeting = true;
      eventData.onlineMeetingProvider = 'teamsForBusiness';
      
      // Add meeting details to body if not already present
      if (!appointment.meeting_link && !eventData.body.content.includes('Teams Meeting will be generated')) {
        eventData.body.content += '\n\nTeams Meeting will be generated automatically by Outlook.';
      }
    }

    // Add custom properties for sync tracking
    eventData.transactionId = `pharmadoc-${appointment.id}`;

    return eventData;
  }

  /**
   * Build event description from appointment data (matching Google Calendar format)
   * @param {Object} appointment - Appointment data
   * @param {Object} options - Options including Teams join URL
   * @returns {string} Event description
   */
  buildEventDescription(appointment, options = {}) {
    const { teamsJoinUrl } = options;
    
    let description = `PharmaDOC Appointment\n\n`;
    description += `Purpose: ${appointment.title}\n`;
    
    if (appointment.duration) {
      description += `Duration: ${appointment.duration} minutes\n`;
    } else if (appointment.start_time && appointment.end_time) {
      // Calculate duration from start and end times
      const start = new Date(`2000-01-01T${appointment.start_time}`);
      const end = new Date(`2000-01-01T${appointment.end_time}`);
      const durationMinutes = (end - start) / (1000 * 60);
      description += `Duration: ${durationMinutes} minutes\n`;
    }
    
    description += `Meeting Type: ${appointment.meeting_type || 'virtual'}\n\n`;
    
    // Add participant information
    if (appointment.doctor_name && appointment.doctor_email) {
      description += `Doctor: ${appointment.doctor_name} (${appointment.doctor_email})\n`;
    }
    
    if (appointment.pharma_rep_name && appointment.pharma_rep_email) {
      description += `Pharma Rep: ${appointment.pharma_rep_name} (${appointment.pharma_rep_email})\n`;
    }
    
    // Add Teams meeting link if provided (prioritize over stored meeting_link)
    if (teamsJoinUrl) {
      description += `\n🎥 Microsoft Teams Meeting\n`;
      description += `Join URL: ${teamsJoinUrl}\n`;
    } else if (appointment.meeting_link) {
      description += `\nMeeting Link: ${appointment.meeting_link}`;
    }
    
    // Add notes if available
    if (appointment.notes) {
      description += `\nNotes: ${appointment.notes}`;
    }

    return description;
  }

  /**
   * Map Outlook event to PharmaDOC appointment format
   * @param {Object} event - Outlook event
   * @param {string} calendarId - Source calendar ID
   * @returns {Object} PharmaDOC appointment data
   */
  mapOutlookEventToAppointment(event, calendarId) {
    return {
      id: null, // Will be assigned when created
      outlookEventId: event.id,
      calendarId,
      title: event.subject,
      description: event.body?.content || '',
      startTime: new Date(event.start.dateTime),
      endTime: new Date(event.end.dateTime),
      timezone: event.start.timeZone || 'UTC',
      location: event.location?.displayName || '',
      status: this.mapOutlookStatusToPharmaDOC(event.showAs),
      attendees: (event.attendees || []).map(attendee => ({
        email: attendee.emailAddress.address,
        name: attendee.emailAddress.name,
        type: attendee.type,
        responseStatus: attendee.status?.response || 'needsAction'
      })),
      videoCallLink: event.onlineMeeting?.joinUrl || '',
      lastModified: new Date(event.lastModifiedDateTime),
      changeKey: event.changeKey,
      isFromOutlook: true
    };
  }

  /**
   * Map Outlook status to PharmaDOC status
   * @param {string} outlookStatus - Outlook event status
   * @returns {string} PharmaDOC status
   */
  mapOutlookStatusToPharmaDOC(outlookStatus) {
    const statusMap = {
      'free': 'available',
      'tentative': 'tentative',
      'busy': 'booked',
      'oof': 'unavailable',
      'workingElsewhere': 'busy'
    };

    return statusMap[outlookStatus] || 'booked';
  }

  /**
   * Check for conflicts with Outlook events
   * @param {string} accessToken - Microsoft access token
   * @param {Object} appointment - PharmaDOC appointment
   * @returns {Array} List of conflicting events
   */
  async checkOutlookConflicts(accessToken, appointment) {
    try {
      const conflictingEvents = await this.getOutlookEvents(accessToken, {
        timeMin: appointment.startTime,
        timeMax: appointment.endTime
      });

      return conflictingEvents.events.filter(event => 
        event.showAs === 'busy' && 
        !event.categories?.includes('PharmaDOC')
      );
    } catch (error) {
      this.auditLogger.log('error', 'Failed to check Outlook conflicts', {
        appointmentId: appointment.id,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check for conflicts with PharmaDOC appointments
   * @param {string} userId - User ID
   * @param {Object} event - Outlook event
   * @returns {Array} List of conflicting appointments
   */
  async checkPharmaDOCConflicts(userId, event) {
    try {
      // This would integrate with your PharmaDOC appointment service
      // For now, returning empty array
      return [];
    } catch (error) {
      this.auditLogger.log('error', 'Failed to check PharmaDOC conflicts', {
        eventId: event.id,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Handle sync conflicts
   * @param {string} userId - User ID
   * @param {Array} conflicts - List of conflicts
   */
  async handleSyncConflicts(userId, conflicts) {
    for (const conflict of conflicts) {
      try {
        const resolution = await this.conflictResolver.resolveConflict({
          userId,
          conflict,
          strategy: 'user_choice' // Let user decide
        });

        this.auditLogger.log('info', 'Sync conflict resolved', {
          userId,
          conflictType: conflict.type,
          resolution: resolution.action
        });
      } catch (error) {
        this.auditLogger.log('error', 'Failed to resolve sync conflict', {
          userId,
          error: error.message
        });
      }
    }
  }

  /**
   * Get PharmaDOC appointments for sync
   * @param {string} userId - User ID
   * @param {string} since - Optional timestamp for incremental sync
   * @returns {Array} List of appointments
   */
  async getPharmaDOCAppointments(userId, since) {
    console.log('🔵 [MICROSOFT-DEBUG] getPharmaDOCAppointments called:', {
      userId,
      since,
      sinceDate: since ? new Date(since).toISOString() : 'null'
    });
    
    try {
      const { createClient } = await import('@supabase/supabase-js');
      
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ [MICROSOFT-DEBUG] Missing Supabase environment variables');
        throw new Error('Supabase configuration missing');
      }
      
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔵 [MICROSOFT-DEBUG] Supabase client created, getting user role...');

      // First, get the user's role to determine which column to use
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('❌ [MICROSOFT-DEBUG] Failed to get user role:', userError);
        throw new Error(`Failed to get user role: ${userError.message}`);
      }

      console.log('🔵 [MICROSOFT-DEBUG] User role retrieved:', userData.role);

      // Determine which column to use based on user role
      const userColumn = (userData.role === 'doctor') ? 'doctor_id' : 'pharma_rep_id';
      console.log('🔵 [MICROSOFT-DEBUG] Using column for appointments query:', {
        userRole: userData.role,
        selectedColumn: userColumn
      });

      let query = supabase
        .from('appointments')
        .select(`
          *,
          doctor:doctor_id(id, email, first_name, last_name),
          pharma_rep:pharma_rep_id(id, email, first_name, last_name),
          timeslot:timeslot_id(start_time, end_time, date)
        `)
        .eq(userColumn, userId)
        .in('status', ['confirmed', 'scheduled']) // Only sync confirmed and scheduled appointments
        .not('timeslot_id', 'is', null) // Only appointments with timeslots
        .order('created_at');

      // Add incremental sync filter if since timestamp provided
      if (since) {
        console.log('🔵 [MICROSOFT-DEBUG] Adding incremental sync filter for date:', since);
        query = query.gte('updated_at', since);
      }

      console.log('🔵 [MICROSOFT-DEBUG] Executing appointments query...');
      const { data: appointments, error } = await query;

      if (error) {
        console.error('❌ [MICROSOFT-DEBUG] Database query failed:', {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Database query failed: ${error.message}`);
      }

      console.log('🔵 [MICROSOFT-DEBUG] Appointments query results:', {
        count: appointments?.length || 0,
        sample: appointments?.slice(0, 3).map(apt => ({
          id: apt.id,
          title: apt.title,
          status: apt.status,
          timeslot_id: apt.timeslot_id,
          timeslot_start: apt.timeslot?.start_time,
          timeslot_date: apt.timeslot?.date,
          patient_name: apt.patient_name,
          outlook_event_id: apt.outlook_event_id,
          updated_at: apt.updated_at
        })) || []
      });

      // Transform and filter appointments to include flattened timeslot data
      const validAppointments = (appointments || [])
        .map(apt => {
          // Transform appointments to include flattened timeslot data (like Google service does)
          const transformed = {
            ...apt,
            start_time: apt.timeslot?.start_time,
            end_time: apt.timeslot?.end_time,
            timeslot_date: apt.timeslot?.date,
            doctor_email: apt.doctor?.email,
            doctor_name: `${apt.doctor?.first_name} ${apt.doctor?.last_name}`.trim(),
            pharma_rep_email: apt.pharma_rep?.email,
            pharma_rep_name: `${apt.pharma_rep?.first_name} ${apt.pharma_rep?.last_name}`.trim(),
            // Map purpose to title for calendar events
            title: apt.purpose || apt.title || 'PharmaDOC Appointment'
          };
          
          console.log(`🔵 [MICROSOFT-DEBUG] Transformed appointment ${apt.id}:`, {
            status: apt.status,
            purpose: apt.purpose,
            start_time: transformed.start_time,
            timeslot_date: transformed.timeslot_date,
            doctor_name: transformed.doctor_name,
            pharma_rep_name: transformed.pharma_rep_name,
            has_timeslot: !!apt.timeslot
          });
          
          return transformed;
        })
        .filter(appointment => {
          // Basic validation - check flattened timeslot data
          if (!appointment.start_time || !appointment.title) {
            console.log('🔵 [MICROSOFT-DEBUG] Skipping invalid appointment:', {
              id: appointment.id,
              hasStartTime: !!appointment.start_time,
              hasTitle: !!appointment.title,
              hasPurpose: !!appointment.purpose,
              hasTimeslot: !!appointment.timeslot,
              title: appointment.title,
              purpose: appointment.purpose
            });
            return false;
          }
          
          // Check if appointment is in the future or recent past (last 24 hours)
          // Combine date and time for proper datetime comparison
          const appointmentDateTime = new Date(`${appointment.timeslot_date}T${appointment.start_time}`);
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          
          if (appointmentDateTime < oneDayAgo) {
            console.log('🔵 [MICROSOFT-DEBUG] Skipping old appointment:', {
              id: appointment.id,
              appointmentDateTime: appointmentDateTime.toISOString(),
              cutoff: oneDayAgo.toISOString()
            });
            return false;
          }
          
          console.log('🔵 [MICROSOFT-DEBUG] Processing valid appointment:', {
            id: appointment.id,
            title: appointment.title,
            start_time: appointment.start_time,
            end_time: appointment.end_time,
            timeslot_date: appointment.timeslot_date,
            patient_name: appointment.patient_name,
            has_outlook_id: !!appointment.outlook_event_id
          });
          
          return true;
        })
        .sort((a, b) => {
          // Sort by appointment date and time
          const dateTimeA = new Date(`${a.timeslot_date}T${a.start_time}`);
          const dateTimeB = new Date(`${b.timeslot_date}T${b.start_time}`);
          return dateTimeA - dateTimeB;
        });

      console.log('🔵 [MICROSOFT-DEBUG] Final appointments processing results:', {
        totalFromDB: appointments?.length || 0,
        validAppointments: validAppointments.length,
        appointmentsWithOutlookId: validAppointments.filter(apt => apt.outlook_event_id).length,
        appointmentsWithoutOutlookId: validAppointments.filter(apt => !apt.outlook_event_id).length
      });

      this.auditLogger.log('info', 'Retrieved PharmaDOC appointments', {
        userId,
        totalCount: appointments?.length || 0,
        validCount: validAppointments.length,
        since: since
      });

      return validAppointments;

    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] Failed to get PharmaDOC appointments:', {
        error: error.message,
        stack: error.stack,
        userId,
        since
      });
      
      this.auditLogger.log('error', 'Failed to get PharmaDOC appointments', {
        userId,
        error: error.message,
        since
      });
      
      throw new Error(`Failed to retrieve PharmaDOC appointments: ${error.message}`);
    }
  }

  /**
   * Update appointment with Outlook event ID
   * @param {string} appointmentId - Appointment ID
   * @param {string} outlookEventId - Outlook event ID
   */
  async updateAppointmentOutlookId(appointmentId, outlookEventId) {
    try {
      // This would update the appointment in your database
      this.auditLogger.log('info', 'Updated appointment with Outlook event ID', {
        appointmentId,
        outlookEventId
      });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to update appointment Outlook ID', {
        appointmentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update appointment with meeting link (Teams/Google Meet/etc)
   * @param {string} appointmentId - Appointment ID
   * @param {string} meetingLink - Meeting link URL
   */
  async updateAppointmentMeetingLink(appointmentId, meetingLink) {
    try {
      console.log('🔗 [MICROSOFT-DEBUG] Starting appointment meeting link update:', {
        appointmentId,
        meetingLinkPreview: meetingLink.substring(0, 50) + '...',
        meetingLinkLength: meetingLink.length,
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });

      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ [MICROSOFT-DEBUG] Missing Supabase environment variables');
        throw new Error('Supabase configuration missing for meeting link update');
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      console.log('🔵 [MICROSOFT-DEBUG] Supabase client created, executing update...');

      const updateData = { 
        meeting_link: meetingLink,
        video_provider: 'microsoft_teams',
        meeting_type: 'virtual',
        last_synced: new Date().toISOString()
      };

      console.log('🔵 [MICROSOFT-DEBUG] Update data prepared:', {
        updateKeys: Object.keys(updateData),
        videoProvider: updateData.video_provider,
        meetingType: updateData.meeting_type
      });

      const { data, error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId)
        .select(); // Add select to get updated record back

      console.log('🔵 [MICROSOFT-DEBUG] Database update result:', {
        error: error,
        dataReturned: !!data,
        updatedCount: data?.length || 0,
        appointmentId
      });

      if (error) {
        console.error('❌ [MICROSOFT-DEBUG] Supabase update failed:', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ [MICROSOFT-DEBUG] No rows updated - appointment may not exist:', appointmentId);
        throw new Error(`No appointment found with ID: ${appointmentId}`);
      }

      console.log('✅ [MICROSOFT-DEBUG] Successfully updated appointment with Teams meeting link:', {
        appointmentId,
        updatedMeetingLink: data[0].meeting_link?.substring(0, 50) + '...',
        updatedVideoProvider: data[0].video_provider,
        updatedMeetingType: data[0].meeting_type
      });
      
      this.auditLogger.log('info', 'Updated appointment with meeting link', {
        appointmentId,
        provider: 'microsoft_teams'
      });
    } catch (error) {
      console.error('❌ [MICROSOFT-DEBUG] Error updating appointment meeting link:', {
        error: error.message,
        stack: error.stack,
        appointmentId
      });
      this.auditLogger.log('error', 'Failed to update appointment meeting link', {
        appointmentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create or update PharmaDOC appointment from Outlook event
   * @param {string} userId - User ID
   * @param {Object} event - Outlook event
   * @returns {Object} Created/updated appointment
   */
  async createOrUpdatePharmaDOCAppointment(userId, event) {
    try {
      // This would integrate with your PharmaDOC appointment service
      this.auditLogger.log('info', 'Created/updated PharmaDOC appointment from Outlook', {
        userId,
        eventId: event.id
      });
      
      return { id: 'temp-id' }; // Placeholder
    } catch (error) {
      this.auditLogger.log('error', 'Failed to create/update PharmaDOC appointment', {
        userId,
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop sync for a user
   * @param {string} userId - User ID
   */
  async stopSync(userId) {
    try {
      // Clear sync interval
      const intervalId = this.syncIntervals.get(userId);
      if (intervalId) {
        clearInterval(intervalId);
        this.syncIntervals.delete(userId);
      }

      // Mark sync as inactive
      const syncState = this.syncStates.get(userId);
      if (syncState) {
        syncState.isActive = false;
      }

      this.auditLogger.log('info', 'Outlook sync stopped', { userId });
    } catch (error) {
      this.auditLogger.log('error', 'Failed to stop Outlook sync', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get sync status for a user
   * @param {string} userId - User ID
   * @returns {Object} Sync status
   */
  getSyncStatus(userId) {
    const syncState = this.syncStates.get(userId);
    if (!syncState) {
      return { active: false };
    }

    return {
      active: syncState.isActive,
      lastSync: syncState.lastSync,
      stats: syncState.syncStats,
      errors: syncState.syncErrors,
      settings: syncState.syncSettings
    };
  }

  /**
   * Update sync settings for a user
   * @param {string} userId - User ID
   * @param {Object} newSettings - New sync settings
   */
  async updateSyncSettings(userId, newSettings) {
    const syncState = this.syncStates.get(userId);
    if (!syncState) {
      throw new Error('Sync not initialized for user');
    }

    syncState.syncSettings = {
      ...syncState.syncSettings,
      ...newSettings
    };

    this.auditLogger.log('info', 'Sync settings updated', {
      userId,
      newSettings
    });

    // Restart sync with new settings if needed
    if (syncState.isActive) {
      await this.stopSync(userId);
      await this.initializeSync(userId, syncState.accessToken, syncState.syncSettings);
    }
  }
} 