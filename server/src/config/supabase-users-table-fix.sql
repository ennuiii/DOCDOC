-- Fix users table for Supabase authentication and registration
-- This script removes password_hash field and fixes RLS policies

-- First, drop the RLS policies for users to modify the table
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_public_visibility ON users;

-- Disable RLS temporarily to modify the table
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Remove password-related fields since Supabase handles authentication
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS email_verification_token;
ALTER TABLE users DROP COLUMN IF EXISTS email_verification_expires;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_expires;

-- Make sure id column can accept UUIDs from Supabase auth
-- (it should already be UUID but let's make sure)
-- Note: The id will come from auth.users.id in Supabase

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create new, simpler RLS policies that work with Supabase auth
-- Allow users to INSERT their own profile (this is the key fix)
CREATE POLICY users_insert_own ON users FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Allow users to SELECT their own data
CREATE POLICY users_select_own ON users FOR SELECT 
USING (auth.uid() = id);

-- Allow users to UPDATE their own data  
CREATE POLICY users_update_own ON users FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- Allow authenticated users to see basic info of doctors and pharma reps
-- (needed for appointments and professional interactions)
CREATE POLICY users_professional_visibility ON users FOR SELECT 
USING (
    auth.uid() IS NOT NULL 
    AND role IN ('doctor', 'pharma')
    AND auth.uid() != id  -- Don't duplicate own access
);

-- Allow admins to see all users (if you need admin functionality)
-- Uncomment this if you need admin access:
-- CREATE POLICY users_admin_access ON users FOR ALL 
-- USING (
--     EXISTS (
--         SELECT 1 FROM auth.users 
--         WHERE auth.users.id = auth.uid() 
--         AND auth.users.email IN ('admin@pharmadoc.com')  -- Replace with your admin emails
--     )
-- ); 