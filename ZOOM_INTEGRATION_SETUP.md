# Zoom Integration Setup Guide

## Problem
You're getting a Zoom error "Verflixt! Wir konnten Ihre Anfrage leider nicht abschließen" because the Zoom OAuth credentials are not configured.

## Solution
You need to create a `.env` file in the project root with Zoom OAuth credentials.

## Step 1: Create a Zoom App

1. Go to https://marketplace.zoom.us/develop/create
2. Choose **"OAuth"** app type
3. Fill in app details:
   - App Name: PharmaDOC Integration
   - Short Description: Calendar and meeting integration
   - Company Name: Your company
4. Set **Redirect URL** to: `http://localhost:3000/integrations/callback`
5. Add **Scopes** (these are the exact names you'll see in Zoom's interface):
   - **Meeting Scopes:**
     - `meeting:write` OR `meeting:write:admin` (Create meetings)
     - `meeting:read` OR `meeting:read:admin` (Read meeting details) 
   - **User Scopes:**
     - `user:read` OR `user:read:admin` (Read user profile)
   
   **Note:** Zoom shows granular scopes like `meeting:write:admin`. Use either the basic version (`meeting:write`) or admin version (`meeting:write:admin`) - admin gives broader access.

6. Get your **Client ID** and **Client Secret** from the "App Credentials" section

## Step 2: Create .env File

Create a `.env` file in the project root with these variables:

```env
# ZOOM INTEGRATION
ZOOM_CLIENT_ID=your_zoom_client_id_here
ZOOM_CLIENT_SECRET=your_zoom_client_secret_here
ZOOM_REDIRECT_URI=http://localhost:3000/integrations/callback
ZOOM_WEBHOOK_SECRET=any_random_secret_string_here

# Add your existing Supabase and other variables here too
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Step 3: Restart the Server

After creating the `.env` file, restart your development server:

```bash
npm run dev
```

## Alternative: Disable Zoom Integration

If you don't want to set up Zoom right now, you can temporarily disable it by commenting out the Zoom provider in:

`client/src/components/integrations/IntegrationDashboard.jsx`

Find the Zoom provider object and comment it out:

```javascript
// {
//   id: 'zoom',
//   name: 'Zoom Meetings',
//   description: 'Enable Zoom for video conferences and webinars',
//   categories: ['video'],
//   scopes: ['meeting:write', 'meeting:read'],
// },
```

## Current Working Integrations

- ✅ **Google Calendar & Meet** (already working)
- ✅ **Microsoft Outlook** (calendar only, Teams disabled)
- 🔧 **Zoom** (needs OAuth setup)
- ✅ **CalDAV** (no OAuth needed)

## Common Zoom Scope Options

In Zoom's developer interface, you might see these options:
- `meeting:write` (basic) vs `meeting:write:admin` (admin-level)
- `meeting:read` (basic) vs `meeting:read:admin` (admin-level) 
- `user:read` (basic) vs `user:read:admin` (admin-level)

**Recommendation:** Use the basic versions unless you need admin-level access.

## Next Steps

1. Set up Zoom OAuth credentials if you want Zoom integration
2. Or comment out Zoom provider to focus on Google Meet + Outlook
3. Test the integrations at http://localhost:3000/integrations 