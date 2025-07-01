-- Pharmadoc Supabase Database Schema
-- This schema migrates from Mongoose to PostgreSQL

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types for enums
CREATE TYPE user_role AS ENUM ('doctor', 'pharma', 'staff', 'admin');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show');
CREATE TYPE timeslot_status AS ENUM ('available', 'booked', 'blocked', 'cancelled');
CREATE TYPE timeslot_type AS ENUM ('pharma', 'patient', 'general');
CREATE TYPE meeting_type AS ENUM ('in-person', 'virtual', 'phone');
CREATE TYPE product_category AS ENUM ('prescription', 'otc', 'vaccine', 'medical-device', 'other');
CREATE TYPE research_category AS ENUM ('clinical-trial', 'product-info', 'safety-data', 'efficacy-study', 'market-research', 'other');
CREATE TYPE access_level AS ENUM ('view', 'download');
CREATE TYPE notification_type AS ENUM ('appointment-scheduled', 'appointment-confirmed', 'appointment-cancelled', 'appointment-completed', 'appointment-reminder', 'research-shared', 'research-uploaded', 'timeslot-available', 'system');
CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE recurring_type AS ENUM ('none', 'daily', 'weekly', 'monthly');
CREATE TYPE reminder_type AS ENUM ('email', 'sms', 'in-app');
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'failed');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    
    -- Profile information
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    
    -- Address (stored as JSONB for flexibility)
    address JSONB DEFAULT '{}',
    
    -- Role-specific fields
    specialization VARCHAR(255),
    license_number VARCHAR(255),
    clinic_name VARCHAR(255),
    company_name VARCHAR(255),
    company_registration VARCHAR(255),
    assigned_doctor_id UUID REFERENCES users(id),
    
    -- Account status
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMPTZ,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    last_login TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timeslots table
CREATE TABLE timeslots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration INTEGER DEFAULT 30, -- minutes
    status timeslot_status DEFAULT 'available',
    type timeslot_type DEFAULT 'pharma',
    max_bookings INTEGER DEFAULT 1,
    current_bookings INTEGER DEFAULT 0,
    notes TEXT,
    
    -- Recurring pattern
    recurring_type recurring_type DEFAULT 'none',
    recurring_end_date DATE,
    recurring_days_of_week INTEGER[], -- 0-6 for weekly
    recurring_day_of_month INTEGER, -- 1-31 for monthly
    parent_timeslot_id UUID REFERENCES timeslots(id),
    is_recurring_instance BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    CONSTRAINT valid_duration CHECK (duration >= 15 AND duration <= 120),
    CONSTRAINT valid_bookings CHECK (current_bookings <= max_bookings)
);

-- Appointments table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timeslot_id UUID NOT NULL REFERENCES timeslots(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pharma_rep_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status appointment_status DEFAULT 'scheduled',
    purpose VARCHAR(200) NOT NULL,
    notes TEXT,
    meeting_link VARCHAR(500),
    meeting_type meeting_type DEFAULT 'in-person',
    duration INTEGER DEFAULT 30,
    
    -- Cancellation info
    cancellation_reason TEXT,
    cancelled_by_id UUID REFERENCES users(id),
    cancelled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointment products (separate table for many-to-many relationship)
CREATE TABLE appointment_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category product_category DEFAULT 'prescription',
    description TEXT
);

-- Appointment attachments
CREATE TABLE appointment_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointment feedback
CREATE TABLE appointment_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    submitted_by_id UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointment reminders
CREATE TABLE appointment_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    type reminder_type DEFAULT 'email',
    sent_at TIMESTAMPTZ,
    status reminder_status DEFAULT 'pending'
);

-- Research documents table
CREATE TABLE research_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    uploaded_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    category research_category DEFAULT 'other',
    tags TEXT[],
    is_public BOOLEAN DEFAULT false,
    views INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    
    -- Metadata stored as JSONB for flexibility
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Research document sharing
CREATE TABLE research_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    research_id UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_level access_level DEFAULT 'view',
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(research_id, doctor_id)
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Related data (stored as JSONB for flexibility)
    data JSONB DEFAULT '{}',
    
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    priority notification_priority DEFAULT 'medium',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_assigned_doctor ON users(assigned_doctor_id);

CREATE INDEX idx_timeslots_doctor_date ON timeslots(doctor_id, date, start_time);
CREATE INDEX idx_timeslots_status_date ON timeslots(status, date);
CREATE INDEX idx_timeslots_doctor_status ON timeslots(doctor_id, status);

CREATE INDEX idx_appointments_doctor_status ON appointments(doctor_id, status, created_at);
CREATE INDEX idx_appointments_pharma_status ON appointments(pharma_rep_id, status, created_at);
CREATE INDEX idx_appointments_timeslot ON appointments(timeslot_id, status);

CREATE INDEX idx_research_uploaded_by ON research_documents(uploaded_by_id, created_at);
CREATE INDEX idx_research_category ON research_documents(category);
CREATE INDEX idx_research_tags ON research_documents USING GIN(tags);
CREATE INDEX idx_research_title_desc ON research_documents USING GIN(to_tsvector('english', title || ' ' || description));

CREATE INDEX idx_research_shares_doctor ON research_shares(doctor_id);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, created_at);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, read);
CREATE INDEX idx_notifications_type ON notifications(type);

-- Row Level Security (RLS) policies
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

-- Basic RLS policies (can be expanded based on specific requirements)
-- Users can read their own data
CREATE POLICY users_own_data ON users FOR ALL USING (auth.uid() = id);

-- Doctors can manage their timeslots
CREATE POLICY timeslots_doctor_access ON timeslots FOR ALL USING (doctor_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff')));

-- Appointment access based on role
CREATE POLICY appointments_access ON appointments FOR ALL USING (
    doctor_id = auth.uid() OR 
    pharma_rep_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

-- Research access based on ownership and sharing
CREATE POLICY research_access ON research_documents FOR ALL USING (
    uploaded_by_id = auth.uid() OR 
    is_public = true OR 
    EXISTS (SELECT 1 FROM research_shares WHERE research_id = research_documents.id AND doctor_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Notifications for recipients
CREATE POLICY notifications_recipient_access ON notifications FOR ALL USING (recipient_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeslots_updated_at BEFORE UPDATE ON timeslots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_research_updated_at BEFORE UPDATE ON research_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 