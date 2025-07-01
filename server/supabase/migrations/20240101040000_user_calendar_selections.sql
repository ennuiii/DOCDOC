-- Create user_calendar_selections table for managing multiple calendar selections
CREATE TABLE user_calendar_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
    calendar_id VARCHAR(255) NOT NULL,
    calendar_name VARCHAR(255) NOT NULL,
    sync_direction VARCHAR(50) NOT NULL DEFAULT 'bidirectional' CHECK (sync_direction IN ('bidirectional', 'toGoogle', 'fromGoogle')),
    conflict_resolution VARCHAR(50) NOT NULL DEFAULT 'user_choice' CHECK (conflict_resolution IN ('user_choice', 'priority_based', 'time_based', 'automatic')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sync_preferences JSONB DEFAULT '{}',
    calendar_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate calendar selections per user/integration
    UNIQUE(user_id, integration_id, calendar_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_calendar_selections_user_id ON user_calendar_selections(user_id);
CREATE INDEX idx_user_calendar_selections_integration_id ON user_calendar_selections(integration_id);
CREATE INDEX idx_user_calendar_selections_calendar_id ON user_calendar_selections(calendar_id);
CREATE INDEX idx_user_calendar_selections_is_active ON user_calendar_selections(is_active);
CREATE INDEX idx_user_calendar_selections_sync_direction ON user_calendar_selections(sync_direction);

-- Create composite index for common queries
CREATE INDEX idx_user_calendar_selections_user_integration_active 
ON user_calendar_selections(user_id, integration_id, is_active);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_calendar_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_calendar_selections_updated_at
    BEFORE UPDATE ON user_calendar_selections
    FOR EACH ROW
    EXECUTE FUNCTION update_user_calendar_selections_updated_at();

-- Add RLS policies
ALTER TABLE user_calendar_selections ENABLE ROW LEVEL SECURITY;

-- Policy for users to manage their own calendar selections
CREATE POLICY "Users can manage their own calendar selections" ON user_calendar_selections
    FOR ALL USING (user_id = auth.uid());

-- Policy for service role to access all calendar selections
CREATE POLICY "Service role can access all calendar selections" ON user_calendar_selections
    FOR ALL USING (auth.role() = 'service_role');

-- Add sync_logs table for tracking sync operations per calendar
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
    calendar_id VARCHAR(255) NOT NULL,
    sync_type VARCHAR(50) NOT NULL DEFAULT 'incremental' CHECK (sync_type IN ('full', 'incremental', 'manual')),
    sync_direction VARCHAR(50) NOT NULL CHECK (sync_direction IN ('bidirectional', 'toGoogle', 'fromGoogle')),
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled')),
    events_processed INTEGER DEFAULT 0,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_deleted INTEGER DEFAULT 0,
    conflicts_detected INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    sync_metadata JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for sync_logs
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_integration_id ON sync_logs(integration_id);
CREATE INDEX idx_sync_logs_calendar_id ON sync_logs(calendar_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at);
CREATE INDEX idx_sync_logs_user_calendar ON sync_logs(user_id, calendar_id);

-- Create updated_at trigger for sync_logs
CREATE OR REPLACE FUNCTION update_sync_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_logs_updated_at
    BEFORE UPDATE ON sync_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_sync_logs_updated_at();

-- Add RLS policies for sync_logs
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own sync logs
CREATE POLICY "Users can view their own sync logs" ON sync_logs
    FOR SELECT USING (user_id = auth.uid());

-- Policy for service role to access all sync logs
CREATE POLICY "Service role can access all sync logs" ON sync_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE user_calendar_selections IS 'Stores user preferences for which Google calendars to sync';
COMMENT ON COLUMN user_calendar_selections.calendar_id IS 'Google Calendar ID from the calendar API';
COMMENT ON COLUMN user_calendar_selections.sync_direction IS 'Direction of synchronization: bidirectional, toGoogle, or fromGoogle';
COMMENT ON COLUMN user_calendar_selections.conflict_resolution IS 'Strategy for resolving scheduling conflicts';
COMMENT ON COLUMN user_calendar_selections.sync_preferences IS 'Additional sync preferences specific to this calendar';
COMMENT ON COLUMN user_calendar_selections.calendar_metadata IS 'Calendar metadata from Google (color, timezone, etc.)';

COMMENT ON TABLE sync_logs IS 'Logs of synchronization operations for tracking and debugging';
COMMENT ON COLUMN sync_logs.sync_type IS 'Type of sync operation: full, incremental, or manual';
COMMENT ON COLUMN sync_logs.events_processed IS 'Total number of events processed in this sync';
COMMENT ON COLUMN sync_logs.conflicts_detected IS 'Number of scheduling conflicts detected during sync'; 