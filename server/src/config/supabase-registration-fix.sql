-- Registration fix for Supabase RLS policies
-- This script creates a more permissive INSERT policy for user registration

-- Drop existing user policies
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_professional_visibility ON users;

-- Create a permissive INSERT policy for registration
-- This allows any authenticated request to insert a user profile
-- We'll rely on application logic to ensure the correct ID is used
CREATE POLICY users_insert_registration ON users FOR INSERT 
WITH CHECK (true);

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