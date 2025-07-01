-- =============================================
-- IMPROVED RESEARCH RLS POLICIES
-- This script creates better RLS policies for research sharing
-- =============================================

-- Enable RLS on research tables
ALTER TABLE research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_shares ENABLE ROW LEVEL SECURITY;

-- =============================================
-- DROP EXISTING RESEARCH POLICIES
-- =============================================

-- Drop existing research_documents policies
DROP POLICY IF EXISTS "research_documents_owner_full_access" ON research_documents;
DROP POLICY IF EXISTS "research_documents_public_read" ON research_documents;
DROP POLICY IF EXISTS "research_documents_owner_access" ON research_documents;
DROP POLICY IF EXISTS "research_documents_public_view" ON research_documents;
DROP POLICY IF EXISTS "research_documents_shared_view" ON research_documents;

-- Drop existing research_shares policies
DROP POLICY IF EXISTS "research_shares_insert_by_owner" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_select" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_update" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_delete" ON research_shares;
DROP POLICY IF EXISTS "research_shares_owner_manage" ON research_shares;
DROP POLICY IF EXISTS "research_shares_recipient_view" ON research_shares;

-- =============================================
-- CREATE IMPROVED RESEARCH_SHARES POLICIES
-- =============================================

-- Allow pharma users to create shares for their own documents
CREATE POLICY "research_shares_pharma_insert" ON research_shares 
FOR INSERT WITH CHECK (
    auth.uid() IN (
        SELECT uploaded_by_id 
        FROM research_documents 
        WHERE id = research_id
    )
);

-- Allow pharma users to view/manage shares for their own documents
CREATE POLICY "research_shares_pharma_manage" ON research_shares 
FOR ALL USING (
    auth.uid() IN (
        SELECT uploaded_by_id 
        FROM research_documents 
        WHERE id = research_id
    )
);

-- Allow doctors to view shares where they are the recipient
CREATE POLICY "research_shares_doctor_view" ON research_shares 
FOR SELECT USING (
    doctor_id = auth.uid()
);

-- =============================================
-- CREATE IMPROVED RESEARCH_DOCUMENTS POLICIES
-- =============================================

-- Allow owners full access to their documents
CREATE POLICY "research_documents_owner_access" ON research_documents 
FOR ALL USING (
    uploaded_by_id = auth.uid()
);

-- Allow anyone to view public documents
CREATE POLICY "research_documents_public_view" ON research_documents 
FOR SELECT USING (
    is_public = true
);

-- Allow doctors to view documents shared with them
CREATE POLICY "research_documents_shared_view" ON research_documents 
FOR SELECT USING (
    auth.uid() IN (
        SELECT doctor_id 
        FROM research_shares 
        WHERE research_id = id
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

SELECT 'Improved RLS policies created for research sharing!' as "Status"; 