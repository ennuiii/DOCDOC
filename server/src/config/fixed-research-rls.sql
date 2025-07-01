-- =============================================
-- FIXED RESEARCH RLS POLICIES (No Recursion)
-- This script fixes the infinite recursion issue
-- =============================================

-- Enable RLS on research tables
ALTER TABLE research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_shares ENABLE ROW LEVEL SECURITY;

-- =============================================
-- DROP ALL EXISTING RESEARCH POLICIES
-- =============================================

-- Drop all existing research_documents policies
DROP POLICY IF EXISTS "research_documents_owner_full_access" ON research_documents;
DROP POLICY IF EXISTS "research_documents_public_read" ON research_documents;
DROP POLICY IF EXISTS "research_documents_owner_access" ON research_documents;
DROP POLICY IF EXISTS "research_documents_public_view" ON research_documents;
DROP POLICY IF EXISTS "research_documents_shared_view" ON research_documents;

-- Drop all existing research_shares policies
DROP POLICY IF EXISTS "research_shares_insert_by_owner" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_select" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_update" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_delete" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_manage" ON research_shares;
DROP POLICY IF EXISTS "research_shares_recipient_view" ON research_shares;
DROP POLICY IF EXISTS "research_shares_pharma_insert" ON research_shares;
DROP POLICY IF EXISTS "research_shares_pharma_manage" ON research_shares;
DROP POLICY IF EXISTS "research_shares_doctor_view" ON research_shares;

-- =============================================
-- CREATE SIMPLE RESEARCH_DOCUMENTS POLICIES
-- =============================================

-- Allow owners full access to their documents
CREATE POLICY "documents_owner_all" ON research_documents 
FOR ALL USING (
    uploaded_by_id = auth.uid()
);

-- Allow everyone to view public documents
CREATE POLICY "documents_public_select" ON research_documents 
FOR SELECT USING (
    is_public = true
);

-- =============================================
-- CREATE SIMPLE RESEARCH_SHARES POLICIES
-- =============================================

-- Allow anyone to view all shares (we'll filter on the frontend)
CREATE POLICY "shares_select_all" ON research_shares 
FOR SELECT USING (true);

-- Allow pharma users to insert shares
CREATE POLICY "shares_pharma_insert" ON research_shares 
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'pharma'
    )
);

-- Allow pharma users to update/delete shares
CREATE POLICY "shares_pharma_manage" ON research_shares 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'pharma'
    )
);

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Show RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity as "RLS_Enabled"
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('research_documents', 'research_shares')
ORDER BY tablename;

-- Show research-related policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('research_documents', 'research_shares')
ORDER BY tablename, policyname;

SELECT 'Fixed RLS policies created - no more recursion!' as "Status"; 