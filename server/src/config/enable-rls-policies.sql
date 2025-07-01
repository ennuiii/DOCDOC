-- =============================================
-- Enable Row Level Security (RLS) for Pharmadoc
-- This script enables RLS and creates comprehensive policies
-- Run this in your Supabase SQL editor
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

-- =============================================
-- USERS TABLE POLICIES (CRITICAL FOR LOGIN)
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

-- Doctors can manage their own timeslots
CREATE POLICY "timeslots_doctor_manage" ON timeslots 
FOR ALL 
USING (auth.uid() = doctor_id);

-- Authenticated users can view available timeslots
CREATE POLICY "timeslots_view_available" ON timeslots 
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
-- APPOINTMENT RELATED TABLES
-- =============================================

-- Appointment products
CREATE POLICY "appointment_products_access" ON appointment_products 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_products.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- Appointment attachments
CREATE POLICY "appointment_attachments_access" ON appointment_attachments 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_attachments.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- Appointment feedback
CREATE POLICY "appointment_feedback_access" ON appointment_feedback 
FOR ALL 
USING (
    auth.uid() = submitted_by_id
    OR EXISTS (
        SELECT 1 FROM appointments 
        WHERE appointments.id = appointment_feedback.appointment_id 
        AND (appointments.doctor_id = auth.uid() OR appointments.pharma_rep_id = auth.uid())
    )
);

-- Appointment reminders
CREATE POLICY "appointment_reminders_access" ON appointment_reminders 
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

-- Document owners can manage their own documents
CREATE POLICY "research_documents_owner_access" ON research_documents 
FOR ALL 
USING (auth.uid() = uploaded_by_id);

-- Public documents are viewable by authenticated users
CREATE POLICY "research_documents_public_view" ON research_documents 
FOR SELECT 
USING (
    auth.uid() IS NOT NULL 
    AND is_public = true
);

-- Shared documents are viewable by recipients
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

-- Document owners can manage shares
CREATE POLICY "research_shares_owner_manage" ON research_shares 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM research_documents 
        WHERE research_documents.id = research_shares.research_id 
        AND research_documents.uploaded_by_id = auth.uid()
    )
);

-- Recipients can view their shares
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

-- Allow system to create notifications
CREATE POLICY "notifications_system_insert" ON notifications 
FOR INSERT 
WITH CHECK (true);

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Verify RLS is enabled
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

-- Verify policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname; 