-- Add missing video meeting columns to appointments table
-- Run this migration to support Google Meet and other video provider integrations

-- Add video_provider column to track which video provider was used
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS video_provider TEXT;

-- Add video_meeting_data column to store detailed video meeting information
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS video_meeting_data JSONB;

-- Add a comment to explain the new columns
COMMENT ON COLUMN appointments.video_provider IS 'Video conferencing provider used (google-meet, zoom, teams, etc.)';
COMMENT ON COLUMN appointments.video_meeting_data IS 'Detailed video meeting data including provider-specific settings and meeting details';

-- Create an index on video_provider for performance
CREATE INDEX IF NOT EXISTS idx_appointments_video_provider ON appointments(video_provider);

-- Update any existing virtual appointments that might have been created without these columns
UPDATE appointments 
SET video_provider = 'google-meet' 
WHERE meeting_type = 'virtual' 
  AND meeting_link IS NOT NULL 
  AND video_provider IS NULL 
  AND meeting_link LIKE '%meet.google.com%';

UPDATE appointments 
SET video_provider = 'zoom' 
WHERE meeting_type = 'virtual' 
  AND meeting_link IS NOT NULL 
  AND video_provider IS NULL 
  AND meeting_link LIKE '%zoom.us%';

-- Add a constraint to ensure video_provider is set for virtual meetings
-- (Optional - comment out if you want to allow virtual meetings without video_provider)
-- ALTER TABLE appointments 
-- ADD CONSTRAINT check_virtual_meeting_provider 
-- CHECK (meeting_type != 'virtual' OR video_provider IS NOT NULL); 