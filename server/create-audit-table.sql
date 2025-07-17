-- Create integration_audit_logs table for audit logging
CREATE TABLE IF NOT EXISTS integration_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    integration_id UUID,
    provider TEXT,
    event_data JSONB,
    context_data JSONB,
    correlation_id TEXT,
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_user_id ON integration_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_provider ON integration_audit_logs(provider);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_event_type ON integration_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_created_at ON integration_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_correlation_id ON integration_audit_logs(correlation_id);

-- Add RLS policy
ALTER TABLE integration_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own audit logs
CREATE POLICY "Users can view their own audit logs" ON integration_audit_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for service role to insert audit logs
CREATE POLICY "Service role can insert audit logs" ON integration_audit_logs
    FOR INSERT WITH CHECK (true); 