-- Research Real-time Setup and Migration
-- This script adds the missing notification type and ensures research real-time functionality

-- 1. Add the new 'research-unshared' notification type to the ENUM
ALTER TYPE notification_type ADD VALUE 'research-unshared';

-- 2. Ensure Row Level Security is enabled on research tables
ALTER TABLE research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 3. Enable real-time for research tables
-- This allows Supabase to send real-time updates when research data changes
ALTER PUBLICATION supabase_realtime ADD TABLE research_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE research_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 4. Ensure proper indexes exist for real-time performance
-- (These should already exist from main schema, but ensuring they're there)
CREATE INDEX IF NOT EXISTS idx_research_documents_uploaded_by ON research_documents(uploaded_by_id, created_at);
CREATE INDEX IF NOT EXISTS idx_research_shares_doctor ON research_shares(doctor_id);
CREATE INDEX IF NOT EXISTS idx_research_shares_research ON research_shares(research_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id, read, created_at);

-- 5. Add a search index for research documents (if not exists)
CREATE INDEX IF NOT EXISTS idx_research_search ON research_documents USING GIN(to_tsvector('english', title || ' ' || description));

-- 6. Ensure the column name is correct for notifications
-- Check if 'read' column exists, if not, it might be 'is_read'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='notifications' AND column_name='read') THEN
        -- Add 'read' column if it doesn't exist (our controller expects this name)
        ALTER TABLE notifications ADD COLUMN read BOOLEAN DEFAULT false;
        -- Copy data from 'is_read' if it exists
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='notifications' AND column_name='is_read') THEN
            UPDATE notifications SET read = is_read;
        END IF;
    END IF;
END $$;

-- 7. Add missing columns to notifications if they don't exist
-- Our controller expects these exact column names
ALTER TABLE notifications 
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS priority notification_priority DEFAULT 'medium';

-- 8. Create a function to notify frontend about research changes
CREATE OR REPLACE FUNCTION notify_research_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify about research document changes
    IF TG_TABLE_NAME = 'research_documents' THEN
        PERFORM pg_notify('research_documents_changes', 
            json_build_object(
                'type', TG_OP,
                'id', COALESCE(NEW.id, OLD.id),
                'uploaded_by_id', COALESCE(NEW.uploaded_by_id, OLD.uploaded_by_id)
            )::text
        );
    END IF;
    
    -- Notify about research sharing changes
    IF TG_TABLE_NAME = 'research_shares' THEN
        PERFORM pg_notify('research_shares_changes', 
            json_build_object(
                'type', TG_OP,
                'research_id', COALESCE(NEW.research_id, OLD.research_id),
                'doctor_id', COALESCE(NEW.doctor_id, OLD.doctor_id)
            )::text
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 9. Create triggers for real-time notifications
DROP TRIGGER IF EXISTS research_documents_notify ON research_documents;
CREATE TRIGGER research_documents_notify
    AFTER INSERT OR UPDATE OR DELETE ON research_documents
    FOR EACH ROW EXECUTE FUNCTION notify_research_changes();

DROP TRIGGER IF EXISTS research_shares_notify ON research_shares;
CREATE TRIGGER research_shares_notify
    AFTER INSERT OR UPDATE OR DELETE ON research_shares
    FOR EACH ROW EXECUTE FUNCTION notify_research_changes();

-- 10. Drop existing policies and recreate them to ensure they're correct
-- Research documents policies
DROP POLICY IF EXISTS research_owner_access ON research_documents;
DROP POLICY IF EXISTS research_public_view ON research_documents;
DROP POLICY IF EXISTS research_shared_access ON research_documents;

CREATE POLICY research_owner_access ON research_documents FOR ALL 
USING (uploaded_by_id = auth.uid());

CREATE POLICY research_public_view ON research_documents FOR SELECT 
USING (is_public = true AND auth.uid() IS NOT NULL);

CREATE POLICY research_shared_access ON research_documents FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM research_shares 
        WHERE research_id = research_documents.id 
        AND doctor_id = auth.uid()
    )
);

-- Research shares policies
DROP POLICY IF EXISTS research_shares_owner ON research_shares;
DROP POLICY IF EXISTS research_shares_recipient ON research_shares;

CREATE POLICY research_shares_owner ON research_shares FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM research_documents 
        WHERE id = research_shares.research_id 
        AND uploaded_by_id = auth.uid()
    )
);

CREATE POLICY research_shares_recipient ON research_shares FOR SELECT 
USING (doctor_id = auth.uid());

-- Notifications policies
DROP POLICY IF EXISTS notifications_recipient ON notifications;
DROP POLICY IF EXISTS notifications_system_insert ON notifications;

CREATE POLICY notifications_recipient ON notifications FOR ALL 
USING (recipient_id = auth.uid());

CREATE POLICY notifications_system_insert ON notifications FOR INSERT 
WITH CHECK (true);

-- 11. Grant necessary permissions for real-time subscriptions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON research_documents TO anon, authenticated;
GRANT SELECT ON research_shares TO anon, authenticated;
GRANT SELECT ON notifications TO anon, authenticated;

-- Success message
SELECT 'Research real-time setup completed successfully! ✅' as status; 