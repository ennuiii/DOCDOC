# Google Meet Integration Testing Guide

## Overview

This document provides comprehensive guidance for testing the Google Meet integration functionality in PharmaDOC. The integration enables creation, management, and access control for Google Meet virtual meetings through the Google Calendar API.

## Quick Start

### Running All Tests
```bash
cd server/src/integrations/tests
node runGoogleMeetTests.js all
```

### Running Specific Test Suites
```bash
# Unit tests only
node runGoogleMeetTests.js unit --verbose

# Integration tests with calendar
node runGoogleMeetTests.js integration --coverage

# Security and privacy tests
node runGoogleMeetTests.js security

# Mobile deep linking tests
node runGoogleMeetTests.js mobile

# Performance tests
node runGoogleMeetTests.js performance
```

## Environment Setup

### Prerequisites
- Node.js 16+ 
- Jest testing framework
- Google Calendar API access (for integration testing)

### Environment Variables
For integration testing with real Google APIs:

```bash
# Google OAuth 2.0 Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Test Environment
NODE_ENV=test
```

### Google Cloud Console Setup

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing one

2. **Enable Required APIs**
   ```bash
   # APIs to enable:
   - Google Calendar API
   - Google Meet API (if available)
   ```

3. **Create OAuth 2.0 Credentials**
   - Go to "Credentials" in the Google Cloud Console
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`

4. **Configure OAuth Consent Screen**
   - Set up the OAuth consent screen
   - Add test users for development
   - Configure scopes:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`

## Test Architecture

### Test Structure
```
GoogleMeetIntegration.test.js
├── GoogleMeetService Unit Tests
│   ├── createGoogleMeet()
│   ├── updateGoogleMeet()
│   ├── Security Configuration
│   ├── Meeting Access Validation
│   └── Meeting Details Extraction
├── Google Calendar Sync Integration Tests
│   ├── Calendar Event Creation with Google Meet
│   ├── Calendar Event Updates
│   └── Bidirectional Sync
├── End-to-End Workflow Tests
├── Performance and Load Tests
├── Error Handling and Edge Cases
├── Security and Privacy Tests
└── Mobile Deep Linking Tests
```

### Mock Data Examples

#### Mock Appointment
```javascript
const mockAppointment = {
  id: 'apt_123456',
  purpose: 'Clinical trial discussion',
  duration: 60,
  doctor_id: 'doctor_123',
  pharma_rep_id: 'rep_456',
  video_provider: 'google_meet',
  meeting_type: 'virtual',
  status: 'scheduled',
  integration_data: {
    google_meet: {
      security: {
        enableRecording: false,
        allowExternalGuests: false
      }
    }
  },
  timeslots: {
    date: '2024-01-15',
    start_time: '14:00:00',
    end_time: '15:00:00'
  },
  doctor: {
    id: 'doctor_123',
    name: 'Dr. Sarah Johnson',
    email: 'sarah.johnson@hospital.com'
  },
  pharma_rep: {
    id: 'rep_456',
    name: 'Michael Chen',
    email: 'michael.chen@pharma.com'
  }
};
```

#### Mock Google Calendar Event
```javascript
const mockGoogleEvent = {
  id: 'google_event_123',
  summary: 'PharmaDOC: Clinical trial discussion',
  description: 'Virtual meeting between Dr. Sarah Johnson and Michael Chen',
  start: {
    dateTime: '2024-01-15T14:00:00Z',
    timeZone: 'UTC'
  },
  end: {
    dateTime: '2024-01-15T15:00:00Z',
    timeZone: 'UTC'
  },
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  conferenceData: {
    conferenceId: 'abc-defg-hij',
    conferenceSolution: {
      key: { type: 'hangoutsMeet' },
      name: 'Google Meet'
    },
    entryPoints: [
      {
        entryPointType: 'video',
        uri: 'https://meet.google.com/abc-defg-hij'
      }
    ]
  },
  organizer: { email: 'sarah.johnson@hospital.com' },
  attendees: [
    { email: 'sarah.johnson@hospital.com', responseStatus: 'accepted' },
    { email: 'michael.chen@pharma.com', responseStatus: 'needsAction' }
  ]
};
```

## Test Categories

### 1. Unit Tests
- **GoogleMeetService** methods
- **Security configuration** logic
- **Meeting access validation**
- **URL extraction** and parsing

### 2. Integration Tests
- **Calendar API** integration
- **Conference data** handling
- **Bidirectional sync** functionality
- **Token management**

### 3. End-to-End Tests
- **Complete workflow** from appointment to meeting
- **Cross-service** interactions
- **Data persistence** verification

### 4. Security Tests
- **Access control** validation
- **HIPAA compliance** for medical meetings
- **Pharmaceutical security** profiles
- **External guest** restrictions

### 5. Performance Tests
- **Concurrent meeting** creation
- **Caching** effectiveness
- **Rate limiting** handling
- **Large dataset** processing

### 6. Mobile Tests
- **Deep link** generation
- **Platform detection**
- **App availability** checking
- **Fallback mechanisms**

## Running Tests

### Development Mode
```bash
# Watch mode for active development
node runGoogleMeetTests.js unit --watch

# Verbose output for debugging
node runGoogleMeetTests.js all --verbose
```

### Coverage Analysis
```bash
# Generate coverage report
node runGoogleMeetTests.js all --coverage

# Coverage report location
open coverage/google-meet/lcov-report/index.html
```

### Continuous Integration
```yaml
# GitHub Actions example
name: Google Meet Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Google Meet tests
        run: cd server/src/integrations/tests && node runGoogleMeetTests.js all --coverage
        env:
          NODE_ENV: test
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: ./coverage/google-meet
```

## Debugging Guide

### Common Issues

#### 1. Google API Quota Exceeded
```javascript
// Error: 403 Forbidden - Rate limit exceeded
// Solution: Implement exponential backoff
const retryWithBackoff = async (fn, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 429 && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        continue;
      }
      throw error;
    }
  }
};
```

#### 2. Conference Data Missing
```javascript
// Error: No conference data found in event
// Solution: Ensure conferenceDataVersion is specified
const eventData = {
  summary: 'Meeting Title',
  start: { dateTime: '2024-01-15T14:00:00Z' },
  end: { dateTime: '2024-01-15T15:00:00Z' },
  conferenceData: {
    createRequest: {
      requestId: 'unique-request-id',
      conferenceSolutionKey: { type: 'hangoutsMeet' }
    }
  }
};

// Include conferenceDataVersion in API call
calendar.events.insert({
  calendarId: 'primary',
  resource: eventData,
  conferenceDataVersion: 1
});
```

#### 3. Authentication Failures
```javascript
// Error: Invalid credentials
// Check token expiration and refresh
const isTokenExpired = (tokenExpiresAt) => {
  return new Date(tokenExpiresAt) <= new Date();
};

if (isTokenExpired(tokens.expires_at)) {
  tokens = await googleProvider.refreshToken(tokens.refresh_token);
}
```

### Debug Logging
```javascript
// Enable debug logging in tests
process.env.DEBUG = 'google-meet:*';

// Use structured logging
const logger = {
  info: (message, data) => console.log(JSON.stringify({ level: 'info', message, data })),
  error: (message, error) => console.error(JSON.stringify({ level: 'error', message, error: error.message }))
};
```

## Test Data Management

### Cleanup Between Tests
```javascript
beforeEach(async () => {
  // Clear test calendars
  await cleanupTestCalendars();
  
  // Reset mock data
  jest.clearAllMocks();
  
  // Clear caches
  googleMeetService.clearCache();
});

afterEach(async () => {
  // Cleanup created meetings
  await cleanupTestMeetings();
});
```

### Test Isolation
```javascript
// Use unique identifiers per test
const generateTestId = () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const testAppointment = {
  ...baseAppointment,
  id: generateTestId(),
  doctor_id: generateTestId(),
  pharma_rep_id: generateTestId()
};
```

## Performance Benchmarks

### Expected Performance Metrics
- **Meeting Creation**: < 2 seconds
- **Calendar Sync**: < 5 seconds for 100 events
- **Security Validation**: < 100ms
- **Deep Link Generation**: < 50ms

### Load Testing
```javascript
describe('Load Testing', () => {
  it('should handle 50 concurrent meeting creations', async () => {
    const startTime = Date.now();
    
    const promises = Array.from({ length: 50 }, () =>
      googleMeetService.createGoogleMeet(tokens.access_token, meetingData)
    );
    
    const results = await Promise.allSettled(promises);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(30000); // 30 seconds
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(50);
  });
});
```

## Security Testing

### HIPAA Compliance Validation
```javascript
const validateHIPAACompliance = (meetingConfig) => {
  return {
    requireAuthentication: meetingConfig.requireAuthentication === true,
    allowRecording: meetingConfig.allowRecording === false,
    allowExternalGuests: meetingConfig.allowExternalGuests === false,
    visibility: meetingConfig.visibility === 'private',
    maxParticipants: meetingConfig.maxParticipants <= 4
  };
};
```

### Data Privacy Testing
```javascript
describe('Data Privacy', () => {
  it('should not log sensitive information', () => {
    const sensitiveData = {
      patientId: '12345',
      medicalRecord: 'confidential',
      ssn: '123-45-6789'
    };
    
    // Mock console.log to capture logs
    const logSpy = jest.spyOn(console, 'log');
    
    googleMeetService.createMeeting(meetingData);
    
    // Verify no sensitive data in logs
    logSpy.mock.calls.forEach(call => {
      expect(call[0]).not.toContain(sensitiveData.patientId);
      expect(call[0]).not.toContain(sensitiveData.ssn);
    });
  });
});
```

## Troubleshooting

### Test Failures

1. **Environment Issues**
   - Verify Node.js version (16+)
   - Check Jest installation
   - Validate file paths

2. **Google API Issues**
   - Verify API credentials
   - Check quota limits
   - Validate OAuth scopes

3. **Database Issues**
   - Check Supabase connection
   - Verify table schemas
   - Review data seeding

### Getting Help

- **Google Calendar API Documentation**: https://developers.google.com/calendar/api
- **Google Meet API Documentation**: https://developers.google.com/meet
- **Jest Testing Framework**: https://jestjs.io/docs/getting-started
- **Supabase Documentation**: https://supabase.com/docs

## Contributing

When adding new tests:

1. Follow existing naming conventions
2. Include comprehensive error scenarios
3. Add performance considerations
4. Update documentation
5. Ensure proper cleanup

### Test Template
```javascript
describe('New Feature Tests', () => {
  beforeEach(() => {
    // Setup test environment
  });

  afterEach(() => {
    // Cleanup test data
  });

  it('should handle normal case', async () => {
    // Arrange
    const input = createTestInput();
    
    // Act
    const result = await serviceMethod(input);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should handle error case', async () => {
    // Test error scenarios
  });
});
```

---

*Last updated: January 2024*
*Version: 1.0.0* 