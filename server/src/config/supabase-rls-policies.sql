-- Updated Row Level Security (RLS) policies for Pharmadoc
-- These policies fix the registration issue while maintaining security

-- Drop existing policies if they exist
DROP POLICY IF EXISTS users_own_data ON users;
DROP POLICY IF EXISTS timeslots_doctor_access ON timeslots;
DROP POLICY IF EXISTS appointments_access ON appointments;
DROP POLICY IF EXISTS research_access ON research_documents;
DROP POLICY IF EXISTS notifications_recipient_access ON notifications;

-- Users table policies
-- Allow users to INSERT their own profile during registration
CREATE POLICY users_insert_own ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to SELECT their own data
CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid() = id);

-- Allow users to UPDATE their own data
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid() = id);

-- Allow admins to see all users
CREATE POLICY users_admin_access ON users FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Allow doctors to see pharma reps and vice versa (for appointments)
CREATE POLICY users_professional_visibility ON users FOR SELECT USING (
    role IN ('doctor', 'pharma') AND 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('doctor', 'pharma'))
);

-- Timeslots policies
-- Doctors can manage their own timeslots
CREATE POLICY timeslots_doctor_own ON timeslots FOR ALL USING (doctor_id = auth.uid());

-- Staff can manage timeslots for their assigned doctor
CREATE POLICY timeslots_staff_access ON timeslots FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'staff' 
        AND assigned_doctor_id = timeslots.doctor_id
    )
);

-- Pharma reps can view available timeslots
CREATE POLICY timeslots_pharma_view ON timeslots FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'pharma')
);

-- Admins can access all timeslots
CREATE POLICY timeslots_admin_access ON timeslots FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Appointments policies
-- Participants can access their appointments
CREATE POLICY appointments_participants ON appointments FOR ALL USING (
    doctor_id = auth.uid() OR pharma_rep_id = auth.uid()
);

-- Staff can access appointments for their assigned doctor
CREATE POLICY appointments_staff_access ON appointments FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'staff' 
        AND assigned_doctor_id = appointments.doctor_id
    )
);

-- Admins can access all appointments
CREATE POLICY appointments_admin_access ON appointments FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Appointment products policies
CREATE POLICY appointment_products_access ON appointment_products FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_products.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Appointment attachments policies
CREATE POLICY appointment_attachments_access ON appointment_attachments FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_attachments.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Appointment feedback policies
CREATE POLICY appointment_feedback_access ON appointment_feedback FOR ALL USING (
    submitted_by_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_feedback.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Appointment reminders policies
CREATE POLICY appointment_reminders_access ON appointment_reminders FOR ALL USING (
    EXISTS (
        SELECT 1 FROM appointments 
        WHERE id = appointment_reminders.appointment_id 
        AND (doctor_id = auth.uid() OR pharma_rep_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Research documents policies
-- Owners can manage their documents
CREATE POLICY research_owner_access ON research_documents FOR ALL USING (uploaded_by_id = auth.uid());

-- Public documents are viewable by all authenticated users
CREATE POLICY research_public_view ON research_documents FOR SELECT USING (
    is_public = true AND auth.uid() IS NOT NULL
);

-- Shared documents are accessible to recipients
CREATE POLICY research_shared_access ON research_documents FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM research_shares 
        WHERE research_id = research_documents.id 
        AND doctor_id = auth.uid()
    )
);

-- Admins can access all research
CREATE POLICY research_admin_access ON research_documents FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Research shares policies
-- Document owners can manage shares
CREATE POLICY research_shares_owner ON research_shares FOR ALL USING (
    EXISTS (
        SELECT 1 FROM research_documents 
        WHERE id = research_shares.research_id 
        AND uploaded_by_id = auth.uid()
    )
);

-- Recipients can view their shares
CREATE POLICY research_shares_recipient ON research_shares FOR SELECT USING (doctor_id = auth.uid());

-- Admins can manage all shares
CREATE POLICY research_shares_admin ON research_shares FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Notifications policies
-- Recipients can access their notifications
CREATE POLICY notifications_recipient ON notifications FOR ALL USING (recipient_id = auth.uid());

-- Admins can access all notifications
CREATE POLICY notifications_admin ON notifications FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- System can create notifications (for triggers/functions)
CREATE POLICY notifications_system_insert ON notifications FOR INSERT WITH CHECK (true); 