-- Fixed Row Level Security (RLS) policies for Pharmadoc
-- These policies avoid infinite recursion while allowing registration

-- Drop ALL existing policies to start completely fresh
-- Users table policies
DROP POLICY IF EXISTS users_own_data ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_admin_access ON users;
DROP POLICY IF EXISTS users_professional_visibility ON users;
DROP POLICY IF EXISTS users_public_visibility ON users;

-- Timeslots table policies
DROP POLICY IF EXISTS timeslots_doctor_access ON timeslots;
DROP POLICY IF EXISTS timeslots_doctor_own ON timeslots;
DROP POLICY IF EXISTS timeslots_staff_access ON timeslots;
DROP POLICY IF EXISTS timeslots_pharma_view ON timeslots;
DROP POLICY IF EXISTS timeslots_admin_access ON timeslots;
DROP POLICY IF EXISTS timeslots_access ON timeslots;

-- Appointments table policies
DROP POLICY IF EXISTS appointments_access ON appointments;
DROP POLICY IF EXISTS appointments_participants ON appointments;
DROP POLICY IF EXISTS appointments_staff_access ON appointments;
DROP POLICY IF EXISTS appointments_admin_access ON appointments;

-- Appointment products policies
DROP POLICY IF EXISTS appointment_products_access ON appointment_products;

-- Appointment attachments policies
DROP POLICY IF EXISTS appointment_attachments_access ON appointment_attachments;

-- Appointment feedback policies
DROP POLICY IF EXISTS appointment_feedback_access ON appointment_feedback;

-- Appointment reminders policies
DROP POLICY IF EXISTS appointment_reminders_access ON appointment_reminders;

-- Research documents policies
DROP POLICY IF EXISTS research_access ON research_documents;
DROP POLICY IF EXISTS research_owner_access ON research_documents;
DROP POLICY IF EXISTS research_public_view ON research_documents;
DROP POLICY IF EXISTS research_shared_access ON research_documents;
DROP POLICY IF EXISTS research_admin_access ON research_documents;

-- Research shares policies
DROP POLICY IF EXISTS research_shares_owner ON research_shares;
DROP POLICY IF EXISTS research_shares_recipient ON research_shares;
DROP POLICY IF EXISTS research_shares_admin ON research_shares;

-- Notifications policies
DROP POLICY IF EXISTS notifications_recipient_access ON notifications;
DROP POLICY IF EXISTS notifications_recipient ON notifications;
DROP POLICY IF EXISTS notifications_admin ON notifications;
DROP POLICY IF EXISTS notifications_system_insert ON notifications;

-- Now create the new policies
-- Users table policies (simplified to avoid recursion)
-- Allow authenticated users to INSERT their own profile during registration
CREATE POLICY users_insert_own ON users FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Allow users to SELECT their own data
CREATE POLICY users_select_own ON users FOR SELECT 
USING (auth.uid() = id);

-- Allow users to UPDATE their own data
CREATE POLICY users_update_own ON users FOR UPDATE 
USING (auth.uid() = id);

-- Allow authenticated users to see other users for professional purposes
-- (doctors and pharma reps need to see each other for appointments)
CREATE POLICY users_public_visibility ON users FOR SELECT 
USING (auth.uid() IS NOT NULL AND role IN ('doctor', 'pharma'));

-- Timeslots policies
-- Users can manage their own timeslots OR view available ones
CREATE POLICY timeslots_access ON timeslots FOR ALL 
USING (
    doctor_id = auth.uid() OR 
    (status = 'available' AND auth.uid() IS NOT NULL)
);

-- Appointments policies
-- Users can access appointments they're involved in
CREATE POLICY appointments_access ON appointments FOR ALL 
USING (
    doctor_id = auth.uid() OR 
    pharma_rep_id = auth.uid()
);

-- Appointment related tables follow the same pattern
CREATE POLICY appointment_products_access ON appointment_products FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_products.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    )
);

CREATE POLICY appointment_attachments_access ON appointment_attachments FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_attachments.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    )
);

CREATE POLICY appointment_feedback_access ON appointment_feedback FOR ALL 
USING (
    submitted_by_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_feedback.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    )
);

CREATE POLICY appointment_reminders_access ON appointment_reminders FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_reminders.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    )
);

-- Research documents policies
-- Users can manage their own documents
CREATE POLICY research_owner_access ON research_documents FOR ALL 
USING (uploaded_by_id = auth.uid());

-- Public documents are viewable by authenticated users
CREATE POLICY research_public_view ON research_documents FOR SELECT 
USING (is_public = true AND auth.uid() IS NOT NULL);

-- Shared documents are accessible to recipients
CREATE POLICY research_shared_access ON research_documents FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM research_shares 
        WHERE research_id = research_documents.id 
        AND doctor_id = auth.uid()
    )
);

-- Research shares policies
-- Document owners can manage shares
CREATE POLICY research_shares_owner ON research_shares FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM research_documents 
        WHERE id = research_shares.research_id 
        AND uploaded_by_id = auth.uid()
    )
);

-- Recipients can view their shares
CREATE POLICY research_shares_recipient ON research_shares FOR SELECT 
USING (doctor_id = auth.uid());

-- Notifications policies
-- Recipients can access their notifications
CREATE POLICY notifications_recipient ON notifications FOR ALL 
USING (recipient_id = auth.uid());

-- Allow system to create notifications (needed for triggers)
CREATE POLICY notifications_system_insert ON notifications FOR INSERT 
WITH CHECK (true); 