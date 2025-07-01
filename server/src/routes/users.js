import express from 'express';
import { authenticateSupabase, requireRole } from '../middleware/supabaseAuth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateSupabase, (req, res) => {
  res.json({ user: req.user });
});

// Update user profile
router.put('/profile', authenticateSupabase, (req, res) => {
  res.json({ message: 'Profile update endpoint - to be implemented' });
});

// Get user preferences
router.get('/:userId/preferences', authenticateSupabase, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own preferences (unless admin)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only access your own preferences'
      });
    }
    
    const supabase = supabaseAdmin();
    
    // Get user preferences
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }
    
    // If no preferences found, return defaults
    if (!preferences) {
      const defaultPreferences = {
        buffer_time_settings: {
          beforeAppointment: 15,
          afterAppointment: 15,
          enableSmartBuffering: true,
          respectCalendarBuffers: true,
          minimumBufferTime: 5,
          maximumBufferTime: 60,
          bufferTimeStrategy: 'fixed'
        },
        timezone_settings: {
          timezone: 'UTC',
          autoDetect: true,
          use24HourFormat: true,
          showTimezoneInDates: true,
          dstNotifications: true
        },
        calendar_sync_settings: {
          syncPrimaryCalendar: true,
          syncSecondaryCalendars: false,
          excludeReadOnlyCalendars: true,
          syncDirection: 'bidirectional',
          conflictResolution: 'user_choice'
        },
        notification_settings: {
          appointmentReminders: true,
          calendarSync: true,
          conflictAlerts: true,
          emailNotifications: true,
          pushNotifications: true
        },
        meeting_preferences: {
          defaultMeetingType: 'virtual',
          autoGenerateMeetingLinks: true,
          defaultMeetingDuration: 30
        }
      };
      
      return res.json({
        success: true,
        preferences: defaultPreferences
      });
    }
    
    res.json({
      success: true,
      preferences
    });
    
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user preferences'
    });
  }
});

// Update user preferences
router.put('/:userId/preferences', authenticateSupabase, async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Ensure user can only update their own preferences (unless admin)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own preferences'
      });
    }
    
    const supabase = supabaseAdmin();
    
    // Get existing preferences
    const { data: existingPrefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Merge with existing preferences
    const updatedPreferences = {
      user_id: userId,
      ...existingPrefs,
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    // Upsert the preferences
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .upsert(updatedPreferences, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      preferences
    });
    
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user preferences'
    });
  }
});

// Update specific preference category
router.patch('/:userId/preferences/:category', authenticateSupabase, async (req, res) => {
  try {
    const { userId, category } = req.params;
    const updates = req.body;
    
    // Ensure user can only update their own preferences (unless admin)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own preferences'
      });
    }
    
    // Validate category
    const validCategories = [
      'buffer_time_settings',
      'timezone_settings',
      'calendar_sync_settings',
      'notification_settings',
      'meeting_preferences'
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid preference category. Must be one of: ${validCategories.join(', ')}`
      });
    }
    
    const supabase = supabaseAdmin();
    
    // Get existing preferences
    const { data: existingPrefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Update specific category
    const updatedPreferences = {
      user_id: userId,
      ...existingPrefs,
      [category]: {
        ...existingPrefs?.[category] || {},
        ...updates
      },
      updated_at: new Date().toISOString()
    };
    
    // Upsert the preferences
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .upsert(updatedPreferences, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      preferences,
      updated_category: category
    });
    
  } catch (error) {
    console.error('Error updating user preference category:', error);
    res.status(500).json({
      success: false,
      error: `Failed to update ${category} preferences`
    });
  }
});

// Admin routes
router.get('/', authenticateSupabase, requireRole(['admin']), (req, res) => {
  res.json({ message: 'List users endpoint - to be implemented' });
});

export default router; 