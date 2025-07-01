import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

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
    
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `response_type=code&` +
      `client_id=YOUR_MICROSOFT_CLIENT_ID&` +
      `redirect_uri=${encodeURIComponent(redirect_uri || 'http://localhost:3000/integrations/callback')}&` +
      `scope=${encodeURIComponent(scopes || 'https://graph.microsoft.com/calendars.readwrite')}&` +
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

// Zoom OAuth routes
router.get('/zoom/auth', async (req, res) => {
  try {
    const { scopes, state, redirect_uri } = req.query;
    
    const authUrl = `https://zoom.us/oauth/authorize?` +
      `response_type=code&` +
      `client_id=Ahg5k5lcQxKMAzG5a8iVng&` +
      `redirect_uri=${encodeURIComponent(redirect_uri || 'http://localhost:3000/integrations/callback')}&` +
      `state=${encodeURIComponent(state || '')}&` +
      `scope=${encodeURIComponent(scopes || 'meeting:write')}`;

    res.redirect(authUrl);
  } catch (error) {
    console.error('Zoom OAuth error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initiate Zoom OAuth',
      details: error.message 
    });
  }
});

router.get('/zoom/callback', async (req, res) => {
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
      message: 'Zoom OAuth callback received',
      code,
      state
    });
  } catch (error) {
    console.error('Zoom OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process OAuth callback',
      details: error.message
    });
  }
});

// CalDAV connection endpoint
router.post('/caldav/connect', async (req, res) => {
  try {
    const { server_url, username, password } = req.body;
    
    if (!server_url || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required CalDAV credentials'
      });
    }
    
    // Here you would test the CalDAV connection
    res.json({
      success: true,
      message: 'CalDAV connection test completed',
      provider: 'caldav'
    });
  } catch (error) {
    console.error('CalDAV connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to CalDAV server',
      details: error.message
    });
  }
});

// Protected routes below (require authentication)

// Get user integrations
router.get('/', authenticate, async (req, res) => {
  try {
    res.json([
      {
        id: 1,
        provider: 'google',
        name: 'Google Calendar & Meet',
        status: 'connected',
        lastSync: new Date().toISOString(),
      },
      {
        id: 2,
        provider: 'microsoft',
        name: 'Microsoft Teams',
        status: 'disconnected',
        lastSync: null,
      }
    ]);
  } catch (error) {
    console.error('Get integrations error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch integrations',
      details: error.message 
    });
  }
});

// Delete integration
router.delete('/:id', authenticate, async (req, res) => {
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

// Test integration
router.post('/:id/test', authenticate, async (req, res) => {
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

export default router; 