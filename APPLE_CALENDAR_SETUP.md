# 🍎 Apple Calendar (iCloud) Integration Setup Guide

This guide will walk you through connecting your Apple Calendar (iCloud Calendar) to PharmaDOC for automatic synchronization of appointments.

## Prerequisites

### 1. **Apple ID with iCloud Calendar Enabled**
- You need an active Apple ID
- iCloud Calendar must be enabled in your Apple device settings
- Calendars should be syncing to iCloud (not just stored locally)

### 2. **App-Specific Password Required**
For security, Apple requires App-Specific Passwords for third-party calendar access:

1. **Sign in to your Apple ID account page**: https://appleid.apple.com/
2. **Navigate to "Sign-In and Security"**
3. **Select "App-Specific Passwords"**
4. **Click "Generate an app-specific password"**
5. **Enter a label**: `PharmaDOC Calendar` (or similar)
6. **Copy the generated password** - you'll need this for setup

⚠️ **Important**: Save this password securely. Apple will only show it once!

## Setup Process

### 🚀 **NEW: Guided Setup Assistant (Recommended)**

PharmaDOC now includes a comprehensive Apple Calendar Setup Assistant that makes the process much easier:

1. **Navigate to Integrations** → **"Add Integration"**
2. **Click "Setup Apple Calendar (Guided)"** (prominently featured with 🍎 icon)
3. **Follow the 5-step interactive wizard** that provides:
   - ✅ **Direct links** to Apple ID settings with one-click access
   - ✅ **Step-by-step instructions** with contextual help
   - ✅ **Copy-paste helpers** for server URLs and examples
   - ✅ **Pre-filled connection details** when you're ready to connect
   - ✅ **Smart error handling** with Apple-specific troubleshooting

**OR use the manual setup below:**

### Step 1: Access Integration Settings
1. Log into PharmaDOC
2. Navigate to **Integrations** page
3. Find **"CalDAV (iCloud, Yahoo, etc.)"** card
4. Click **"Connect"**

### Step 2: Configure Apple iCloud Calendar
In the connection form, enter:

- **Server URL**: `https://caldav.icloud.com`
- **Username**: Your Apple ID email address (e.g., `yourname@icloud.com`)
- **Password**: The App-Specific Password you generated (NOT your Apple ID password)
- **Provider Type**: Select `icloud` from the dropdown

### Step 3: Test Connection
- Click **"Test Connection"**
- PharmaDOC will verify your credentials and discover your calendars
- You should see a success message with calendar count

### Step 4: Configure Sync Settings
- Choose sync direction:
  - **Bidirectional**: Sync both ways (recommended)
  - **PharmaDOC to Apple**: Only push appointments to Apple Calendar
  - **Apple to PharmaDOC**: Only import from Apple Calendar
- Select which calendars to sync (typically "Calendar" or "Work")
- Enable auto-sync for real-time updates

## Features

### ✅ **What Works**
- **Bidirectional Sync**: Appointments sync both ways
- **Real-time Updates**: Changes reflect automatically
- **Multiple Calendars**: Support for multiple iCloud calendars
- **Conflict Resolution**: Smart handling of scheduling conflicts
- **Event Details**: Full appointment information including:
  - Title/Purpose
  - Date and time
  - Location
  - Description/Notes
  - Attendees

### ✅ **Calendar Providers Supported**
- **Apple iCloud Calendar** (recommended)
- **Yahoo Calendar**
- **FastMail Calendar**
- **Generic CalDAV servers**

## Troubleshooting

### Connection Failed
**Problem**: "Authentication failed" or "Invalid credentials"
**Solutions**:
1. Verify you're using an **App-Specific Password**, not your Apple ID password
2. Check that your Apple ID email is correct
3. Ensure iCloud Calendar is enabled on your device
4. Try generating a new App-Specific Password

### No Calendars Found
**Problem**: Connection succeeds but no calendars are discovered
**Solutions**:
1. Ensure you have at least one calendar in iCloud
2. Check that Calendar sync is enabled in iCloud settings
3. Wait a few minutes for iCloud to propagate changes

### Sync Issues
**Problem**: Appointments aren't syncing properly
**Solutions**:
1. Check the sync direction settings
2. Verify calendar permissions in your Apple device settings
3. Try a manual sync from the Integrations page
4. Check for any error messages in the sync status

### App-Specific Password Problems
**Problem**: Can't generate or use App-Specific Password
**Solutions**:
1. Ensure Two-Factor Authentication is enabled on your Apple ID
2. Sign out and back into your Apple ID account page
3. Try using a different browser or device
4. Contact Apple Support if the issue persists

## Security & Privacy

### 🔒 **Data Protection**
- App-Specific Passwords limit access to calendar data only
- PharmaDOC encrypts and securely stores your credentials
- No access to other iCloud data (photos, documents, etc.)
- You can revoke access anytime through your Apple ID settings

### 🔄 **Sync Behavior**
- Only appointment-related events are synced
- Personal events remain private unless explicitly shared
- PharmaDOC respects Apple's privacy and security guidelines

## Management

### Viewing Sync Status
- Go to **Integrations** page
- Check the Apple Calendar card for:
  - Connection status
  - Last sync time
  - Sync statistics
  - Any error messages

### Modifying Settings
- Click the **Settings** icon on the integration card
- Adjust sync direction, calendar selection, or auto-sync preferences
- Changes take effect immediately

### Disconnecting
- Click **Disconnect** on the integration card
- Confirm the action
- Optionally revoke the App-Specific Password from your Apple ID settings

## Support

### Getting Help
If you encounter issues:
1. Check this guide's troubleshooting section
2. Review the error messages in the integration status
3. Try disconnecting and reconnecting the integration
4. Contact PharmaDOC support with specific error details

### What to Include in Support Requests
- Error messages (screenshots helpful)
- Your Apple ID email (for account verification)
- Steps you've already tried
- Device and browser information

---

## Quick Setup Checklist

- [ ] Apple ID with iCloud Calendar enabled
- [ ] Two-Factor Authentication enabled on Apple ID
- [ ] App-Specific Password generated and saved
- [ ] Server URL: `https://caldav.icloud.com`
- [ ] Username: Your Apple ID email
- [ ] Password: App-Specific Password (not Apple ID password)
- [ ] Provider Type: `icloud`
- [ ] Test connection successful
- [ ] Calendars discovered and selected
- [ ] Sync direction configured
- [ ] Auto-sync enabled (optional)

✅ **You're all set!** Your Apple Calendar will now sync with PharmaDOC automatically. 