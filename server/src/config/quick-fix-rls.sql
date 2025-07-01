-- =============================================
-- QUICK FIX: Enable RLS for Users Table Only
-- This fixes the immediate login hanging issue
-- Run this first in Supabase SQL editor for immediate relief
-- =============================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop any existing users policies
DO $$ BEGIN
    DROP POLICY IF EXISTS "users_select_own" ON users;
    DROP POLICY IF EXISTS "users_insert_own" ON users;
    DROP POLICY IF EXISTS "users_update_own" ON users;
    DROP POLICY IF EXISTS "users_professional_visibility" ON users;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- CRITICAL: Allow users to select their own profile
-- This fixes the hanging query on login
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

-- Allow authenticated users to view other professionals
-- (needed for appointments and research sharing)
CREATE POLICY "users_professional_visibility" ON users 
FOR SELECT 
USING (
    auth.uid() IS NOT NULL 
    AND role IN ('doctor', 'pharma')
    AND is_active = true
);

-- Verify the policies were created
SELECT 
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename = 'users'
ORDER BY policyname; 