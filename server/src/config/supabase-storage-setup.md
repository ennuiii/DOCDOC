# Supabase Storage Setup for Research Documents

This guide explains how to set up Supabase Storage for handling research document uploads in the Pharmadoc application.

## Prerequisites

- Supabase project created and configured
- Database schema applied (supabase-schema.sql)
- Supabase client configured in the application

## Storage Bucket Setup

### 1. Create Storage Bucket

In your Supabase dashboard, go to Storage and create a new bucket:

```sql
-- Create the research-documents bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('research-documents', 'research-documents', true);
```

Or create it via the Supabase dashboard:
- Go to Storage in your Supabase dashboard
- Click "Create bucket"
- Name: `research-documents`
- Public: ✅ (checked)
- File size limit: 50MB
- Allowed MIME types: `application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/rtf`

### 2. Storage Policies

Apply the following Row Level Security (RLS) policies for the storage bucket:

```sql
-- Policy: Users can upload files to their own folder
CREATE POLICY "Users can upload to own folder" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'research-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view files they uploaded
CREATE POLICY "Users can view own files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'research-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can view public files (linked to public research documents)
CREATE POLICY "Public research documents viewable" ON storage.objects
FOR SELECT USING (
  bucket_id = 'research-documents' AND 
  EXISTS (
    SELECT 1 FROM research_documents 
    WHERE file_url LIKE '%' || name AND is_public = true
  )
);

-- Policy: Doctors can view files shared with them
CREATE POLICY "Doctors can view shared files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'research-documents' AND 
  EXISTS (
    SELECT 1 FROM research_documents rd
    JOIN research_shares rs ON rd.id = rs.research_id
    WHERE rd.file_url LIKE '%' || name 
    AND rs.doctor_id = auth.uid()
  )
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'research-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'research-documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 3. File Organization Structure

Files will be organized in the bucket using the following structure:

```
research-documents/
├── {user_id}/
│   ├── {timestamp}-{filename}.pdf
│   ├── {timestamp}-{filename}.docx
│   └── ...
└── ...
```

Example:
```
research-documents/
├── 550e8400-e29b-41d4-a716-446655440000/
│   ├── 1704067200000-clinical-trial-results.pdf
│   ├── 1704067300000-product-safety-data.docx
│   └── 1704067400000-market-research.xlsx
└── 550e8400-e29b-41d4-a716-446655440001/
    ├── 1704067500000-efficacy-study.pdf
    └── ...
```

### 4. File Type Restrictions

The following file types are allowed for upload:

- **PDF**: `.pdf` (application/pdf)
- **Word Documents**: `.doc`, `.docx` (application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document)
- **PowerPoint**: `.ppt`, `.pptx` (application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation)
- **Excel**: `.xls`, `.xlsx` (application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
- **Text Files**: `.txt` (text/plain)
- **Rich Text**: `.rtf` (application/rtf)

### 5. File Size Limits

- Maximum file size: **50MB**
- This limit is enforced both in the client-side validation and Supabase bucket configuration

### 6. Security Considerations

1. **User Isolation**: Each user can only access files in their own folder
2. **Sharing Control**: File access is controlled through the `research_shares` table
3. **Public Access**: Only files linked to public research documents are publicly accessible
4. **Authentication**: All operations require valid authentication
5. **HTTPS Only**: All file URLs use HTTPS for secure transmission

### 7. Environment Variables

Add the following to your `.env` file for local development:

```env
# Supabase Storage Configuration
SUPABASE_STORAGE_BUCKET=research-documents
SUPABASE_MAX_FILE_SIZE=52428800  # 50MB in bytes
```

### 8. Client-Side Usage

The client-side implementation uses the Supabase JavaScript client:

```javascript
// Upload a file
const { data, error } = await supabase.storage
  .from('research-documents')
  .upload(`${user.id}/${Date.now()}-${file.name}`, file);

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('research-documents')
  .getPublicUrl(fileName);

// Delete a file
const { error } = await supabase.storage
  .from('research-documents')
  .remove([filePath]);
```

### 9. Migration from Local Storage

If migrating from local file storage:

1. Ensure all existing files are properly uploaded to the bucket
2. Update `research_documents.file_url` to point to Supabase Storage URLs
3. Remove local files after successful migration
4. Update any hardcoded file paths in the application

### 10. Testing the Setup

Test the storage setup by:

1. Uploading a document as a pharma user
2. Sharing it with a doctor
3. Verifying the doctor can access the shared document
4. Testing public document access without authentication
5. Verifying file deletion works correctly

## Troubleshooting

### Common Issues

1. **Upload fails**: Check bucket permissions and policies
2. **Files not accessible**: Verify RLS policies are correctly applied
3. **Large files fail**: Check file size limits in bucket configuration
4. **CORS errors**: Ensure proper CORS configuration in Supabase dashboard

### Debug Steps

1. Check Supabase logs for policy violations
2. Verify user authentication state
3. Test policies with different user roles
4. Check file URLs are correctly formatted

## Support

For additional help:
- Supabase Documentation: https://supabase.com/docs/guides/storage
- Supabase Storage Policies: https://supabase.com/docs/guides/storage/security/access-control 