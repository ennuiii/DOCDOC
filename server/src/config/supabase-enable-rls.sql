-- =============================================
-- Enable Row Level Security (RLS) for Pharmadoc
-- This script enables RLS and creates comprehensive policies
-- =============================================

-- First, enable RLS on all tables
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
-- Drop existing policies (if any) to start fresh
-- =============================================

-- Users table policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "users_select_own" ON users;
    DROP POLICY IF EXISTS "users_insert_own" ON users;
    DROP POLICY IF EXISTS "users_update_own" ON users;
    DROP POLICY IF EXISTS "users_professional_visibility" ON users;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Timeslots table policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "timeslots_doctor_manage" ON timeslots;
    DROP POLICY IF EXISTS "timeslots_public_view_available" ON timeslots;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Appointments table policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "appointments_participants_access" ON appointments;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Appointment related table policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "appointment_products_participants_access" ON appointment_products;
    DROP POLICY IF EXISTS "appointment_attachments_participants_access" ON appointment_attachments;
    DROP POLICY IF EXISTS "appointment_feedback_participants_access" ON appointment_feedback;
    DROP POLICY IF EXISTS "appointment_reminders_participants_access" ON appointment_reminders;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Research table policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "research_documents_owner_access" ON research_documents;
    DROP POLICY IF EXISTS "research_documents_public_view" ON research_documents;
    DROP POLICY IF EXISTS "research_documents_shared_view" ON research_documents;
    DROP POLICY IF EXISTS "research_shares_owner_manage" ON research_shares;
    DROP POLICY IF EXISTS "research_shares_recipient_view" ON research_shares;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Notifications table policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "notifications_recipient_access" ON notifications;
    DROP POLICY IF EXISTS "notifications_system_insert" ON notifications;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =============================================
-- USERS TABLE POLICIES
-- =============================================

-- Allow users to select their own profile
CREATE POLICY "users_select_own" ON users 
FOR SELECT 
USING (auth.uid() = id);

-- Allow users to insert their own profile during registration
CREATE POLICY "users_insert_own" ON users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "users_update_own" ON users 
FOR UPDATE 
USING (auth.uid() = id);

-- Allow authenticated users to view other professionals (for appointments/research)
-- This allows doctors and pharma reps to see each other's basic info
CREATE POLICY "users_professional_visibility" ON users 
FOR SELECT 
USING (
    auth.uid() IS NOT NULL 
    AND role IN ('doctor', 'pharma')
    AND is_active = true
);

-- =============================================
-- TIMESLOTS TABLE POLICIES
-- =============================================

-- Doctors can manage their own timeslots (all operations)
CREATE POLICY "timeslots_doctor_manage" ON timeslots 
FOR ALL 
USING (auth.uid() = doctor_id);

-- Authenticated users can view available timeslots for booking
CREATE POLICY "timeslots_public_view_available" ON timeslots 
FOR SELECT 
USING (
    auth.uid() IS NOT NULL 
    AND status = 'available'
);

-- =============================================
-- APPOINTMENTS TABLE POLICIES
-- =============================================

-- Both doctor and pharma rep can access appointments they're involved in
CREATE POLICY "appointments_participants_access" ON appointments 
FOR ALL 
USING (
    auth.uid() = doctor_id 
    OR auth.uid() = pharma_rep_id
);

-- =============================================
-- APPOINTMENT RELATED TABLES POLICIES
-- =============================================

-- Appointment products: accessible to appointment participants
CREATE POLICY "appointment_products_participants_access" ON appointment_products 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_products.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- Appointment attachments: accessible to appointment participants
CREATE POLICY "appointment_attachments_participants_access" ON appointment_attachments 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_attachments.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- Appointment feedback: accessible to appointment participants and feedback author
CREATE POLICY "appointment_feedback_participants_access" ON appointment_feedback 
FOR ALL 
USING (
    auth.uid() = submitted_by_id
    OR EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_feedback.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- Appointment reminders: accessible to appointment participants
CREATE POLICY "appointment_reminders_participants_access" ON appointment_reminders 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_reminders.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- =============================================
-- RESEARCH DOCUMENTS TABLE POLICIES
-- =============================================

-- Document owners can manage their own documents (all operations)
CREATE POLICY "research_documents_owner_access" ON research_documents 
FOR ALL 
USING (auth.uid() = uploaded_by_id);

-- Authenticated users can view public documents
CREATE POLICY "research_documents_public_view" ON research_documents 
FOR SELECT 
USING (
    auth.uid() IS NOT NULL 
    AND is_public = true
);

-- Users can view documents shared with them
CREATE POLICY "research_documents_shared_view" ON research_documents 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM research_shares 
        WHERE research_shares.research_id = research_documents.id 
        AND research_shares.doctor_id = auth.uid()
    )
);

-- =============================================
-- RESEARCH SHARES TABLE POLICIES
-- =============================================

-- Document owners can manage shares of their documents
CREATE POLICY "research_shares_owner_manage" ON research_shares 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM research_documents 
        WHERE research_documents.id = research_shares.research_id 
        AND research_documents.uploaded_by_id = auth.uid()
    )
);

-- Recipients can view their shares (read-only)
CREATE POLICY "research_shares_recipient_view" ON research_shares 
FOR SELECT 
USING (auth.uid() = doctor_id);

-- =============================================
-- NOTIFICATIONS TABLE POLICIES
-- =============================================

-- Users can access their own notifications
CREATE POLICY "notifications_recipient_access" ON notifications 
FOR ALL 
USING (auth.uid() = recipient_id);

-- Allow system to create notifications (for triggers and automated processes)
-- This policy allows INSERT operations without a specific user context
CREATE POLICY "notifications_system_insert" ON notifications 
FOR INSERT 
WITH CHECK (true);

-- =============================================
-- VERIFY RLS IS ENABLED
-- =============================================

-- Query to verify RLS is enabled on all tables
SELECT 
    schemaname,
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'users', 'timeslots', 'appointments', 'appointment_products', 
        'appointment_attachments', 'appointment_feedback', 'appointment_reminders',
        'research_documents', 'research_shares', 'notifications'
    )
ORDER BY tablename;

-- Query to verify policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname; 