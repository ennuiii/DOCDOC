-- Create webhook_channels table for Google Calendar push notifications
CREATE TABLE webhook_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
    channel_id VARCHAR(255) NOT NULL UNIQUE,
    calendar_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,
    expiration_time TIMESTAMPTZ NOT NULL,
    webhook_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_webhook_channels_integration_id ON webhook_channels(integration_id);
CREATE INDEX idx_webhook_channels_channel_id ON webhook_channels(channel_id);
CREATE INDEX idx_webhook_channels_calendar_id ON webhook_channels(calendar_id);
CREATE INDEX idx_webhook_channels_status ON webhook_channels(status);
CREATE INDEX idx_webhook_channels_expiration_time ON webhook_channels(expiration_time);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_webhook_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_webhook_channels_updated_at
    BEFORE UPDATE ON webhook_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_channels_updated_at();

-- Add RLS policies
ALTER TABLE webhook_channels ENABLE ROW LEVEL SECURITY;

-- Policy for users to manage their own webhook channels
CREATE POLICY "Users can manage their own webhook channels" ON webhook_channels
    FOR ALL USING (
        integration_id IN (
            SELECT id FROM user_integrations 
            WHERE user_id = auth.uid()
        )
    );

-- Policy for service role to access all webhook channels
CREATE POLICY "Service role can access all webhook channels" ON webhook_channels
    FOR ALL USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE webhook_channels IS 'Stores Google Calendar webhook channel information for real-time synchronization';
COMMENT ON COLUMN webhook_channels.channel_id IS 'Unique channel ID generated for Google Calendar webhook';
COMMENT ON COLUMN webhook_channels.calendar_id IS 'Google Calendar ID being watched';
COMMENT ON COLUMN webhook_channels.resource_id IS 'Resource ID returned by Google Calendar API';
COMMENT ON COLUMN webhook_channels.expiration_time IS 'When the webhook channel expires';
COMMENT ON COLUMN webhook_channels.status IS 'Channel status: active, stopped, expired, calendar_deleted'; 