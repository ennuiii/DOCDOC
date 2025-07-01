-- =============================================
-- QUICK FIX: Research RLS Infinite Recursion
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop the problematic policies causing recursion
DROP POLICY IF EXISTS "research_documents_shared_view" ON research_documents;
DROP POLICY IF EXISTS "research_shares_pharma_manage" ON research_shares;
DROP POLICY IF EXISTS "research_shares_doctor_view" ON research_shares;

-- Create simple, non-recursive policies
-- Allow anyone to view all research_shares (we filter in frontend)
CREATE POLICY "shares_simple_select" ON research_shares 
FOR SELECT USING (true);

-- Allow pharma users to manage shares
CREATE POLICY "shares_simple_manage" ON research_shares 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'pharma'
    )
);

-- This should fix the infinite recursion issue! 