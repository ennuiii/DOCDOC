# Row Level Security (RLS) Setup for Pharmadoc

## Problem
Your app is experiencing hanging database queries because Row Level Security (RLS) is either not enabled or not properly configured in Supabase. This prevents authenticated users from accessing their own data.

## Solution
Run the provided SQL scripts in your Supabase SQL Editor to enable RLS with proper policies.

## Step-by-Step Instructions

### Option 1: Clean Setup (Recommended)
**This script handles existing policy conflicts and is safe to run multiple times:**

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the entire content of `clean-and-setup-rls.sql`
4. Click **RUN** to execute
5. **Test your app** - you should now be able to log in successfully

### Option 2: Quick Fix (If you only need immediate login access)
Run this for a minimal fix to get login working:

1. In the Supabase SQL Editor
2. Copy and paste the entire content of `quick-fix-rls.sql`
3. Click **RUN** to execute
4. This fixes only the users table for immediate login access

## What These Scripts Do

### Clean Setup Script (`clean-and-setup-rls.sql`) - **RECOMMENDED**
- ✅ **Handles policy conflicts** by dropping existing policies first
- ✅ Enables RLS on ALL tables (users, timeslots, appointments, etc.)
- ✅ Creates comprehensive security policies for the entire app
- ✅ **Safe to run multiple times** without errors
- ✅ Includes verification queries to confirm success
- ✅ Ensures proper data isolation between users

### Quick Fix Script (`quick-fix-rls.sql`)
- ✅ Enables RLS on the `users` table only
- ✅ Creates essential policies for user authentication
- ✅ Allows users to access their own profile data
- ✅ Fixes the immediate login hanging issue

### Legacy Complete Setup Script (`enable-rls-policies.sql`)
- ⚠️ May cause conflicts if policies already exist
- ✅ Enables RLS on ALL tables when run on clean database
- ✅ Creates comprehensive security policies for the entire app

## Key Policies Created

### Users Table
- **users_select_own**: Users can view their own profile
- **users_insert_own**: Users can create their own profile
- **users_update_own**: Users can update their own profile
- **users_professional_visibility**: Professionals can see each other for appointments

### Appointments & Timeslots
- Doctors can manage their own timeslots
- Both doctor and pharma rep can access shared appointments
- Public can view available timeslots for booking

### Research Documents
- Document owners can manage their uploads
- Public documents are viewable by all authenticated users
- Shared documents are accessible to specified recipients

### Notifications
- Users can only access their own notifications
- System can create notifications for automated processes

## Verification

After running the scripts, you can verify everything is working:

1. Check that RLS is enabled:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

2. Check that policies exist:
```sql
SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## Troubleshooting

### If you still have issues after running the scripts:

1. **Clear browser cache** and refresh the app
2. **Check Supabase logs** in your project dashboard
3. **Verify your user exists** in the `auth.users` table
4. **Check that your JWT token is valid** and not expired

### Common Issues:

- **"Row is not returned"**: User doesn't exist in users table
- **"Policies still blocking"**: RLS policies might need adjustment
- **"Still hanging"**: Clear browser cache and check network

## Security Benefits

With RLS enabled:
- ✅ Users can only access their own data
- ✅ Data is automatically filtered by user ID
- ✅ No risk of data leakage between users
- ✅ Compliant with data privacy requirements
- ✅ Database-level security (not just application-level)

## Files in this Directory

- `clean-and-setup-rls.sql` - **RECOMMENDED** - Complete RLS setup that handles conflicts
- `quick-fix-rls.sql` - Immediate fix for login issues only
- `enable-rls-policies.sql` - Legacy complete setup (may have conflicts)
- `RLS-README.md` - This instruction file (you're reading it now)

## Next Steps

1. Run the quick fix to get your app working immediately
2. Run the complete setup for full security
3. Test all features to ensure they work properly
4. Consider adding additional policies as your app grows

If you encounter any issues, check the Supabase documentation or reach out for support. 