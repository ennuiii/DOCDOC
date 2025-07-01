-- Create user_preferences table for storing user-specific settings
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Buffer time settings
    buffer_time_settings JSONB DEFAULT '{
        "beforeAppointment": 15,
        "afterAppointment": 15,
        "enableSmartBuffering": true,
        "respectCalendarBuffers": true,
        "minimumBufferTime": 5,
        "maximumBufferTime": 60,
        "bufferTimeStrategy": "fixed",
        "adaptiveFactors": {
            "appointmentDuration": true,
            "appointmentType": true,
            "providerPreferences": true,
            "timeOfDay": true
        },
        "overrideSettings": {
            "allowUserOverride": true,
            "allowProviderOverride": true,
            "requireApproval": false
        },
        "appointmentTypeOverrides": {
            "consultation": {"before": 10, "after": 10},
            "procedure": {"before": 30, "after": 20},
            "surgery": {"before": 60, "after": 30},
            "emergency": {"before": 5, "after": 5},
            "follow-up": {"before": 10, "after": 10},
            "telemedicine": {"before": 5, "after": 5}
        }
    }',
    
    -- Timezone settings
    timezone_settings JSONB DEFAULT '{
        "timezone": "UTC",
        "autoDetect": true,
        "use24HourFormat": true,
        "showTimezoneInDates": true,
        "dstNotifications": true,
        "preferredDateFormat": "YYYY-MM-DD",
        "preferredTimeFormat": "HH:mm"
    }',
    
    -- Calendar sync settings
    calendar_sync_settings JSONB DEFAULT '{
        "syncPrimaryCalendar": true,
        "syncSecondaryCalendars": false,
        "excludeReadOnlyCalendars": true,
        "syncDirection": "bidirectional",
        "conflictResolution": "user_choice",
        "autoSelectNewCalendars": false
    }',
    
    -- Notification preferences
    notification_settings JSONB DEFAULT '{
        "appointmentReminders": true,
        "calendarSync": true,
        "conflictAlerts": true,
        "weeklyDigest": true,
        "emailNotifications": true,
        "pushNotifications": true,
        "smsNotifications": false
    }',
    
    -- Meeting preferences
    meeting_preferences JSONB DEFAULT '{
        "defaultMeetingType": "virtual",
        "autoGenerateMeetingLinks": true,
        "defaultMeetingDuration": 30,
        "enableWaitingRoom": true,
        "recordMeetings": false,
        "muteParticipantsOnJoin": true
    }',
    
    -- Legacy preferences field (for backward compatibility)
    preferences JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint to ensure one preferences record per user
    UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_updated_at();

-- Add RLS policies
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy for users to manage their own preferences
CREATE POLICY "Users can manage their own preferences" ON user_preferences
    FOR ALL USING (user_id = auth.uid());

-- Policy for service role to access all preferences
CREATE POLICY "Service role can access all preferences" ON user_preferences
    FOR ALL USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE user_preferences IS 'Stores user-specific preferences and settings for calendar integration, buffer times, and other customizations';
COMMENT ON COLUMN user_preferences.buffer_time_settings IS 'Buffer time configuration including strategies, durations, and overrides';
COMMENT ON COLUMN user_preferences.timezone_settings IS 'Timezone preferences including format settings and auto-detection';
COMMENT ON COLUMN user_preferences.calendar_sync_settings IS 'Calendar synchronization preferences and conflict resolution settings';
COMMENT ON COLUMN user_preferences.notification_settings IS 'User notification preferences for various types of alerts';
COMMENT ON COLUMN user_preferences.meeting_preferences IS 'Default meeting settings and virtual meeting preferences';
COMMENT ON COLUMN user_preferences.preferences IS 'Legacy preferences field maintained for backward compatibility'; 