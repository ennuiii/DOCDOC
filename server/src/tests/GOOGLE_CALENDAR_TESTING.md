# Google Calendar Integration Testing Guide

This document provides comprehensive testing instructions for the PharmaDOC Google Calendar integration features.

## Overview

The Google Calendar integration includes:
- ✅ **Bidirectional Calendar Synchronization** - Sync appointments between PharmaDOC and Google Calendar
- ✅ **Conflict Detection & Resolution** - Intelligent conflict handling with multiple resolution strategies
- ✅ **Real-time Webhook Processing** - Instant synchronization via Google Calendar push notifications
- ✅ **Timezone Management** - Comprehensive timezone conversion and DST handling
- ✅ **Multiple Calendar Support** - Select and sync with multiple Google calendars
- ✅ **Buffer Time Management** - Smart scheduling with configurable buffer times

## Test Environment Setup

### Prerequisites

1. **Environment Variables**
   ```bash
   # Required for testing
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   
   # Optional for enhanced testing
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   PERPLEXITY_API_KEY=your_perplexity_key # For research features
   ```

2. **Database Setup**
   ```bash
   # Apply migrations
   cd server
   npm run migrate:supabase
   ```

3. **Google Calendar API Setup**
   - Enable Google Calendar API in Google Cloud Console
   - Configure OAuth 2.0 credentials
   - Add authorized redirect URIs

### Installation

```bash
# Install dependencies
cd server
npm install

# Install testing dependencies
npm install --save-dev jest supertest
```

## Running Tests

### Automated Tests

#### Quick Test Run
```bash
# Run all Google Calendar integration tests
npm test -- src/tests/integration/GoogleCalendarIntegration.test.js

# Or use the test runner
node src/tests/runGoogleCalendarTests.js
```

#### Detailed Test Execution
```bash
# Run with verbose output
npx jest src/tests/integration/GoogleCalendarIntegration.test.js --verbose

# Run specific test suites
npx jest --testNamePattern="Google Calendar Sync Service"
npx jest --testNamePattern="Conflict Resolution Service"
npx jest --testNamePattern="Buffer Time Service"
```

#### Coverage Report
```bash
# Generate test coverage
npx jest --coverage src/tests/integration/GoogleCalendarIntegration.test.js
```

### Test Runner Features

The `runGoogleCalendarTests.js` script provides:
- ✅ **Prerequisites checking** - Validates environment and dependencies
- ✅ **Automated test execution** - Runs Jest test suites
- ✅ **Manual test scenarios** - Lists required manual testing procedures
- ✅ **Performance benchmarks** - Shows performance targets
- ✅ **Test reporting** - Generates detailed test reports

```bash
# Execute complete test suite
node src/tests/runGoogleCalendarTests.js
```

## Manual Testing Procedures

### 1. Authentication & Setup

#### OAuth Flow Testing
1. **Navigate to Integration Settings**
   - Login to PharmaDOC
   - Go to Settings → Integrations → Google Calendar
   - Click "Connect Google Calendar"

2. **Verify OAuth Flow**
   - Should redirect to Google OAuth consent screen
   - Grant calendar permissions
   - Should redirect back with success message
   - Verify integration appears as "Connected"

3. **Token Management**
   - Verify token refresh works (wait for expiration or force refresh)
   - Test reconnection after token expiry
   - Check error handling for invalid tokens

### 2. Calendar Synchronization

#### Appointment to Google Calendar
1. **Create PharmaDOC Appointment**
   - Create new appointment with pharma rep
   - Set meeting type (virtual/in-person)
   - Save appointment

2. **Verify Google Calendar Sync**
   - Check Google Calendar for new event
   - Verify event details match appointment
   - Confirm attendees are added
   - Check meeting link generation (for virtual meetings)

#### Google Calendar to PharmaDOC
1. **Create Google Calendar Event**
   - Create event in Google Calendar
   - Include PharmaDOC-related keywords
   - Add attendees

2. **Verify PharmaDOC Import**
   - Check if event appears in PharmaDOC
   - Verify automatic appointment creation
   - Confirm participant mapping

#### Bidirectional Sync
1. **Modify Existing Appointment**
   - Update time, duration, or participants
   - Verify changes sync to Google Calendar

2. **Modify Google Calendar Event**
   - Change event details in Google Calendar
   - Verify changes appear in PharmaDOC

### 3. Conflict Resolution

#### Time Overlap Detection
1. **Create Overlapping Appointments**
   - Schedule appointment at 10:00-11:00 AM
   - Try to schedule another at 10:30-11:30 AM
   - Verify conflict detection alert

2. **Test Resolution Options**
   - Try "Reschedule" option
   - Test "Keep Both" with conflicts
   - Verify "Cancel New" functionality

#### Buffer Time Conflicts
1. **Set Buffer Time Preferences**
   - Go to Settings → Buffer Time
   - Set 15-minute before/after buffers
   - Save preferences

2. **Test Buffer Violations**
   - Schedule appointment 11:00-12:00
   - Try to schedule another 12:05-13:00
   - Verify buffer conflict detection
   - Test resolution suggestions

### 4. Multiple Calendar Support

#### Calendar Selection
1. **Access Calendar Selection**
   - Go to Integration Settings
   - Click "Manage Calendars"
   - View available calendars

2. **Test Selection Preferences**
   - Select primary + work calendars
   - Deselect personal calendar
   - Set sync direction preferences
   - Save selections

3. **Verify Multi-Calendar Sync**
   - Create appointments
   - Verify sync to selected calendars only
   - Check that excluded calendars remain unchanged

### 5. Timezone Handling

#### User Timezone Settings
1. **Configure Timezone**
   - Set user timezone to non-UTC (e.g., EST, PST)
   - Configure timezone preferences
   - Test auto-detection

2. **Appointment Display**
   - Create appointment in UTC
   - Verify display in user timezone
   - Check timezone indicator presence

#### DST Transitions
1. **Test Around DST Dates**
   - Schedule recurring appointments
   - Verify correct time adjustments during DST transitions
   - Check notification of timezone changes

### 6. Real-time Updates (Webhooks)

#### Webhook Setup
1. **Verify Webhook Subscription**
   - Check integration logs for webhook setup
   - Verify webhook endpoint is accessible
   - Confirm subscription renewal scheduling

2. **Test Real-time Sync**
   - Make changes in Google Calendar
   - Verify immediate updates in PharmaDOC (within 30 seconds)
   - Test various change types (time, title, attendees)

#### Webhook Failure Handling
1. **Simulate Webhook Failures**
   - Temporarily disable webhook endpoint
   - Make changes in Google Calendar
   - Verify fallback sync mechanisms

### 7. Buffer Time Management

#### Buffer Time Configuration
1. **Configure Buffer Settings**
   - Set different before/after buffer times
   - Test fixed vs adaptive strategies
   - Configure appointment-type specific buffers

2. **Buffer Time Application**
   - Schedule appointments and verify buffers
   - Test buffer conflict detection
   - Verify alternative time suggestions

#### Smart Scheduling
1. **Test Buffer Recommendations**
   - Use adaptive buffer strategy
   - Schedule different appointment types
   - Verify buffer adjustments based on context

### 8. Error Handling & Edge Cases

#### Network Issues
1. **Test Offline Behavior**
   - Disconnect internet during sync
   - Verify graceful degradation
   - Check sync resume after reconnection

2. **API Rate Limiting**
   - Simulate high-frequency sync requests
   - Verify rate limiting handling
   - Check retry mechanisms

#### Data Validation
1. **Invalid Data Handling**
   - Try syncing malformed events
   - Test with missing required fields
   - Verify error messages and recovery

2. **Permission Issues**
   - Test with limited Google Calendar permissions
   - Verify appropriate error handling
   - Check fallback behaviors

## Performance Testing

### Benchmarks

| Operation | Target Performance |
|-----------|-------------------|
| Calendar List Fetch | < 2 seconds |
| Event Sync (100 events) | < 5 seconds |
| Conflict Detection (50 appointments) | < 1 second |
| Buffer Time Calculation | < 500ms |
| Timezone Conversion | < 100ms |
| Webhook Processing | < 200ms |

### Load Testing

1. **Large Calendar Sync**
   - Test with 1000+ events
   - Measure sync duration
   - Monitor memory usage

2. **Concurrent User Testing**
   - Simulate 50+ concurrent users
   - Test webhook processing under load
   - Monitor system stability

## Expected Test Results

### Automated Tests
- ✅ All Jest tests should pass (100% success rate)
- ✅ Code coverage should be > 80%
- ✅ No memory leaks or hanging processes

### Manual Tests
- ✅ All authentication flows work correctly
- ✅ Bidirectional sync maintains data integrity
- ✅ Conflicts are detected and resolved appropriately
- ✅ Real-time updates work reliably
- ✅ Performance meets benchmark targets

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   ```bash
   # Check Google OAuth configuration
   curl -X GET "https://oauth2.googleapis.com/token" \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```

2. **Sync Issues**
   ```bash
   # Check Supabase logs
   npx supabase logs --filter="GoogleCalendar"
   
   # Verify webhook subscriptions
   SELECT * FROM webhook_channels WHERE expiration > NOW();
   ```

3. **Performance Issues**
   ```bash
   # Monitor database performance
   EXPLAIN ANALYZE SELECT * FROM appointments WHERE doctor_id = 'user-id';
   
   # Check API rate limits
   curl -H "Authorization: Bearer $TOKEN" \
     "https://www.googleapis.com/calendar/v3/calendars/primary/events"
   ```

### Debug Mode

Enable verbose logging:
```bash
export TASKMASTER_LOG_LEVEL=debug
export GOOGLE_CALENDAR_DEBUG=true
node src/tests/runGoogleCalendarTests.js
```

## Test Reports

Test execution generates detailed reports:
- `test-report.json` - Automated test results
- `performance-report.json` - Performance metrics
- `coverage/` - Code coverage reports

## Continuous Testing

### Pre-deployment Checklist
- [ ] All automated tests pass
- [ ] Manual test scenarios verified
- [ ] Performance benchmarks met
- [ ] Security tests completed
- [ ] Error handling validated

### Monitoring in Production
- Set up alerts for sync failures
- Monitor webhook subscription health
- Track performance metrics
- Log conflict resolution patterns

## Contact & Support

For testing questions or issues:
- Review service logs in `server/logs/`
- Check Supabase dashboard for database issues
- Verify Google Cloud Console for API quotas
- Review webhook endpoint logs for real-time sync issues

---

**Last Updated**: December 2024  
**Test Coverage**: Google Calendar Integration v1.0  
**Environment**: Development & Production 