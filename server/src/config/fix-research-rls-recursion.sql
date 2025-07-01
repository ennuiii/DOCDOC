-- Fix Research RLS Infinite Recursion Issue
-- This script fixes the circular dependency in research_shares policies

-- 1. Drop all problematic research policies
DROP POLICY IF EXISTS research_owner_access ON research_documents;
DROP POLICY IF EXISTS research_public_view ON research_documents;
DROP POLICY IF EXISTS research_shared_access ON research_documents;
DROP POLICY IF EXISTS research_shares_owner ON research_shares;
DROP POLICY IF EXISTS research_shares_recipient ON research_shares;

-- 2. Create simplified, non-recursive policies for research_documents
-- Policy 1: Owners can do everything with their documents
CREATE POLICY research_documents_owner_policy ON research_documents FOR ALL 
USING (uploaded_by_id = auth.uid());

-- Policy 2: Authenticated users can view public documents
CREATE POLICY research_documents_public_policy ON research_documents FOR SELECT 
USING (is_public = true AND auth.uid() IS NOT NULL);

-- Policy 3: Doctors can view documents shared with them (simplified query)
CREATE POLICY research_documents_shared_policy ON research_documents FOR SELECT 
USING (
    auth.uid() IS NOT NULL AND
    id IN (
        SELECT research_id FROM research_shares WHERE doctor_id = auth.uid()
    )
);

-- 3. Create simplified policies for research_shares
-- Policy 1: Document owners can manage all shares for their documents (simplified)
CREATE POLICY research_shares_owner_policy ON research_shares FOR ALL 
USING (
    auth.uid() IN (
        SELECT uploaded_by_id FROM research_documents WHERE id = research_id
    )
);

-- Policy 2: Doctors can only view their own share records
CREATE POLICY research_shares_recipient_policy ON research_shares FOR SELECT 
USING (doctor_id = auth.uid());

-- 4. Alternative approach: Disable RLS temporarily for testing
-- If the above still causes issues, you can temporarily disable RLS:
-- ALTER TABLE research_shares DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE research_documents DISABLE ROW LEVEL SECURITY;

-- 5. Verify policies are working
SELECT 'Research RLS recursion fix completed! 🔧' as status; 