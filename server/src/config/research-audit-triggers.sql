-- Triggers for Research Document Audit Logging
-- These triggers automatically log various actions on research documents

-- Function to increment view count and log views
CREATE OR REPLACE FUNCTION log_research_document_view()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment view count
    UPDATE research_documents 
    SET views = COALESCE(views, 0) + 1 
    WHERE id = NEW.resource_id::uuid;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically log view tracking when audit_logs are inserted with action='view'
CREATE TRIGGER trigger_research_view_count
    AFTER INSERT ON audit_logs
    FOR EACH ROW
    WHEN (NEW.action = 'view' AND NEW.resource_type = 'research_document')
    EXECUTE FUNCTION log_research_document_view();

-- Function to automatically log research document access for analytics
CREATE OR REPLACE FUNCTION track_research_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert access tracking record
    INSERT INTO research_access_logs (
        research_id,
        user_id,
        access_type,
        ip_address,
        user_agent,
        accessed_at
    ) VALUES (
        OLD.id,
        auth.uid(),
        CASE 
            WHEN TG_OP = 'UPDATE' AND OLD.downloads != NEW.downloads THEN 'download'
            WHEN TG_OP = 'UPDATE' AND OLD.views != NEW.views THEN 'view'
            ELSE 'access'
        END,
        current_setting('request.headers', true)::json->>'x-real-ip',
        current_setting('request.headers', true)::json->>'user-agent',
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to track research document access
CREATE TRIGGER trigger_research_access_tracking
    AFTER UPDATE OF views, downloads ON research_documents
    FOR EACH ROW
    WHEN (OLD.views IS DISTINCT FROM NEW.views OR OLD.downloads IS DISTINCT FROM NEW.downloads)
    EXECUTE FUNCTION track_research_access();

-- Function to automatically create notifications for research sharing
CREATE OR REPLACE FUNCTION notify_research_share()
RETURNS TRIGGER AS $$
DECLARE
    doc_title TEXT;
    sharer_name TEXT;
BEGIN
    -- Get document title and sharer name
    SELECT rd.title, u.full_name
    INTO doc_title, sharer_name
    FROM research_documents rd
    JOIN users u ON rd.uploaded_by_id = u.id
    WHERE rd.id = NEW.research_id;
    
    -- Create notification for the doctor being shared with
    INSERT INTO notifications (
        recipient_id,
        type,
        title,
        message,
        data,
        priority
    ) VALUES (
        NEW.doctor_id,
        'research-shared',
        'New Research Document Shared',
        FORMAT('"%s" has shared a research document "%s" with you.', sharer_name, doc_title),
        jsonb_build_object(
            'research_id', NEW.research_id,
            'research_title', doc_title,
            'shared_by', NEW.research_id,
            'access_level', NEW.access_level
        ),
        'medium'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create notifications when research is shared
CREATE TRIGGER trigger_research_share_notification
    AFTER INSERT ON research_shares
    FOR EACH ROW
    EXECUTE FUNCTION notify_research_share();

-- Function to log research document lifecycle events
CREATE OR REPLACE FUNCTION log_research_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    action_type TEXT;
    audit_details JSONB;
BEGIN
    -- Determine action type
    action_type := CASE TG_OP
        WHEN 'INSERT' THEN 'created'
        WHEN 'UPDATE' THEN 'updated'
        WHEN 'DELETE' THEN 'deleted'
    END;
    
    -- Build audit details
    audit_details := jsonb_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'timestamp', NOW(),
        'user_id', auth.uid()
    );
    
    -- Add old and new values for updates
    IF TG_OP = 'UPDATE' THEN
        audit_details := audit_details || jsonb_build_object(
            'old_values', to_jsonb(OLD),
            'new_values', to_jsonb(NEW),
            'changed_fields', (
                SELECT jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val))
                FROM jsonb_each(to_jsonb(OLD)) old_record(key, old_val)
                JOIN jsonb_each(to_jsonb(NEW)) new_record(key, new_val) ON old_record.key = new_record.key
                WHERE old_val IS DISTINCT FROM new_val
            )
        );
    ELSIF TG_OP = 'DELETE' THEN
        audit_details := audit_details || jsonb_build_object('deleted_record', to_jsonb(OLD));
    ELSE
        audit_details := audit_details || jsonb_build_object('new_record', to_jsonb(NEW));
    END IF;
    
    -- Insert audit log
    INSERT INTO audit_logs (
        action,
        resource_type,
        resource_id,
        details,
        created_at
    ) VALUES (
        action_type,
        'research_document',
        COALESCE(NEW.id, OLD.id)::text,
        audit_details,
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to log all research document lifecycle events
CREATE TRIGGER trigger_research_lifecycle_audit
    AFTER INSERT OR UPDATE OR DELETE ON research_documents
    FOR EACH ROW
    EXECUTE FUNCTION log_research_lifecycle();

-- Function to validate file access permissions
CREATE OR REPLACE FUNCTION validate_file_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if user has permission to access this file
    IF NOT EXISTS (
        SELECT 1 FROM research_documents rd
        LEFT JOIN research_shares rs ON rd.id = rs.research_id
        WHERE rd.id = NEW.resource_id::uuid
        AND (
            rd.uploaded_by_id = auth.uid() OR  -- Owner access
            rd.is_public = true OR             -- Public access
            rs.doctor_id = auth.uid()          -- Shared access
        )
    ) THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to access this research document';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate file access on audit log creation
CREATE TRIGGER trigger_validate_research_access
    BEFORE INSERT ON audit_logs
    FOR EACH ROW
    WHEN (NEW.resource_type = 'research_document' AND NEW.action IN ('view', 'download'))
    EXECUTE FUNCTION validate_file_access();

-- Create indexes for better performance on audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_research_documents 
ON audit_logs(resource_type, resource_id, created_at) 
WHERE resource_type = 'research_document';

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_actions 
ON audit_logs(details->>'accessed_by', action, created_at) 
WHERE resource_type = 'research_document';

CREATE INDEX IF NOT EXISTS idx_research_access_logs_user_time 
ON research_access_logs(user_id, accessed_at);

CREATE INDEX IF NOT EXISTS idx_research_access_logs_document_time 
ON research_access_logs(research_id, accessed_at);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT SELECT, UPDATE ON research_documents TO authenticated;
GRANT SELECT, INSERT ON notifications TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION log_research_document_view() IS 'Automatically increments view count when research documents are viewed';
COMMENT ON FUNCTION track_research_access() IS 'Tracks detailed access patterns for analytics';
COMMENT ON FUNCTION notify_research_share() IS 'Creates notifications when research documents are shared';
COMMENT ON FUNCTION log_research_lifecycle() IS 'Comprehensive audit logging for all research document operations';
COMMENT ON FUNCTION validate_file_access() IS 'Validates user permissions before logging access events'; 