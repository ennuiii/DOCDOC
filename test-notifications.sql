-- Test Notification Creation Script
-- Run this in Supabase SQL Editor to test if notifications work

-- 1. Check if notifications table exists and has proper structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notifications';

-- 2. Check current user ID (replace with your actual user ID)
-- You can find this in Authentication → Users in Supabase Dashboard
-- SELECT auth.uid(); -- This will show your current user ID if logged in

-- 3. Create a test notification (replace 'YOUR_USER_ID' with actual user ID)
INSERT INTO notifications (
  recipient_id,
  type,
  title,
  message,
  priority,
  data
) VALUES (
  'YOUR_USER_ID', -- Replace with your actual user ID from Supabase Auth
  'system',
  'Test Notification',
  'This is a test notification to verify the system is working.',
  'medium',
  '{"test": true}'::jsonb
);

-- 4. Check if notification was created
SELECT * FROM notifications 
WHERE recipient_id = 'YOUR_USER_ID'  -- Replace with your actual user ID
ORDER BY created_at DESC 
LIMIT 5;

-- 5. Check notification counts
SELECT 
  recipient_id,
  COUNT(*) as total_notifications,
  COUNT(*) FILTER (WHERE read = false) as unread_count
FROM notifications 
WHERE recipient_id = 'YOUR_USER_ID'  -- Replace with your actual user ID
GROUP BY recipient_id; 