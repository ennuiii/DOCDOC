-- Run this in your Supabase SQL Editor to add missing columns
-- These are needed for appointment confirmation and completion tracking

-- Add confirmed_by_id column
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS confirmed_by_id UUID REFERENCES users(id);

-- Add completed_by_id column  
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS completed_by_id UUID REFERENCES users(id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_by ON appointments(confirmed_by_id);
CREATE INDEX IF NOT EXISTS idx_appointments_completed_by ON appointments(completed_by_id);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'appointments' 
AND column_name IN ('confirmed_by_id', 'completed_by_id', 'cancelled_by_id')
ORDER BY column_name; 