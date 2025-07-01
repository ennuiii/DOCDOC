-- =============================================
-- CLEAN AND SETUP RLS for Pharmadoc
-- This script drops ALL existing policies and creates fresh ones
-- Safe to run multiple times
-- =============================================

-- Enable RLS on all tables (safe to run multiple times)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeslots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- DROP ALL EXISTING POLICIES
-- =============================================

-- Drop all users table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'users'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON users';
    END LOOP;
END $$;

-- Drop all timeslots table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'timeslots'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON timeslots';
    END LOOP;
END $$;

-- Drop all appointments table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'appointments'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON appointments';
    END LOOP;
END $$;

-- Drop all appointment_products table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'appointment_products'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON appointment_products';
    END LOOP;
END $$;

-- Drop all appointment_attachments table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'appointment_attachments'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON appointment_attachments';
    END LOOP;
END $$;

-- Drop all appointment_feedback table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'appointment_feedback'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON appointment_feedback';
    END LOOP;
END $$;

-- Drop all appointment_reminders table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'appointment_reminders'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON appointment_reminders';
    END LOOP;
END $$;

-- Drop all research_documents table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'research_documents'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON research_documents';
    END LOOP;
END $$;

-- Drop all research_shares table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'research_shares'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON research_shares';
    END LOOP;
END $$;

-- Drop all notifications table policies
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'notifications'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON notifications';
    END LOOP;
END $$;

-- =============================================
-- CREATE FRESH POLICIES
-- =============================================

-- ============= USERS TABLE =============
CREATE POLICY "users_select_own" ON users 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users 
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON users 
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_professional_visibility" ON users 
FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND role IN ('doctor', 'pharma')
    AND is_active = true
);

-- ============= TIMESLOTS TABLE =============
CREATE POLICY "timeslots_doctor_manage" ON timeslots 
FOR ALL USING (auth.uid() = doctor_id);

CREATE POLICY "timeslots_view_available" ON timeslots 
FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND status = 'available'
);

-- ============= APPOINTMENTS TABLE =============
CREATE POLICY "appointments_participants_access" ON appointments 
FOR ALL USING (
    auth.uid() = doctor_id 
    OR auth.uid() = pharma_rep_id
);

-- ============= APPOINTMENT PRODUCTS =============
CREATE POLICY "appointment_products_access" ON appointment_products 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_products.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- ============= APPOINTMENT ATTACHMENTS =============
CREATE POLICY "appointment_attachments_access" ON appointment_attachments 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_attachments.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- ============= APPOINTMENT FEEDBACK =============
CREATE POLICY "appointment_feedback_access" ON appointment_feedback 
FOR ALL USING (
    auth.uid() = submitted_by_id
    OR EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_feedback.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- ============= APPOINTMENT REMINDERS =============
CREATE POLICY "appointment_reminders_access" ON appointment_reminders 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_reminders.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- ============= RESEARCH DOCUMENTS =============
CREATE POLICY "research_documents_owner_access" ON research_documents 
FOR ALL USING (auth.uid() = uploaded_by_id);

CREATE POLICY "research_documents_public_view" ON research_documents 
FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND is_public = true
);

CREATE POLICY "research_documents_shared_view" ON research_documents 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM research_shares 
        WHERE research_shares.research_id = research_documents.id 
        AND research_shares.doctor_id = auth.uid()
    )
);

-- ============= RESEARCH SHARES =============
CREATE POLICY "research_shares_owner_manage" ON research_shares 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM research_documents 
        WHERE research_documents.id = research_shares.research_id 
        AND research_documents.uploaded_by_id = auth.uid()
    )
);

CREATE POLICY "research_shares_recipient_view" ON research_shares 
FOR SELECT USING (auth.uid() = doctor_id);

-- ============= NOTIFICATIONS =============
CREATE POLICY "notifications_recipient_access" ON notifications 
FOR ALL USING (auth.uid() = recipient_id);

CREATE POLICY "notifications_system_insert" ON notifications 
FOR INSERT WITH CHECK (true);

-- =============================================
-- VERIFICATION
-- =============================================

-- Show RLS status for all tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as "RLS_Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'users', 'timeslots', 'appointments', 'appointment_products', 
        'appointment_attachments', 'appointment_feedback', 'appointment_reminders',
        'research_documents', 'research_shares', 'notifications'
    )
ORDER BY tablename;

-- Show all policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Summary message
SELECT 'RLS policies have been successfully created! You should now be able to log in.' as "Status"; 