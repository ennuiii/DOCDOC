# CalDAV Integration Testing Guide

This guide provides comprehensive instructions for testing the PharmaDOC CalDAV integration, which supports universal calendar synchronization with Apple iCloud, Yahoo Calendar, and generic CalDAV servers.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Setup](#environment-setup)
3. [CalDAV Provider Configuration](#caldav-provider-configuration)
4. [Test Architecture](#test-architecture)
5. [Running Tests](#running-tests)
6. [Mock Data and Examples](#mock-data-and-examples)
7. [Debugging Guide](#debugging-guide)
8. [Performance Benchmarks](#performance-benchmarks)

## Quick Start

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install

# Run all CalDAV tests
node src/integrations/tests/runCalDAVTests.js

# Run specific test suites
node src/integrations/tests/runCalDAVTests.js --client
node src/integrations/tests/runCalDAVTests.js --sync
node src/integrations/tests/runCalDAVTests.js --provider apple
```

## Environment Setup

### Required Dependencies

The CalDAV integration tests require the following npm packages:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x.x",
    "axios": "^1.x.x",
    "fast-xml-parser": "^4.x.x",
    "ical": "^0.8.x"
  },
  "devDependencies": {
    "jest": "^29.x.x",
    "@jest/globals": "^29.x.x"
  }
}
```

### Test Environment Validation

Run environment validation before executing tests:

```bash
node src/integrations/tests/runCalDAVTests.js --env
```

This validates:
- Node.js version (≥16)
- Jest availability
- Required npm packages
- Test files existence
- Module resolution

## CalDAV Provider Configuration

### Apple iCloud Configuration

Apple iCloud requires app-specific passwords for CalDAV access:

```javascript
const iCloudConfig = {
  provider: 'apple_icloud',
  serverUrl: 'https://caldav.icloud.com',
  username: 'your-icloud-email@icloud.com',
  password: 'app-specific-password', // Generate in Apple ID settings
  principalUrl: 'https://caldav.icloud.com/{dav-username}/principal/',
  calendarHomeUrl: 'https://caldav.icloud.com/{dav-username}/calendars/',
  requiresAppPassword: true,
  supportsColors: true,
  supportsTimeZones: true,
  capabilities: ['calendar-access', 'calendar-schedule', 'calendar-auto-schedule']
};
```

**Setup Steps:**
1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. Navigate to "App-Specific Passwords"
4. Generate a new password for "PharmaDOC Calendar"
5. Use this password in the configuration

### Yahoo Calendar Configuration

Yahoo Calendar also requires app passwords:

```javascript
const yahooConfig = {
  provider: 'yahoo',
  serverUrl: 'https://caldav.calendar.yahoo.com',
  username: 'your-email@yahoo.com',
  password: 'app-password',
  principalUrl: 'https://caldav.calendar.yahoo.com/dav/{username}/principal/',
  calendarHomeUrl: 'https://caldav.calendar.yahoo.com/dav/{username}/Calendar/',
  requiresAppPassword: true,
  supportsColors: false,
  supportsTimeZones: true,
  capabilities: ['calendar-access']
};
```

**Setup Steps:**
1. Go to [Yahoo Account Security](https://login.yahoo.com/account/security)
2. Turn on 2-step verification if not already enabled
3. Generate an app password for "PharmaDOC"
4. Use this password in the configuration

### Generic CalDAV Configuration

For other CalDAV servers (Nextcloud, SOGo, etc.):

```javascript
const genericConfig = {
  provider: 'generic',
  serverUrl: 'https://your-caldav-server.com',
  username: 'your-username',
  password: 'your-password',
  principalUrl: 'https://your-caldav-server.com/principals/{username}/',
  calendarHomeUrl: 'https://your-caldav-server.com/calendars/{username}/',
  requiresAppPassword: false,
  supportsColors: false, // Depends on server
  supportsTimeZones: true,
  capabilities: ['calendar-access'] // Server-dependent
};
```

## Test Architecture

### Test Structure

```
CalDAV Integration Tests
├── CalDAVClient Tests
│   ├── Provider Detection
│   ├── Authentication
│   ├── Calendar Discovery
│   ├── Event Synchronization
│   ├── Event CRUD Operations
│   └── iCalendar Processing
├── CalDAVSyncService Tests
│   ├── Integration Setup
│   ├── Synchronization Operations
│   ├── Event Import/Export
│   ├── Conflict Resolution
│   └── Data Conversion
├── Provider-Specific Tests
│   ├── Apple iCloud Integration
│   ├── Yahoo Calendar Integration
│   └── Generic CalDAV Integration
├── Error Handling Tests
├── Security Tests
└── Performance Tests
```

### Mock Data

The tests use comprehensive mock data for different scenarios:

```javascript
// Mock iCloud event
const mockCalDAVEvent = {
  uid: 'test-event-123@icloud.com',
  title: 'Doctor Appointment',
  description: 'Consultation with Dr. Smith',
  startTime: '2024-01-15T14:00:00Z',
  endTime: '2024-01-15T15:00:00Z',
  location: 'Medical Center',
  attendees: [
    {
      email: 'doctor@hospital.com',
      name: 'Dr. Smith',
      status: 'ACCEPTED'
    }
  ],
  organizer: {
    email: 'doctor@hospital.com',
    name: 'Dr. Smith'
  },
  timezone: 'America/New_York',
  etag: '"1234567890"',
  provider: 'apple_icloud'
};

// Mock PharmaDOC appointment
const mockAppointment = {
  id: 'apt_123456',
  purpose: 'Clinical trial discussion',
  duration: 60,
  doctor_id: 'doctor_123',
  pharma_rep_id: 'rep_456',
  status: 'scheduled',
  external_provider: 'apple_icloud',
  external_event_id: 'test-event-123@icloud.com',
  integration_data: {
    caldav: {
      provider: 'apple_icloud',
      etag: '"1234567890"',
      originalEvent: mockCalDAVEvent
    }
  }
};
```

## Running Tests

### All Tests

```bash
# Run complete test suite with coverage
node src/integrations/tests/runCalDAVTests.js

# Run with verbose output
node src/integrations/tests/runCalDAVTests.js --verbose
```

### Specific Test Suites

```bash
# CalDAVClient tests only
node src/integrations/tests/runCalDAVTests.js --client

# CalDAVSyncService tests only
node src/integrations/tests/runCalDAVTests.js --sync

# Security tests only
node src/integrations/tests/runCalDAVTests.js --security

# Performance tests only
node src/integrations/tests/runCalDAVTests.js --performance
```

### Provider-Specific Tests

```bash
# Apple iCloud tests
node src/integrations/tests/runCalDAVTests.js --provider apple

# Yahoo Calendar tests
node src/integrations/tests/runCalDAVTests.js --provider yahoo

# Generic CalDAV tests
node src/integrations/tests/runCalDAVTests.js --provider generic
```

### Direct Jest Execution

```bash
# Run with Jest directly
npx jest src/integrations/tests/CalDAVIntegration.test.js

# Run specific test pattern
npx jest src/integrations/tests/CalDAVIntegration.test.js --testNamePattern="CalDAVClient"

# Run with coverage
npx jest src/integrations/tests/CalDAVIntegration.test.js --coverage
```

## Mock Data and Examples

### iCalendar Event Format

```ical
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PharmaDOC//CalDAV Integration//EN
BEGIN:VEVENT
UID:test-event-123@icloud.com
DTSTAMP:20240115T130000Z
DTSTART:20240115T140000Z
DTEND:20240115T150000Z
SUMMARY:Doctor Appointment
DESCRIPTION:Consultation with Dr. Smith
LOCATION:Medical Center
ORGANIZER;CN=Dr. Smith:MAILTO:doctor@hospital.com
ATTENDEE;CN=John Doe;PARTSTAT=NEEDS-ACTION:MAILTO:patient@email.com
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
```

### CalDAV XML Responses

#### PROPFIND Response
```xml
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/calendars/testuser/work/</href>
    <propstat>
      <prop>
        <displayname>Work Calendar</displayname>
        <C:calendar-description>Work related events</C:calendar-description>
        <resourcetype>
          <collection/>
          <C:calendar/>
        </resourcetype>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>
```

#### REPORT Response
```xml
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/calendars/testuser/work/event-123.ics</href>
    <propstat>
      <prop>
        <getetag>"1234567890"</getetag>
        <C:calendar-data>BEGIN:VCALENDAR...END:VCALENDAR</C:calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>
```

## Debugging Guide

### Common Issues

#### Authentication Failures

**Symptoms:**
- 401 Unauthorized errors
- "Authentication failed" messages

**Solutions:**
1. Verify app-specific passwords for iCloud/Yahoo
2. Check username format (email vs username)
3. Validate server URLs
4. Test credentials with external CalDAV client

#### Calendar Discovery Issues

**Symptoms:**
- Empty calendar lists
- "Failed to discover calendars" errors

**Solutions:**
1. Verify principal URL configuration
2. Check calendar home URL
3. Ensure proper authentication
4. Test with manual PROPFIND requests

#### Event Sync Problems

**Symptoms:**
- Events not syncing
- Sync token errors
- Conflict resolution issues

**Solutions:**
1. Check event format compliance
2. Verify timezone handling
3. Review conflict resolution settings
4. Test with smaller event sets

### Debug Mode

Enable debug logging in tests:

```javascript
// Add to test setup
process.env.NODE_ENV = 'test';
process.env.CALDAV_DEBUG = 'true';
```

### Manual Testing

Test CalDAV operations manually:

```bash
# Test authentication
curl -u "username:password" -X PROPFIND \
  -H "Depth: 0" \
  -H "Content-Type: text/xml" \
  https://caldav.icloud.com/

# Test calendar discovery
curl -u "username:password" -X PROPFIND \
  -H "Depth: 1" \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0"?>
      <propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
        <prop>
          <displayname/>
          <resourcetype/>
          <C:supported-calendar-component-set/>
        </prop>
      </propfind>' \
  https://caldav.icloud.com/username/calendars/
```

## Performance Benchmarks

### Expected Performance Metrics

| Operation | Apple iCloud | Yahoo Calendar | Generic CalDAV |
|-----------|--------------|----------------|----------------|
| Authentication | < 500ms | < 800ms | < 300ms |
| Calendar Discovery | < 1000ms | < 1500ms | < 800ms |
| Event Sync (10 events) | < 2000ms | < 3000ms | < 1500ms |
| Event Creation | < 800ms | < 1200ms | < 600ms |
| Event Update | < 600ms | < 1000ms | < 500ms |

### Load Testing

```javascript
// Test concurrent sync operations
it('should handle concurrent sync operations', async () => {
  const promises = Array.from({ length: 10 }, () =>
    calDAVSyncService.performSync('user_123')
  );
  
  const startTime = Date.now();
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  expect(duration).toBeLessThan(10000); // 10 seconds
  expect(results.every(r => r.success)).toBe(true);
});
```

### Memory Usage

Monitor memory usage during large sync operations:

```javascript
// Before test
const memBefore = process.memoryUsage();

// Run sync operation
await syncLargeCalendar();

// After test
const memAfter = process.memoryUsage();
const heapUsed = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

expect(heapUsed).toBeLessThan(50); // Less than 50MB
```

## Security Considerations

### Password Security

- Never commit real passwords to version control
- Use environment variables for sensitive data
- Implement secure password encryption
- Regularly rotate app-specific passwords

### Data Privacy

- Ensure HIPAA compliance for medical appointments
- Implement proper data anonymization in tests
- Use synthetic test data only
- Follow data retention policies

### Network Security

- Use HTTPS for all CalDAV communications
- Validate SSL certificates
- Implement proper timeout handling
- Use secure authentication methods

## Additional Resources

- [CalDAV Specification (RFC 4791)](https://tools.ietf.org/html/rfc4791)
- [Apple iCloud CalDAV Documentation](https://developer.apple.com/documentation/)
- [Yahoo Calendar API Documentation](https://developer.yahoo.com/)
- [Jest Testing Framework](https://jestjs.io/)
- [PharmaDOC Integration Guide](../README.md)
