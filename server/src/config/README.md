# Supabase Configuration Setup

## Environment Variables

Create a `.env` file in the server root with the following variables:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Existing variables...
MONGODB_URI=mongodb://localhost:27017/pharmadoc
NODE_ENV=development
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d
```

## Client Environment Variables

Create a `.env` file in the client root with:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# API Configuration
VITE_API_URL=http://localhost:5000/api
```

## Database Schema Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and keys to the environment files above
3. Run the schema script in your Supabase SQL Editor:
   ```bash
   # Copy contents of server/src/config/supabase-schema.sql
   # and execute in Supabase SQL Editor
   ```

## Data Migration

After setting up the schema, migrate sample data:

```bash
cd server
npm run migrate:supabase
```

This will create:
- 4 test users (doctor, pharma, admin, staff)
- Sample timeslots
- Sample appointments  
- Sample research documents
- Sample notifications

## Test User Credentials

After migration, you can log in with:

- **Doctor**: doctor@test.com / doctor123
- **Pharma**: pharma@test.com / pharma123  
- **Admin**: admin@test.com / admin123
- **Staff**: staff@test.com / staff123

## Authentication System

The new Supabase authentication system provides:

- JWT-based authentication with Supabase Auth
- Role-based access control (doctor, pharma, staff, admin)
- User profile management with role-specific fields
- Password reset functionality
- Email verification support
- Row Level Security (RLS) for data protection

## API Changes

### Authentication Endpoints

All authentication now goes through the new Supabase auth controller:

- `POST /api/auth/register` - Register with role-specific validation
- `POST /api/auth/login` - Login with Supabase Auth
- `POST /api/auth/logout` - Logout and invalidate session
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/request-password-reset` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Data Access

All data operations now use Supabase PostgreSQL instead of MongoDB:

- Improved performance with SQL queries
- Better data consistency with ACID transactions
- Enhanced security with Row Level Security
- Real-time capabilities with Supabase subscriptions

## Migration Features

The migration script (`migrateToSupabase.js`) includes:

- ✅ Converts mock users to Supabase Auth + profiles
- ✅ Creates sample timeslots with proper relationships
- ✅ Sets up sample appointments
- ✅ Generates research documents with metadata
- ✅ Creates notifications for testing
- ✅ Handles duplicate detection (safe to re-run)
- ✅ Detailed logging and error reporting
- ✅ Statistics summary

## Next Steps

1. Set up your Supabase project and environment variables
2. Run the database schema in Supabase SQL Editor
3. Execute the migration script to populate sample data
4. Update your frontend to use the new authentication context
5. Test all user flows with the sample credentials

The application is now ready to use Supabase as the backend database with enhanced security, performance, and scalability!

# Database Configuration Files

This directory contains various configuration files for setting up and migrating the database schema.

## Important: Apply Final Schema Fix

After completing the Supabase migration, you **MUST** run the final schema fix to resolve database query errors:

```sql
-- Run this in your Supabase SQL Editor:
-- Copy and paste the contents of supabase-schema-final-fix.sql
```

This fixes:
- Missing `full_name` computed column that combines `first_name` and `last_name`
- Missing `title` column for users
- Ensures all database queries work correctly with the new Supabase schema

## File Descriptions

### Schema Files
- `supabase-schema.sql` - Main database schema for Supabase
- `supabase-schema-final-fix.sql` - **REQUIRED** final fixes for missing columns
- `supabase-schema-extensions.sql` - Additional extensions and functions

### Migration and Fix Scripts  
- `supabase-registration-fix.sql` - Fixes for user registration RLS policies
- `supabase-registration-fix-v2.sql` - Updated registration fix (handles duplicate policies)
- `supabase-rls-policies.sql` - Row Level Security policies
- `supabase-rls-policies-fixed.sql` - Updated RLS policies

### User Management
- `supabase-users-table-fix.sql` - Fixes for user table structure

### Configuration
- `supabase.js` - Supabase client configuration
- `auth.js` - Authentication configuration
- `env-template-future.txt` - Environment variables template

### Documentation
- `supabase-storage-setup.md` - Instructions for setting up file storage
- `FUTURE_ENHANCEMENTS_GUIDE.md` - Guide for future improvements
- `futureEnhancements.js` - Future enhancement configurations

## Setup Order

1. Run `supabase-schema.sql` to create the main schema
2. Run `supabase-rls-policies-fixed.sql` for security policies  
3. Run `supabase-registration-fix-v2.sql` for user registration
4. **MOST IMPORTANT**: Run `supabase-schema-final-fix.sql` to fix column issues
5. Configure environment variables using `env-template-future.txt`

## Troubleshooting

If you see errors like:
- "column users_1.full_name does not exist"
- "new row violates row-level security policy"
- 400 Bad Request errors during registration

Make sure you've run ALL the SQL scripts, especially `supabase-schema-final-fix.sql`. 