-- Pharmadoc Integrations RLS (Row Level Security) Policies
-- Ensures secure access to integration data based on user ownership and permissions

-- ========================================
-- ENABLE RLS ON ALL INTEGRATION TABLES
-- ========================================

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

-- ========================================
-- USER INTEGRATIONS POLICIES
-- ========================================

-- Users can view and manage their own integrations
CREATE POLICY "Users can view their own integrations" ON user_integrations
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own integrations" ON user_integrations
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own integrations" ON user_integrations
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own integrations" ON user_integrations
    FOR DELETE
    USING (user_id = auth.uid());

-- Admin users can manage all integrations
CREATE POLICY "Admins can manage all integrations" ON user_integrations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ========================================
-- CALENDAR EVENTS POLICIES
-- ========================================

-- Users can view calendar events for their own integrations
CREATE POLICY "Users can view their calendar events" ON calendar_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = calendar_events.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- Users can insert calendar events for their own integrations
CREATE POLICY "Users can insert their calendar events" ON calendar_events
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = calendar_events.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- Users can update calendar events for their own integrations
CREATE POLICY "Users can update their calendar events" ON calendar_events
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = calendar_events.integration_id 
            AND ui.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = calendar_events.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- Users can delete calendar events for their own integrations
CREATE POLICY "Users can delete their calendar events" ON calendar_events
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = calendar_events.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- Doctors and pharma reps can view calendar events for their appointments
CREATE POLICY "Users can view calendar events for their appointments" ON calendar_events
    FOR SELECT
    USING (
        appointment_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM appointments a 
            WHERE a.id = calendar_events.appointment_id 
            AND (a.doctor_id = auth.uid() OR a.pharma_rep_id = auth.uid())
        )
    );

-- ========================================
-- MEETING INTEGRATIONS POLICIES
-- ========================================

-- Users can view meeting integrations for their appointments
CREATE POLICY "Users can view meeting integrations for their appointments" ON meeting_integrations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM appointments a 
            WHERE a.id = meeting_integrations.appointment_id 
            AND (a.doctor_id = auth.uid() OR a.pharma_rep_id = auth.uid())
        )
    );

-- Users can insert meeting integrations for their appointments
CREATE POLICY "Users can insert meeting integrations for their appointments" ON meeting_integrations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM appointments a 
            WHERE a.id = meeting_integrations.appointment_id 
            AND (a.doctor_id = auth.uid() OR a.pharma_rep_id = auth.uid())
        ) AND
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = meeting_integrations.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- Users can update meeting integrations for their appointments
CREATE POLICY "Users can update meeting integrations for their appointments" ON meeting_integrations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM appointments a 
            WHERE a.id = meeting_integrations.appointment_id 
            AND (a.doctor_id = auth.uid() OR a.pharma_rep_id = auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM appointments a 
            WHERE a.id = meeting_integrations.appointment_id 
            AND (a.doctor_id = auth.uid() OR a.pharma_rep_id = auth.uid())
        )
    );

-- Only meeting creators can delete meeting integrations
CREATE POLICY "Users can delete meeting integrations for their appointments" ON meeting_integrations
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM appointments a 
            WHERE a.id = meeting_integrations.appointment_id 
            AND (a.doctor_id = auth.uid() OR a.pharma_rep_id = auth.uid())
        ) AND
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = meeting_integrations.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- ========================================
-- INTEGRATION WEBHOOKS POLICIES
-- ========================================

-- Users can view webhooks for their integrations
CREATE POLICY "Users can view their integration webhooks" ON integration_webhooks
    FOR SELECT
    USING (
        integration_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = integration_webhooks.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- System can insert webhooks (for webhook processing)
CREATE POLICY "System can insert webhooks" ON integration_webhooks
    FOR INSERT
    WITH CHECK (true); -- Allow system to insert webhooks

-- Users can update webhook processing status for their integrations
CREATE POLICY "Users can update their integration webhooks" ON integration_webhooks
    FOR UPDATE
    USING (
        integration_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_integrations ui 
            WHERE ui.id = integration_webhooks.integration_id 
            AND ui.user_id = auth.uid()
        )
    );

-- System and users can delete old webhooks
CREATE POLICY "Allow webhook cleanup" ON integration_webhooks
    FOR DELETE
    USING (
        -- Allow deletion of old processed webhooks (older than 30 days)
        (processed = true AND created_at < NOW() - INTERVAL '30 days') OR
        -- Allow users to delete webhooks for their integrations
        (integration_id IS NOT NULL AND
         EXISTS (
             SELECT 1 FROM user_integrations ui 
             WHERE ui.id = integration_webhooks.integration_id 
             AND ui.user_id = auth.uid()
         ))
    );

-- Admin users can manage all webhooks
CREATE POLICY "Admins can manage all webhooks" ON integration_webhooks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ========================================
-- APPOINTMENTS TABLE EXTENSIONS
-- ========================================

-- Note: Appointments table already has RLS policies
-- The new columns we added (video_provider, calendar_sync_status, etc.) 
-- will automatically inherit the existing RLS policies

-- ========================================
-- ADDITIONAL SECURITY POLICIES
-- ========================================

-- Service role bypasses for system operations
CREATE POLICY "Service role bypass for user_integrations" ON user_integrations
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role bypass for calendar_events" ON calendar_events
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role bypass for meeting_integrations" ON meeting_integrations
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role bypass for integration_webhooks" ON integration_webhooks
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ========================================
-- REALTIME SUBSCRIPTIONS SETUP
-- ========================================

-- Enable realtime for integration tables
ALTER PUBLICATION supabase_realtime ADD TABLE user_integrations;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_integrations;
ALTER PUBLICATION supabase_realtime ADD TABLE integration_webhooks;

-- ========================================
-- COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON TABLE user_integrations IS 'Stores OAuth integration connections for each user with external providers (Google, Microsoft, Zoom, CalDAV)';
COMMENT ON TABLE calendar_events IS 'Tracks calendar events synchronized from external providers, linked to appointments when applicable';
COMMENT ON TABLE meeting_integrations IS 'Manages video meeting integrations for appointments with external meeting providers';
COMMENT ON TABLE integration_webhooks IS 'Processes incoming webhooks from external providers for real-time synchronization';

COMMENT ON COLUMN user_integrations.access_token IS 'OAuth access token - should be encrypted in production';
COMMENT ON COLUMN user_integrations.refresh_token IS 'OAuth refresh token - should be encrypted in production';
COMMENT ON COLUMN user_integrations.config IS 'Provider-specific configuration (calendars to sync, meeting preferences, etc.)';
COMMENT ON COLUMN calendar_events.etag IS 'Entity tag for optimistic concurrency control during synchronization';
COMMENT ON COLUMN calendar_events.recurrence_rule IS 'RFC 5545 RRULE for recurring events';
COMMENT ON COLUMN meeting_integrations.host_key IS 'Host key for meeting control (Zoom host key, etc.)';
COMMENT ON COLUMN integration_webhooks.retry_count IS 'Number of processing attempts for failed webhooks (max 5)'; 