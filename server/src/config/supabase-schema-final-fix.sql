-- Final schema fixes for missing columns and computed fields
-- Run this to fix the full_name column issue and other schema problems

-- Add the missing full_name column as a computed field
-- This combines first_name and last_name automatically
ALTER TABLE users 
ADD COLUMN full_name TEXT GENERATED ALWAYS AS (
  CASE 
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL 
    THEN first_name || ' ' || last_name
    WHEN first_name IS NOT NULL 
    THEN first_name
    WHEN last_name IS NOT NULL 
    THEN last_name
    ELSE email
  END
) STORED;

-- Add missing title column for doctors (used in appointment queries)
ALTER TABLE users 
ADD COLUMN title TEXT DEFAULT NULL;

-- Update the title for existing doctors
UPDATE users 
SET title = 'Dr.'
WHERE role = 'doctor' AND title IS NULL;

-- Verify the schema changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('full_name', 'title', 'first_name', 'last_name')
ORDER BY column_name; 