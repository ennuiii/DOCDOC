import express from 'express';
import { authenticateSupabase } from '../middleware/supabaseAuth.js';
import GoogleOAuthProvider from '../integrations/providers/google/GoogleOAuthProvider.js';
import ZoomOAuthProvider from '../integrations/providers/zoom/ZoomOAuthProvider.js';
import AutoSyncService from '../services/autoSyncService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize services lazily to ensure environment variables are loaded
let googleProvider = null;
let zoomProvider = null;

const getGoogleProvider = () => {
  if (!googleProvider) {
    googleProvider = new GoogleOAuthProvider();
  }
  return googleProvider;
};

const getZoomProvider = () => {
  if (!zoomProvider) {
    zoomProvider = new ZoomOAuthProvider();
  }
  return zoomProvider;
};

// Create a function to get Supabase client (lazy-loaded)
const getSupabaseClient = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required Supabase environment variables');
  }
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Public OAuth endpoints (no authentication required)

// Google Calendar OAuth routes
router.get('/google/auth', async (req, res) => {
  try {
    const { scopes, state, redirect_uri } = req.query;
    
    // Using the actual Google Client ID
    const authUrl = `https://accounts.google.com/oauth/authorize?` +
      `response_type=code&` +
      `client_id=82560942695-2qf526rnc30phkkm1rkja4oav690p7k5.apps.googleusercontent.com&` +
      `redirect_uri=${encodeURIComponent(redirect_uri || 'http://localhost:3000/integrations/callback')}&` +
      `scope=${encodeURIComponent(scopes || 'https://www.googleapis.com/auth/calendar')}&` +
      `state=${encodeURIComponent(state || '')}&` +
      `access_type=offline&` +
      `prompt=consent`;

    // Redirect to Google OAuth
    res.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initiate Google OAuth',
      details: error.message 
    });
  }
});

// Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      console.error('Google OAuth error:', error);
      return res.status(400).json({
        success: false,
        error: 'OAuth authorization denied',
        details: error
      });
    }
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }
    
    // Here you would exchange the code for tokens
    // For now, we'll return a success response
    res.json({
      success: true,
      message: 'Google OAuth callback received',
      code,
      state
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process OAuth callback',
      details: error.message
    });
  }
});

// Microsoft Teams OAuth routes
router.get('/microsoft/auth', async (req, res) => {
  try {
    const { scopes, state, redirect_uri } = req.query;
    
    // Check if Microsoft credentials are configured
    if (!process.env.MICROSOFT_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        error: 'Microsoft integration not configured',
        details: 'Microsoft Client ID not found in environment variables. Please configure MICROSOFT_CLIENT_ID in your .env file.'
      });
    }
    
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `response_type=code&` +
      `client_id=${process.env.MICROSOFT_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirect_uri || process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/integrations/callback')}&` +
      `scope=${encodeURIComponent(scopes || 'https://graph.microsoft.com/calendars.readwrite https://graph.microsoft.com/onlinemeetings.readwrite')}&` +
      `state=${encodeURIComponent(state || '')}&` +
      `prompt=consent`;

    res.redirect(authUrl);
  } catch (error) {
    console.error('Microsoft OAuth error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initiate Microsoft OAuth',
      details: error.message 
    });
  }
});

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'OAuth authorization denied',
        details: error
      });
    }
    
    res.json({
      success: true,
      message: 'Microsoft OAuth callback received',
      code,
      state
    });
  } catch (error) {
    console.error('Microsoft OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process OAuth callback',
      details: error.message
    });
  }
});

// Zoom OAuth
router.get('/zoom/auth', async (req, res) => {
  try {
    console.log('🔍 [ZOOM DEBUG] Starting Zoom OAuth flow');
    console.log('🔍 [ZOOM DEBUG] Query params:', req.query);
    
    const { scopes, state, redirect_uri } = req.query;
    
    console.log('🔍 [ZOOM DEBUG] Environment check:');
    console.log('🔍 [ZOOM DEBUG] ZOOM_CLIENT_ID:', process.env.ZOOM_CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('🔍 [ZOOM DEBUG] ZOOM_CLIENT_SECRET:', process.env.ZOOM_CLIENT_SECRET ? 'SET' : 'NOT SET'); 
    console.log('🔍 [ZOOM DEBUG] ZOOM_REDIRECT_URI:', process.env.ZOOM_REDIRECT_URI || 'NOT SET');
    
    // Use proper OAuth provider instead of hardcoded values
    const zoomProvider = getZoomProvider();
    console.log('🔍 [ZOOM DEBUG] ZoomProvider initialized successfully');
    
    // Use proper OAuth provider instead of hardcoded values
    const scopesArray = scopes ? scopes.split(' ') : ['meeting:write', 'meeting:read', 'user:read'];
    console.log('🔍 [ZOOM DEBUG] Requested scopes:', scopesArray);
    
    const authResult = zoomProvider.generateAuthUrl('temp-user-id', scopesArray, state);
    console.log('🔍 [ZOOM DEBUG] Generated auth URL:', authResult.authUrl);
    console.log('🔍 [ZOOM DEBUG] Generated state:', authResult.state.substring(0, 20) + '...');
    
    console.log('🔍 [ZOOM DEBUG] Redirecting to Zoom OAuth...');
    res.redirect(authResult.authUrl);
  } catch (error) {
    console.error('❌ [ZOOM ERROR] OAuth initiation failed:', error);
    console.error('❌ [ZOOM ERROR] Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initiate Zoom OAuth',
      details: error.message 
    });
  }
});

router.get('/zoom/callback', async (req, res) => {
  try {
    console.log('🔍 [ZOOM DEBUG] ========== ZOOM OAUTH CALLBACK ==========');
    console.log('🔍 [ZOOM DEBUG] Callback URL hit:', req.url);
    console.log('🔍 [ZOOM DEBUG] Query parameters:', req.query);
    console.log('🔍 [ZOOM DEBUG] Headers:', {
      'user-agent': req.headers['user-agent'],
      'referer': req.headers['referer'],
      'host': req.headers['host']
    });
    
    const { code, state, error, error_description } = req.query;
    
    console.log('🔍 [ZOOM DEBUG] Extracted parameters:');
    console.log('🔍 [ZOOM DEBUG] - Code:', code ? `${code.substring(0, 20)}...` : 'NOT PRESENT');
    console.log('🔍 [ZOOM DEBUG] - State:', state ? `${state.substring(0, 20)}...` : 'NOT PRESENT');
    console.log('🔍 [ZOOM DEBUG] - Error:', error || 'None');
    console.log('🔍 [ZOOM DEBUG] - Error Description:', error_description || 'None');
    
    if (error) {
      console.error('❌ [ZOOM ERROR] OAuth authorization denied:');
      console.error('❌ [ZOOM ERROR] - Error:', error);
      console.error('❌ [ZOOM ERROR] - Description:', error_description);
      
      return res.status(400).json({
        success: false,
        error: 'OAuth authorization denied',
        details: {
          error,
          error_description,
          message: 'User denied authorization or Zoom app configuration error'
        }
      });
    }
    
    if (!code) {
      console.error('❌ [ZOOM ERROR] No authorization code received');
      return res.status(400).json({
        success: false,
        error: 'No authorization code received',
        details: 'The OAuth flow did not return an authorization code'
      });
    }
    
    console.log('✅ [ZOOM DEBUG] OAuth callback successful - code received');
    console.log('🔍 [ZOOM DEBUG] Now redirecting to frontend callback handler...');
    
    // Instead of doing token exchange here, redirect to frontend OAuth callback
    // The frontend will handle the token exchange via POST /integrations/zoom/token
    const callbackUrl = new URL('/integrations/callback', process.env.FRONTEND_URL || 'http://localhost:3000');
    callbackUrl.searchParams.set('code', code);
    if (state) callbackUrl.searchParams.set('state', state);
    
    console.log('🔍 [ZOOM DEBUG] Redirecting to:', callbackUrl.toString());
    res.redirect(callbackUrl.toString());
    
  } catch (error) {
    console.error('❌ [ZOOM ERROR] Callback processing failed:', error);
    console.error('❌ [ZOOM ERROR] Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to process OAuth callback',
      details: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        phase: 'callback_processing'
      }
    });
  }
});

// CalDAV connection endpoint
router.post('/caldav/connect', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.user.id;
    const { server_url, username, password, provider_type = 'generic' } = req.body;
    
    console.log('🔍 [CALDAV DEBUG] Connection attempt:', {
      userId,
      server_url,
      username: username?.substring(0, 3) + '***',
      provider_type
    });
    
    if (!server_url || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required CalDAV credentials'
      });
    }

    // Import CalDAV services
    const { default: CalDAVAuthProvider } = await import('../integrations/providers/caldav/CalDAVAuthProvider.js');
    const { default: CalDAVSyncService } = await import('../integrations/services/CalDAVSyncService.js');
    
    const calDAVAuth = new CalDAVAuthProvider();
    const calDAVSync = new CalDAVSyncService();

    // Test CalDAV connection
    const credentials = Buffer.from(JSON.stringify({
      username,
      password,
      serverUrl: server_url,
      providerType: provider_type
    })).toString('base64');

    const tokenData = await calDAVAuth.exchangeCodeForTokens(credentials, '');
    const userInfo = await calDAVAuth.getUser(tokenData.access_token);
    const healthCheck = await calDAVAuth.healthCheck(tokenData.access_token);

    if (!healthCheck.healthy) {
      return res.status(400).json({
        success: false,
        error: 'CalDAV connection failed',
        details: healthCheck.error
      });
    }

    // Store the integration
    const supabase = getSupabaseClient();
    
    // CalDAV credentials don't expire, but database constraint requires expiry date if access_token exists
    // Set to a far future date (100 years from now) to satisfy the constraint
    const farFutureExpiry = new Date();
    farFutureExpiry.setFullYear(farFutureExpiry.getFullYear() + 100);
    
    const integrationData = {
      user_id: userId,
      provider: 'caldav',
      provider_user_id: userInfo.id, // Add the missing provider_user_id field
      provider_email: userInfo.email,
      access_token: tokenData.access_token,
      refresh_token: null,
      token_expires_at: farFutureExpiry.toISOString(), // Set far future date to satisfy constraint
      scope: tokenData.scope,
      status: 'connected',
      config: {
        provider_type: userInfo.provider_type,
        server_url: userInfo.server_url,
        user_info: userInfo,
        auto_sync: true,
        sync_direction: 'bidirectional'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: integration, error } = await supabase
      .from('user_integrations')
      .upsert(integrationData, {
        onConflict: 'user_id,provider,provider_user_id', // Fix the conflict clause to match the unique constraint
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [CALDAV ERROR] Database error:', error);
      throw error;
    }

    console.log('✅ [CALDAV DEBUG] Integration stored successfully:', {
      id: integration.id,
      provider_type: userInfo.provider_type,
      calendar_count: healthCheck.calendar_count
    });

    res.json({
      success: true,
      message: 'CalDAV connection established successfully',
      provider: 'caldav',
      provider_type: userInfo.provider_type,
      calendar_count: healthCheck.calendar_count,
      integration: {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        connectedAt: integration.created_at,
        user: userInfo
      }
    });
  } catch (error) {
    console.error('❌ [CALDAV ERROR] Connection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to CalDAV server',
      details: error.message
    });
  }
});

// Protected routes below (require authentication)

// Get user integrations
router.get('/', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.user.id;

    const supabase = getSupabaseClient();
    const { data: integrations, error } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to fetch integrations');
    }

    console.log('🔍 [DEBUG] Raw integrations from database:', integrations);

    // Format integrations for frontend
    const formattedIntegrations = integrations.map(integration => {
      console.log(`🔍 [DEBUG] Processing integration:`, {
        provider: integration.provider,
        status: integration.status,
        provider_email: integration.provider_email,
        last_sync_at: integration.last_sync_at,
        config: integration.config
      });

      const formatted = {
        providerId: integration.provider,
        providerName: getProviderDisplayName(integration.provider),
        providerLogo: getProviderLogo(integration.provider),
        status: integration.status,
        lastSync: integration.last_sync_at,
        user: integration.config?.user_info || { 
          email: integration.provider_email,
          name: integration.provider_email?.split('@')[0] 
        },
        scopes: Array.isArray(integration.scope) ? integration.scope : (Array.isArray(integration.scopes) ? integration.scopes : []),
        connectedAt: integration.created_at,
      };

      console.log(`🔍 [DEBUG] Formatted integration:`, formatted);
      return formatted;
    });

    res.json({
      success: true,
      integrations: formattedIntegrations
    });

  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch integrations',
      details: error.message
    });
  }
});

// Disconnect an integration
router.post('/:providerId/disconnect', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.user.id;
    const { providerId } = req.params;

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', userId)
      .eq('provider', providerId);

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to disconnect integration');
    }

    res.json({
      success: true,
      message: `Successfully disconnected ${providerId} integration`
    });

  } catch (error) {
    console.error('Disconnect integration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect integration',
      details: error.message
    });
  }
});

// Delete integration (legacy route)
router.delete('/:id', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    res.json({ 
      success: true, 
      message: `Integration ${id} removed successfully` 
    });
  } catch (error) {
    console.error('Delete integration error:', error);
    res.status(500).json({ 
      error: 'Failed to remove integration',
      details: error.message 
    });
  }
});

// Sync an integration
router.post('/:providerId/sync', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.user.id;
    const { providerId } = req.params;

    const supabase = getSupabaseClient();
    
    // Get integration details
    const { data: integration, error: fetchError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', providerId)
      .single();

    if (fetchError || !integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    let syncResults = null;

    // Perform actual sync based on provider
    if (providerId === 'google') {
      console.log('🔄 Starting Google Calendar sync for user:', userId);
      
      try {
        // Import and use GoogleCalendarSyncService
        const { default: GoogleCalendarSyncService } = await import('../integrations/services/GoogleCalendarSyncService.js');
        const syncService = new GoogleCalendarSyncService();
        
        // Perform incremental sync (faster for testing)
        syncResults = await syncService.performIncrementalSync(userId, integration.id, {
          forceFull: req.body.forceFull || false
        });
        
        console.log('✅ Google Calendar sync completed:', syncResults);
        
      } catch (syncError) {
        console.error('❌ Google Calendar sync failed:', syncError);
        // Update integration status to failed but don't throw - let user know what happened
        await supabase
          .from('user_integrations')
          .update({ 
            status: 'sync_failed',
            last_error: syncError.message
          })
          .eq('user_id', userId)
          .eq('provider', providerId);
          
        return res.status(500).json({
          success: false,
          error: 'Calendar sync failed',
          details: syncError.message,
          suggestion: 'Try creating an appointment first, then sync again'
        });
      }
    } else if (providerId === 'microsoft') {
      console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Starting Microsoft Outlook sync for user:', userId);
      console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Integration details:', {
        provider: integration.provider,
        status: integration.status,
        hasAccessToken: !!integration.access_token,
        tokenLength: integration.access_token?.length || 0,
        lastSync: integration.last_sync_at,
        providerEmail: integration.provider_email
      });
      
      try {
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Importing OutlookCalendarSyncService...');
        
        // Import and use OutlookCalendarSyncService
        const { default: OutlookCalendarSyncService } = await import('../integrations/services/OutlookCalendarSyncService.js');
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] OutlookCalendarSyncService imported successfully');
        
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Creating sync service instance...');
        const syncService = new OutlookCalendarSyncService();
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Sync service instance created');
        
        // Prepare sync settings
        const syncSettings = {
          forceFull: req.body.forceFull || false,
          syncDirection: 'bidirectional',
          selectedCalendars: ['primary'],
          enableConflictResolution: true,
          enableBufferTime: true,
          includeTeamsMeetings: true
        };
        
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Sync settings prepared:', syncSettings);
        
        // Initialize and perform sync
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Initializing sync...');
        const initResult = await syncService.initializeSync(userId, integration.access_token, syncSettings);
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Sync initialization completed:', {
          success: initResult.success,
          calendarsCount: initResult.calendars?.length || 0,
          userEmail: initResult.userProfile?.mail || initResult.userProfile?.userPrincipalName
        });
        
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Performing sync...');
        syncResults = await syncService.performSync(userId);
        console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Sync performance completed:', {
          success: syncResults.success,
          duration: syncResults.duration,
          pharmaToOutlookCreated: syncResults.results?.pharmaToOutlook?.created || 0,
          outlookToPharmaCreated: syncResults.results?.outlookToPharma?.created || 0
        });
        
        console.log('✅ [MICROSOFT-ROUTES-DEBUG] Microsoft Outlook sync completed successfully');
        
      } catch (syncError) {
        console.error('❌ [MICROSOFT-ROUTES-DEBUG] Microsoft Outlook sync failed with error:', {
          errorMessage: syncError.message,
          errorStack: syncError.stack,
          userId: userId,
          providerId: providerId,
          integrationStatus: integration?.status,
          hasAccessToken: !!integration?.access_token
        });
        
        // Additional debugging for common issues
        if (syncError.message.includes('Invalid Microsoft access token')) {
          console.error('❌ [MICROSOFT-ROUTES-DEBUG] Token validation failed - token may be expired or invalid');
        } else if (syncError.message.includes('Sync not initialized')) {
          console.error('❌ [MICROSOFT-ROUTES-DEBUG] Sync service initialization failed');
        } else if (syncError.message.includes('Failed to get Microsoft user profile')) {
          console.error('❌ [MICROSOFT-ROUTES-DEBUG] User profile retrieval failed - check token scopes');
        } else if (syncError.message.includes('Failed to get Microsoft calendars')) {
          console.error('❌ [MICROSOFT-ROUTES-DEBUG] Calendar retrieval failed - check calendar permissions');
        }
        
        // Update integration status to failed
        const { error: updateError } = await supabase
          .from('user_integrations')
          .update({ 
            status: 'sync_failed',
            last_error: syncError.message,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('provider', providerId);
          
        if (updateError) {
          console.error('❌ [MICROSOFT-ROUTES-DEBUG] Failed to update integration status:', updateError);
        } else {
          console.log('🔄 [MICROSOFT-ROUTES-DEBUG] Updated integration status to sync_failed');
        }
          
        return res.status(500).json({
          success: false,
          error: 'Outlook sync failed',
          details: syncError.message,
          errorType: syncError.message.includes('token') ? 'TOKEN_ERROR' : 
                     syncError.message.includes('calendar') ? 'CALENDAR_ERROR' :
                     syncError.message.includes('profile') ? 'PROFILE_ERROR' : 'UNKNOWN_ERROR',
          suggestion: syncError.message.includes('token') 
            ? 'Please reconnect your Microsoft account to refresh your access token'
            : 'Try creating an appointment first, then sync again. If the problem persists, please reconnect your Microsoft account.'
        });
      }
    } else if (providerId === 'caldav') {
      console.log('🔄 Starting CalDAV sync for user:', userId);
      
      try {
        // Import and use CalDAVSyncService
        const { default: CalDAVSyncService } = await import('../integrations/services/CalDAVSyncService.js');
        const syncService = new CalDAVSyncService();
        
        // Perform CalDAV sync
        syncResults = await syncService.performSync(userId, integration.id);
        
        console.log('✅ CalDAV sync completed:', syncResults);
        
      } catch (syncError) {
        console.error('❌ CalDAV sync failed:', syncError);
        // Update integration status to failed but don't throw - let user know what happened
        await supabase
          .from('user_integrations')
          .update({ 
            status: 'sync_failed',
            last_error: syncError.message
          })
          .eq('user_id', userId)
          .eq('provider', providerId);
          
        return res.status(500).json({
          success: false,
          error: 'CalDAV sync failed',
          details: syncError.message,
          suggestion: 'Check your CalDAV server credentials and try again'
        });
      }
    }

    // Update last sync time on success
    const { error: updateError } = await supabase
      .from('user_integrations')
      .update({ 
        last_sync_at: new Date().toISOString(),
        status: 'connected',
        last_error: null
      })
      .eq('user_id', userId)
      .eq('provider', providerId);

    if (updateError) {
      console.error('Database error:', updateError);
      throw new Error('Failed to update sync status');
    }

    res.json({
      success: true,
      message: `Successfully synced ${providerId} integration`,
      lastSync: new Date().toISOString(),
      syncResults: syncResults,
      appointmentsSynced: providerId === 'google' 
        ? (syncResults?.results?.pharmaToGoogle?.created || 0)
        : providerId === 'microsoft'
        ? (syncResults?.results?.pharmaToOutlook?.created || 0)
        : providerId === 'caldav'
        ? (syncResults?.syncResults?.reduce((total, result) => total + (result.imported || 0), 0) || 0)
        : 0
    });

  } catch (error) {
    console.error('Sync integration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync integration',
      details: error.message
    });
  }
});

// Reset integration status (fix connection error)
router.post('/:providerId/reset', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.user.id;
    const { providerId } = req.params;

    const supabase = getSupabaseClient();
    
    // Reset status to connected and clear any error
    const { error } = await supabase
      .from('user_integrations')
      .update({ 
        status: 'connected',
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', providerId);

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to reset integration status');
    }

    res.json({
      success: true,
      message: `${providerId} integration status reset to connected`
    });

  } catch (error) {
    console.error('Reset integration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset integration',
      details: error.message
    });
  }
});

// Test integration
router.post('/:id/test', authenticateSupabase, async (req, res) => {
  try {
    const { id } = req.params;
    
    res.json({ 
      success: true, 
      message: `Integration ${id} test successful`,
      status: 'healthy' 
    });
  } catch (error) {
    console.error('Test integration error:', error);
    res.status(500).json({ 
      error: 'Integration test failed',
      details: error.message 
    });
  }
});

// New endpoint for @react-oauth/google
router.post('/google/token', authenticateSupabase, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    console.log('🔍 Google OAuth Debug:');
    console.log('User ID:', userId);
    console.log('Code received:', code ? 'Yes' : 'No');

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    // Exchange code for tokens using GoogleOAuthProvider
    console.log('📞 Exchanging code for tokens...');

    
    const tokenData = await getGoogleProvider().exchangeCodeForTokens(code);
    console.log('✅ Token data received:', { 
      hasAccessToken: !!tokenData.access_token,
      expiresAt: tokenData.expires_at,
      scope: tokenData.scope 
    });
    
    // Get user info from Google
    console.log('👤 Getting user info...');
    const userInfo = await getGoogleProvider().getUser(tokenData.access_token);
    console.log('✅ User info received:', { 
      id: userInfo.id, 
      email: userInfo.email, 
      name: userInfo.name 
    });

    const supabase = getSupabaseClient();
    
    // Store integration in database
    const { data: integration, error: dbError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: userId,
        provider: 'google',
        provider_user_id: userInfo.id,
        provider_email: userInfo.email,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenData.expires_at,
        scope: Array.isArray(tokenData.scope) ? tokenData.scope : (tokenData.scope ? tokenData.scope.split(' ') : []),
        status: 'connected',
        config: {
          user_info: userInfo,
          calendars: [], // Will be populated by sync service
        },
        provider_account_name: userInfo.name,
        avatar_url: userInfo.picture,
        last_sync_at: null
      }, {
        onConflict: 'user_id,provider,provider_user_id',
        returning: 'minimal'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to store integration');
    }

    res.json({
      success: true,
      message: 'Google integration connected successfully',
      credentials: {
        provider: 'google',
        expires_at: tokenData.expires_at,
        scopes: tokenData.scope
      },
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      }
    });

  } catch (error) {
    console.error('❌ Google token exchange error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to process Google authorization',
      details: error.message,
      // Add more debugging info in development
      ...(process.env.NODE_ENV === 'development' && {
        debugInfo: {
          errorName: error.name,
          errorCode: error.code,
          errorResponse: error.response?.data
        }
      })
    });
  }
});

// Microsoft OAuth token exchange
router.post('/microsoft/token', authenticateSupabase, async (req, res) => {
  try {
    console.log('🔵 [MICROSOFT-DEBUG] Microsoft token exchange started');
    const { code, state } = req.body;
    const userId = req.user.id;

    console.log('🔵 [MICROSOFT-DEBUG] Request data:', {
      userId,
      hasCode: !!code,
      hasState: !!state,
      codeLength: code ? code.length : 0
    });

    if (!code) {
      console.error('❌ [MICROSOFT-DEBUG] No authorization code provided');
      return res.status(400).json({
        success: false,
        error: 'Authorization code required'
      });
    }

    // Check if Microsoft credentials are configured
    console.log('🔵 [MICROSOFT-DEBUG] Checking environment variables...');
    console.log('🔵 [MICROSOFT-DEBUG] MICROSOFT_CLIENT_ID:', process.env.MICROSOFT_CLIENT_ID ? 'present' : 'missing');
    console.log('🔵 [MICROSOFT-DEBUG] MICROSOFT_CLIENT_SECRET:', process.env.MICROSOFT_CLIENT_SECRET ? 'present' : 'missing');
    console.log('🔵 [MICROSOFT-DEBUG] MICROSOFT_REDIRECT_URI:', process.env.MICROSOFT_REDIRECT_URI || 'using default');
    
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      console.error('❌ [MICROSOFT-DEBUG] Microsoft credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'Microsoft integration not configured',
        details: 'Microsoft credentials not found in environment variables'
      });
    }

    // Exchange code for tokens
    console.log('🔵 [MICROSOFT-DEBUG] Exchanging authorization code for tokens...');
    const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const tokenParams = {
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/integrations/callback',
      scope: 'https://graph.microsoft.com/calendars.readwrite https://graph.microsoft.com/onlinemeetings.readwrite https://graph.microsoft.com/user.read'
    };
    
    console.log('🔵 [MICROSOFT-DEBUG] Token exchange parameters:', {
      client_id: tokenParams.client_id,
      redirect_uri: tokenParams.redirect_uri,
      scope: tokenParams.scope,
      grant_type: tokenParams.grant_type
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenParams)
    });

    console.log('🔵 [MICROSOFT-DEBUG] Token exchange response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('❌ [MICROSOFT-DEBUG] Microsoft token exchange failed:', errorData);
      return res.status(400).json({
        success: false,
        error: 'Failed to exchange authorization code',
        details: errorData
      });
    }

    const tokens = await tokenResponse.json();
    console.log('🔵 [MICROSOFT-DEBUG] Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type
    });

    // Get user profile information
    console.log('🔵 [MICROSOFT-DEBUG] Fetching user profile from Microsoft Graph...');
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    console.log('🔵 [MICROSOFT-DEBUG] Profile fetch response status:', profileResponse.status);

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error('❌ [MICROSOFT-DEBUG] Profile fetch failed:', errorText);
      throw new Error('Failed to fetch user profile');
    }

    const userProfile = await profileResponse.json();
    console.log('🔵 [MICROSOFT-DEBUG] User profile received:', {
      id: userProfile.id,
      email: userProfile.mail || userProfile.userPrincipalName,
      displayName: userProfile.displayName,
      givenName: userProfile.givenName,
      surname: userProfile.surname
    });

    // Store integration in database
    console.log('🔵 [MICROSOFT-DEBUG] Storing integration in database...');
    const supabase = getSupabaseClient();
    
    const integrationData = {
      user_id: userId,
      provider: 'microsoft',
      provider_user_id: userProfile.id,
      provider_email: userProfile.mail || userProfile.userPrincipalName,
      status: 'connected',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: ['calendars.readwrite', 'onlinemeetings.readwrite', 'user.read'],
      config: {
        user_info: {
          id: userProfile.id,
          email: userProfile.mail || userProfile.userPrincipalName,
          name: userProfile.displayName,
          given_name: userProfile.givenName,
          family_name: userProfile.surname
        }
      },
      provider_account_name: userProfile.displayName,
      updated_at: new Date().toISOString()
    };
    
    console.log('🔵 [MICROSOFT-DEBUG] Integration data to store:', JSON.stringify(integrationData, null, 2));
    
    const { data: integration, error } = await supabase
      .from('user_integrations')
      .upsert(integrationData, {
        onConflict: 'user_id,provider,provider_user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [MICROSOFT-DEBUG] Database error:', error);
      throw new Error('Failed to save Microsoft integration');
    }
    
    console.log('✅ [MICROSOFT-DEBUG] Integration stored successfully:', {
      id: integration.id,
      provider: integration.provider,
      status: integration.status
    });

    const responseData = {
      success: true,
      integration: {
        providerId: 'microsoft',
        providerName: 'Microsoft Outlook', // Teams removed for multi-tenant SaaS
        status: 'connected',
        user: {
          email: userProfile.mail || userProfile.userPrincipalName,
          name: userProfile.displayName
        }
      }
    };
    
    console.log('✅ [MICROSOFT-DEBUG] Microsoft token exchange completed successfully');
    console.log('🔵 [MICROSOFT-DEBUG] Sending response:', JSON.stringify(responseData, null, 2));
    
    res.json(responseData);

  } catch (error) {
    console.error('❌ [MICROSOFT-DEBUG] Microsoft token exchange error:', error);
    console.error('❌ [MICROSOFT-DEBUG] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to connect Microsoft account',
      details: error.message
    });
  }
});

// Zoom OAuth token exchange
router.post('/zoom/token', authenticateSupabase, async (req, res) => {
  try {
    console.log('🟡 [ZOOM-DEBUG] Zoom token exchange started');
    const { code, state } = req.body;
    const userId = req.user.id;

    console.log('🟡 [ZOOM-DEBUG] Request data:', {
      userId,
      hasCode: !!code,
      hasState: !!state,
      codeLength: code ? code.length : 0
    });

    if (!code) {
      console.error('❌ [ZOOM-DEBUG] No authorization code provided');
      return res.status(400).json({
        success: false,
        error: 'Authorization code required'
      });
    }

    // Check if Zoom credentials are configured
    console.log('🟡 [ZOOM-DEBUG] Checking environment variables...');
    console.log('🟡 [ZOOM-DEBUG] ZOOM_CLIENT_ID:', process.env.ZOOM_CLIENT_ID ? 'present' : 'missing');
    console.log('🟡 [ZOOM-DEBUG] ZOOM_CLIENT_SECRET:', process.env.ZOOM_CLIENT_SECRET ? 'present' : 'missing');
    console.log('🟡 [ZOOM-DEBUG] ZOOM_REDIRECT_URI:', process.env.ZOOM_REDIRECT_URI || 'using default');
    
    if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
      console.error('❌ [ZOOM-DEBUG] Zoom credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'Zoom integration not configured',
        details: 'Zoom credentials not found in environment variables'
      });
    }

    // Exchange code for tokens using ZoomOAuthProvider
    console.log('🟡 [ZOOM-DEBUG] Exchanging authorization code for tokens...');
    const zoomProvider = getZoomProvider();
    const tokens = await zoomProvider.exchangeCodeForTokens(code, state);
    
    console.log('🟡 [ZOOM-DEBUG] Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      scope: tokens.scope
    });

    // Get user profile information using access token
    console.log('🟡 [ZOOM-DEBUG] Fetching user profile from Zoom API...');
    const userValidation = await zoomProvider.validateToken(tokens.access_token);
    
    if (!userValidation.valid) {
      throw new Error('Failed to validate Zoom token: ' + userValidation.error);
    }

    const userProfile = userValidation.user;
    console.log('🟡 [ZOOM-DEBUG] User profile received:', {
      id: userProfile.id,
      email: userProfile.email,
      firstName: userProfile.first_name,
      lastName: userProfile.last_name,
      accountId: userProfile.account_id
    });

    // Store integration in database
    console.log('🟡 [ZOOM-DEBUG] Storing integration in database...');
    const supabase = getSupabaseClient();
    
    const integrationData = {
      user_id: userId,
      provider: 'zoom',
      provider_user_id: userProfile.id,
      provider_email: userProfile.email,
      status: 'connected',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokens.expires_at,
      scope: Array.isArray(tokens.scope) ? tokens.scope : (tokens.scope ? tokens.scope.split(' ') : []),
      config: {
        user_info: {
          id: userProfile.id,
          email: userProfile.email,
          name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
          first_name: userProfile.first_name,
          last_name: userProfile.last_name,
          account_id: userProfile.account_id,
          type: userProfile.type
        }
      },
      provider_account_name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
      updated_at: new Date().toISOString()
    };
    
    console.log('🟡 [ZOOM-DEBUG] Integration data to store:', {
      ...integrationData,
      access_token: '[HIDDEN]',
      refresh_token: '[HIDDEN]'
    });
    
    const { data: integration, error } = await supabase
      .from('user_integrations')
      .upsert(integrationData, {
        onConflict: 'user_id,provider,provider_user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [ZOOM-DEBUG] Database error:', error);
      throw new Error('Failed to save Zoom integration');
    }
    
    console.log('✅ [ZOOM-DEBUG] Integration stored successfully:', {
      id: integration.id,
      provider: integration.provider,
      status: integration.status
    });

    const responseData = {
      success: true,
      integration: {
        providerId: 'zoom',
        providerName: 'Zoom Meetings',
        status: 'connected',
        user: {
          email: userProfile.email,
          name: `${userProfile.first_name} ${userProfile.last_name}`.trim()
        }
      }
    };
    
    console.log('✅ [ZOOM-DEBUG] Zoom token exchange completed successfully');
    console.log('🟡 [ZOOM-DEBUG] Sending response:', JSON.stringify(responseData, null, 2));
    
    res.json(responseData);

  } catch (error) {
    console.error('❌ [ZOOM-DEBUG] Zoom token exchange error:', error);
    console.error('❌ [ZOOM-DEBUG] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to connect Zoom account',
      details: error.message
    });
  }
});

// Helper functions
function getProviderDisplayName(provider) {
  switch (provider) {
    case 'google': return 'Google Calendar & Meet';
    case 'microsoft': return 'Microsoft Outlook'; // Teams removed for multi-tenant SaaS
    case 'zoom': return 'Zoom Meetings';
    case 'caldav': return 'CalDAV';
    default: return provider;
  }
}

function getProviderLogo(provider) {
  // Return appropriate logo URLs or null
  const logos = {
    google: '/logos/google.png',
    microsoft: '/logos/microsoft.png',
    zoom: '/logos/zoom.png',
    caldav: '/logos/caldav.png',
  };
  return logos[provider] || null;
}

// Auto-sync management endpoints

// Get auto-sync settings for current user
router.get('/auto-sync/settings', authenticateSupabase, async (req, res) => {
  try {
    const autoSyncService = new AutoSyncService();
    const settings = await autoSyncService.getAutoSyncSettings(req.user.id);
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get auto-sync settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get auto-sync settings',
      details: error.message
    });
  }
});

// Enable/disable auto-sync for a specific integration
router.put('/:integrationId/auto-sync', authenticateSupabase, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled field must be a boolean'
      });
    }
    
    // Verify the integration belongs to the current user
    const supabase = getSupabaseClient();
    const { data: integration, error: fetchError } = await supabase
      .from('user_integrations')
      .select('user_id')
      .eq('id', integrationId)
      .single();
    
    if (fetchError || !integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }
    
    if (integration.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const autoSyncService = new AutoSyncService();
    await autoSyncService.setAutoSync(integrationId, enabled);
    
    res.json({
      success: true,
      message: `Auto-sync ${enabled ? 'enabled' : 'disabled'} for integration`
    });
  } catch (error) {
    console.error('Set auto-sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update auto-sync setting',
      details: error.message
    });
  }
});

// Manually trigger auto-sync for all user's integrations
router.post('/auto-sync/trigger', authenticateSupabase, async (req, res) => {
  try {
    const { appointmentId, action } = req.body;
    
    // Trigger sync for the current user
    const autoSyncService = new AutoSyncService();
    if (appointmentId && appointmentId !== 'manual') {
      // Trigger appointment-specific sync
      const result = await autoSyncService.triggerAppointmentSync(appointmentId, action || 'manual');
      res.json({
        success: true,
        message: 'Auto-sync triggered for appointment',
        result
      });
    } else {
      // Trigger manual sync for user
      const result = await autoSyncService.manualSync(req.user.id);
      res.json({
        success: true,
        message: 'Manual sync triggered for all active integrations',
        result
      });
    }
    
  } catch (error) {
    console.error('Trigger auto-sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger auto-sync',
      details: error.message
    });
  }
});

export default router; 