-- ========================================
-- SUPABASE SCHEMA EXTENSIONS FOR FUTURE ENHANCEMENTS
-- ========================================
-- This file contains additional tables and views to support
-- analytics, audit trails, compliance, and future features.

-- ========================================
-- ANALYTICS TABLES
-- ========================================

-- User analytics tracking
CREATE TABLE IF NOT EXISTS user_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    page_url TEXT,
    referrer TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointment analytics
CREATE TABLE IF NOT EXISTS appointment_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id),
    pharma_id UUID REFERENCES users(id),
    event_type VARCHAR(100) NOT NULL, -- 'booked', 'confirmed', 'completed', 'cancelled', 'no_show'
    duration_minutes INTEGER,
    completion_rating INTEGER CHECK (completion_rating >= 1 AND completion_rating <= 5),
    products_discussed INTEGER DEFAULT 0,
    research_shared INTEGER DEFAULT 0,
    follow_up_scheduled BOOLEAN DEFAULT FALSE,
    revenue_generated DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Research document analytics
CREATE TABLE IF NOT EXISTS research_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    research_id UUID REFERENCES research_documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL, -- 'viewed', 'downloaded', 'shared', 'commented'
    view_duration_seconds INTEGER,
    download_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    engagement_score DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- AUDIT TRAILS FOR COMPLIANCE
-- ========================================

-- Comprehensive audit log
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'user', 'appointment', 'research', 'timeslot'
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data access logs for HIPAA compliance
CREATE TABLE IF NOT EXISTS data_access_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    accessed_user_id UUID REFERENCES users(id), -- User whose data was accessed
    access_type VARCHAR(50) NOT NULL, -- 'view', 'edit', 'delete', 'export'
    data_type VARCHAR(50) NOT NULL, -- 'profile', 'appointment', 'research', 'communication'
    purpose TEXT, -- Purpose of access
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- PAYMENT AND SUBSCRIPTION TABLES
-- ========================================

-- Subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    billing_interval subscription_interval NOT NULL,
    features JSONB NOT NULL,
    max_appointments INTEGER,
    max_storage_mb INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES subscription_plans(id),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    status subscription_status DEFAULT 'active',
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment history
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES user_subscriptions(id),
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- MESSAGING AND COMMUNICATION
-- ========================================

-- Chat conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    participants UUID[] NOT NULL, -- Array of user IDs
    type conversation_type DEFAULT 'appointment',
    title VARCHAR(255),
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type message_type DEFAULT 'text',
    metadata JSONB, -- For file attachments, reactions, etc.
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- PERFORMANCE MONITORING
-- ========================================

-- API performance metrics
CREATE TABLE IF NOT EXISTS api_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    response_time_ms INTEGER NOT NULL,
    status_code INTEGER NOT NULL,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System health metrics
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(12,4) NOT NULL,
    metric_unit VARCHAR(20),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- EMAIL TEMPLATES AND CAMPAIGNS
-- ========================================

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    template_variables JSONB, -- List of available variables
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email delivery log
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID REFERENCES email_templates(id),
    recipient_id UUID REFERENCES users(id),
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status email_status DEFAULT 'sent',
    provider_message_id VARCHAR(255),
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- ENUMS FOR FUTURE FEATURES
-- ========================================

-- Subscription intervals
CREATE TYPE subscription_interval AS ENUM ('monthly', 'yearly', 'quarterly');

-- Subscription status
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'unpaid', 'incomplete');

-- Payment status
CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'cancelled', 'refunded');

-- Conversation types
CREATE TYPE conversation_type AS ENUM ('appointment', 'support', 'general', 'group');

-- Message types
CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'video', 'system');

-- Email status
CREATE TYPE email_status AS ENUM ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed');

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_event ON user_analytics(user_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_doctor ON appointment_analytics(doctor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_research_analytics_action ON research_analytics(research_id, action_type, created_at);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_accessed_user ON data_access_logs(accessed_user_id, created_at);

-- Payment indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON user_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status, created_at);

-- Messaging indexes
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING GIN(participants);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_api_metrics_endpoint_time ON api_metrics(endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time ON system_metrics(metric_name, created_at);

-- ========================================
-- VIEWS FOR ANALYTICS DASHBOARDS
-- ========================================

-- User engagement summary
CREATE OR REPLACE VIEW user_engagement_summary AS
SELECT 
    u.id,
    u.email,
    u.role,
    COUNT(DISTINCT ua.id) as total_events,
    COUNT(DISTINCT CASE WHEN ua.event_type = 'login_success' THEN ua.id END) as login_count,
    COUNT(DISTINCT a.id) as appointment_count,
    COUNT(DISTINCT rd.id) as research_shared_count,
    MAX(ua.created_at) as last_activity,
    u.created_at as registration_date
FROM users u
LEFT JOIN user_analytics ua ON u.id = ua.user_id
LEFT JOIN appointments a ON u.id = a.doctor_id OR u.id = a.pharma_rep_id
LEFT JOIN research_documents rd ON u.id = rd.created_by
GROUP BY u.id, u.email, u.role, u.created_at;

-- Monthly appointment metrics
CREATE OR REPLACE VIEW monthly_appointment_metrics AS
SELECT 
    DATE_TRUNC('month', aa.created_at) as month,
    COUNT(*) as total_appointments,
    COUNT(CASE WHEN aa.event_type = 'completed' THEN 1 END) as completed_appointments,
    COUNT(CASE WHEN aa.event_type = 'cancelled' THEN 1 END) as cancelled_appointments,
    AVG(aa.duration_minutes) as avg_duration_minutes,
    AVG(aa.completion_rating) as avg_rating,
    SUM(aa.revenue_generated) as total_revenue
FROM appointment_analytics aa
GROUP BY DATE_TRUNC('month', aa.created_at)
ORDER BY month DESC;

-- ========================================
-- ROW LEVEL SECURITY POLICIES
-- ========================================

-- Enable RLS on all new tables
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Analytics policies (users can view their own data, admins can view all)
CREATE POLICY user_analytics_policy ON user_analytics
    FOR ALL USING (
        auth.uid() = user_id OR 
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Audit log policies (admins only)
CREATE POLICY audit_logs_admin_policy ON audit_logs
    FOR ALL USING ((SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Subscription policies (users can view their own subscriptions)
CREATE POLICY user_subscriptions_policy ON user_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- Payment policies (users can view their own payments)
CREATE POLICY payments_policy ON payments
    FOR ALL USING (auth.uid() = user_id);

-- Conversation policies (participants can access conversations)
CREATE POLICY conversations_policy ON conversations
    FOR ALL USING (auth.uid() = ANY(participants));

-- Message policies (conversation participants can access messages)
CREATE POLICY messages_policy ON messages
    FOR ALL USING (
        auth.uid() IN (
            SELECT unnest(participants) 
            FROM conversations 
            WHERE id = conversation_id
        )
    );

-- ========================================
-- TRIGGERS FOR AUTOMATIC ANALYTICS TRACKING
-- ========================================

-- Function to log user events
CREATE OR REPLACE FUNCTION log_user_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_analytics (user_id, event_type, event_data)
    VALUES (
        COALESCE(NEW.id, OLD.id),
        TG_ARGV[0],
        jsonb_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'timestamp', NOW()
        )
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for user registration
CREATE TRIGGER user_registration_analytics
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION log_user_event('user_registered');

-- Function to update conversation timestamps
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation when message is added
CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- ========================================
-- INITIAL DATA FOR TESTING
-- ========================================

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, price_cents, billing_interval, features, max_appointments, max_storage_mb) 
VALUES 
    ('Basic', 'Basic plan for small pharma companies', 9900, 'monthly', '["appointments", "research_sharing", "basic_analytics"]', 50, 1024),
    ('Professional', 'Professional plan with advanced features', 19900, 'monthly', '["appointments", "research_sharing", "advanced_analytics", "priority_support", "video_calls"]', 200, 5120),
    ('Enterprise', 'Enterprise plan for large organizations', 49900, 'monthly', '["appointments", "research_sharing", "advanced_analytics", "priority_support", "video_calls", "custom_integrations", "dedicated_support"]', 1000, 20480)
ON CONFLICT DO NOTHING;

-- Insert default email templates
INSERT INTO email_templates (name, subject, html_content, text_content, template_variables)
VALUES 
    ('welcome_email', 'Welcome to Pharmadoc!', '<h1>Welcome {{firstName}}!</h1><p>Thank you for joining Pharmadoc.</p>', 'Welcome {{firstName}}! Thank you for joining Pharmadoc.', '["firstName", "lastName", "role"]'),
    ('appointment_confirmation', 'Appointment Confirmed - {{appointmentDate}}', '<h2>Your appointment is confirmed</h2><p>Date: {{appointmentDate}}</p><p>Doctor: {{doctorName}}</p>', 'Your appointment is confirmed for {{appointmentDate}} with {{doctorName}}.', '["appointmentDate", "doctorName", "pharmaName", "location"]'),
    ('appointment_reminder', 'Reminder: Appointment Tomorrow', '<h2>Appointment Reminder</h2><p>You have an appointment tomorrow at {{time}} with {{doctorName}}.</p>', 'Reminder: You have an appointment tomorrow at {{time}} with {{doctorName}}.', '["time", "doctorName", "pharmaName", "location"]')
ON CONFLICT DO NOTHING; 