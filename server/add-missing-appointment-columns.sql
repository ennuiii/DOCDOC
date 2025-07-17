-- Add missing columns to appointments table
-- These columns are needed for proper appointment status tracking

-- Add confirmed_by column (who confirmed the appointment)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS confirmed_by_id UUID REFERENCES users(id);

-- Add completed_by column (who marked the appointment as completed)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS completed_by_id UUID REFERENCES users(id);

-- Rename cancelled_by to cancelled_by for consistency (if it doesn't exist)
-- The schema uses cancelled_by_id but the code expects cancelled_by
-- Let's add an alias or use the correct column name in code

-- Update any existing data to use proper foreign key references
UPDATE appointments 
SET confirmed_by_id = NULL 
WHERE confirmed_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = confirmed_by_id
);

UPDATE appointments 
SET completed_by_id = NULL 
WHERE completed_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = completed_by_id
);

UPDATE appointments 
SET cancelled_by_id = NULL 
WHERE cancelled_by_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = cancelled_by_id
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_by ON appointments(confirmed_by_id);
CREATE INDEX IF NOT EXISTS idx_appointments_completed_by ON appointments(completed_by_id);
CREATE INDEX IF NOT EXISTS idx_appointments_cancelled_by ON appointments(cancelled_by_id);

-- Add comments for clarity
COMMENT ON COLUMN appointments.confirmed_by_id IS 'User who confirmed the appointment';
COMMENT ON COLUMN appointments.completed_by_id IS 'User who marked the appointment as completed';
COMMENT ON COLUMN appointments.cancelled_by_id IS 'User who cancelled the appointment'; 