# Microsoft Graph Integration Testing Guide

This document provides comprehensive guidance for testing the Microsoft Graph integration functionality in PharmaDOC, including Outlook Calendar synchronization and Microsoft Teams meeting management.

## Overview

The Microsoft Graph integration testing suite covers:
- **Microsoft OAuth Provider** - Azure AD authentication and token management
- **Outlook Calendar Sync Service** - Bidirectional calendar synchronization
- **Microsoft Teams Meeting Service** - Teams meeting lifecycle management
- **Microsoft Graph Webhook Service** - Real-time event processing
- **End-to-End Integration** - Complete workflow testing
- **Error Handling** - Edge cases and failure scenarios
- **Performance Testing** - Load and stress testing

## Quick Start

### Running All Tests
```bash
# Run all Microsoft Graph integration tests
node server/src/tests/runMicrosoftGraphTests.js --verbose

# Run with coverage
node server/src/tests/runMicrosoftGraphTests.js --coverage --verbose
```

### Running Specific Test Suites
```bash
# Test OAuth functionality
node server/src/tests/runMicrosoftGraphTests.js --suite oauth --verbose

# Test Outlook Calendar sync
node server/src/tests/runMicrosoftGraphTests.js --suite sync --verbose

# Test Teams meeting functionality
node server/src/tests/runMicrosoftGraphTests.js --suite teams --verbose

# Test webhook processing
node server/src/tests/runMicrosoftGraphTests.js --suite webhook --verbose

# Test end-to-end integration
node server/src/tests/runMicrosoftGraphTests.js --suite integration --verbose

# Test error handling
node server/src/tests/runMicrosoftGraphTests.js --suite errors --verbose

# Test performance
node server/src/tests/runMicrosoftGraphTests.js --suite performance --verbose
```

### Development Mode
```bash
# Watch mode for development
node server/src/tests/runMicrosoftGraphTests.js --watch --suite oauth --verbose

# Bail on first failure for quick feedback
node server/src/tests/runMicrosoftGraphTests.js --bail --verbose
```

## Environment Setup

### Required Environment Variables

Create a `.env` file in your project root with the following Microsoft Graph API credentials:

```env
# Microsoft Graph API Configuration
MICROSOFT_CLIENT_ID=your_azure_app_client_id
MICROSOFT_CLIENT_SECRET=your_azure_app_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback
MICROSOFT_TENANT_ID=your_tenant_id_or_common

# Supabase Configuration (for test database)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: Test Tokens (for more comprehensive testing)
TEST_MICROSOFT_ACCESS_TOKEN=your_test_access_token
TEST_MICROSOFT_REFRESH_TOKEN=your_test_refresh_token
TEST_MICROSOFT_USER_ID=your_test_user_id
```

### Azure App Registration Setup

To set up proper testing, you'll need an Azure App Registration:

1. **Go to Azure Portal** → App Registrations → New Registration
2. **Configure Redirect URIs**:
   - Web: `http://localhost:3000/auth/microsoft/callback`
   - SPA: `http://localhost:3000` (for frontend testing)
3. **API Permissions** (Grant admin consent):
   - `Calendars.ReadWrite` - Calendar access
   - `OnlineMeetings.ReadWrite` - Teams meeting management
   - `User.Read` - Basic profile information
   - `offline_access` - Refresh token capability
4. **Authentication Settings**:
   - Enable "ID tokens" and "Access tokens"
   - Configure supported account types (usually "Accounts in any organizational directory and personal Microsoft accounts")

### Database Setup

The tests require a test database. If using Supabase locally:

```bash
# Start local Supabase (if using locally)
npx supabase start

# Apply migrations
npx supabase db reset
```

## Test Architecture

### Test Structure

```
server/src/tests/
├── integration/
│   └── MicrosoftGraphIntegration.test.js    # Main test suite (966 lines)
├── runMicrosoftGraphTests.js                 # Test runner (366 lines)
├── MICROSOFT_GRAPH_TESTING.md              # This documentation
└── setup.js                                # Jest setup configuration
```

### Test Categories

#### 1. Microsoft OAuth Provider Tests
- **Authorization URL Generation** - Validates OAuth flow initialization
- **Token Exchange** - Tests authorization code to token exchange
- **Token Refresh** - Validates refresh token functionality
- **Token Validation** - Tests access token validation
- **Multi-tenant Support** - Tests both work and personal accounts

#### 2. Outlook Calendar Sync Service Tests
- **Appointment to Outlook Sync** - Tests PharmaDOC → Outlook synchronization
- **Outlook to Appointment Sync** - Tests Outlook → PharmaDOC synchronization
- **Bidirectional Sync** - Tests two-way synchronization
- **Conflict Detection** - Tests overlap and conflict resolution
- **Multiple Calendar Support** - Tests sync across multiple calendars
- **Delta Sync** - Tests incremental updates

#### 3. Microsoft Teams Meeting Service Tests
- **Meeting Creation** - Tests Teams meeting creation with all options
- **Meeting Updates** - Tests meeting modification
- **Meeting Deletion** - Tests meeting cleanup
- **Meeting Retrieval** - Tests fetching meeting details
- **Invitation Generation** - Tests HTML/text/ICS invitation formats
- **Meeting Options** - Tests presenter settings, chat, recording, etc.
- **Participant Management** - Tests attendee handling

#### 4. Microsoft Graph Webhook Service Tests
- **Subscription Creation** - Tests webhook subscription setup
- **Subscription Renewal** - Tests automatic renewal before expiration
- **Subscription Deletion** - Tests cleanup of webhook subscriptions
- **Notification Processing** - Tests real-time event processing
- **Notification Validation** - Tests security and validation
- **Auto-renewal Logic** - Tests background subscription maintenance

#### 5. Integration Testing (End-to-End)
- **Complete Appointment Workflow** - Tests full appointment creation with Teams meeting
- **Multi-provider Conflict Resolution** - Tests conflicts across Google/Microsoft
- **Cross-provider Synchronization** - Tests simultaneous sync to multiple providers

#### 6. Error Handling Tests
- **Rate Limiting** - Tests Microsoft Graph API rate limit handling
- **Token Expiration** - Tests automatic token refresh on 401 errors
- **Malformed Data** - Tests handling of invalid webhook notifications
- **Permission Errors** - Tests insufficient privilege scenarios
- **Network Failures** - Tests retry logic and connection issues

#### 7. Performance Tests
- **Batch Operations** - Tests efficiency of multiple simultaneous operations
- **Large Dataset Handling** - Tests sync performance with large calendars
- **Memory Usage** - Tests for memory leaks during long operations
- **Concurrent Access** - Tests multiple user scenarios

## Mock Data and Test Fixtures

### User and Credentials
```javascript
const mockUser = {
    id: 'test-user-123',
    email: 'test@pharmadoc.com',
    role: 'doctor',
    profile: {
        first_name: 'Test',
        last_name: 'Doctor',
        specialization: 'Cardiology'
    }
};

const mockMicrosoftCredentials = {
    access_token: 'mock-ms-access-token',
    refresh_token: 'mock-ms-refresh-token',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    account_type: 'work', // or 'personal'
    tenant_id: 'mock-tenant-123'
};
```

### Appointment Data
```javascript
const mockAppointment = {
    id: 'test-appointment-123',
    doctor_id: 'test-user-123',
    pharma_rep_id: 'test-pharma-456',
    purpose: 'Product Demonstration',
    start_time: '2024-12-25T10:00:00Z',
    end_time: '2024-12-25T11:00:00Z',
    meeting_type: 'virtual',
    status: 'confirmed'
};
```

### Outlook Calendar Event
```javascript
const mockOutlookEvent = {
    id: 'outlook-event-123',
    subject: 'PharmaDOC: Product Demonstration',
    start: { dateTime: '2024-12-25T10:00:00Z', timeZone: 'UTC' },
    end: { dateTime: '2024-12-25T11:00:00Z', timeZone: 'UTC' },
    attendees: [
        {
            emailAddress: { address: 'test@pharmadoc.com', name: 'Test Doctor' },
            status: { response: 'accepted' }
        }
    ],
    onlineMeeting: {
        joinUrl: 'https://teams.microsoft.com/l/meetup-join/...',
        conferenceId: 'mock-conference-id'
    },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness'
};
```

### Teams Meeting
```javascript
const mockTeamsMeeting = {
    id: 'teams-meeting-123',
    joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/...',
    subject: 'PharmaDOC: Product Demonstration',
    startDateTime: '2024-12-25T10:00:00Z',
    endDateTime: '2024-12-25T11:00:00Z',
    participants: {
        organizer: { identity: { user: { id: 'test-user-123' } } },
        attendees: [{ identity: { user: { id: 'pharma-456' } } }]
    },
    meetingInfo: {
        allowedPresenters: 'everyone',
        allowMeetingChat: 'enabled',
        allowTeamworkReactions: true
    }
};
```

## Testing Best Practices

### 1. Isolation and Cleanup
- Each test creates its own test data
- `beforeAll()` sets up common fixtures
- `afterAll()` cleans up all test data
- Tests are designed to run independently

### 2. Mocking External APIs
- Microsoft Graph API calls are mocked using `jest.fn()`
- Responses simulate real Microsoft Graph API behavior
- Error conditions are tested with appropriate HTTP status codes
- Network failures and timeouts are simulated

### 3. Environment Considerations
- Tests use environment variables for configuration
- Fallback values provided for missing environment variables
- Test database isolation from production data
- Configurable timeout values for different test types

### 4. Error Testing
- Tests cover all major error scenarios
- HTTP status codes (401, 403, 429, 500) are properly tested
- Network timeouts and connectivity issues are simulated
- Token expiration and refresh scenarios are validated

## Debugging Tests

### Verbose Output
```bash
# Get detailed test output
node server/src/tests/runMicrosoftGraphTests.js --verbose --suite oauth
```

### Focus on Specific Tests
```bash
# Run only OAuth tests
node server/src/tests/runMicrosoftGraphTests.js --suite oauth --verbose

# Stop on first failure for easier debugging
node server/src/tests/runMicrosoftGraphTests.js --bail --verbose
```

### Coverage Analysis
```bash
# Generate coverage report
node server/src/tests/runMicrosoftGraphTests.js --coverage

# Coverage report will be in coverage/microsoft-graph/
```

### Watch Mode for Development
```bash
# Automatically re-run tests on file changes
node server/src/tests/runMicrosoftGraphTests.js --watch --suite teams
```

## Common Issues and Solutions

### 1. Authentication Errors

**Issue**: OAuth tests failing with authentication errors
**Solution**: 
- Verify `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` are correct
- Check Azure App Registration redirect URIs
- Ensure proper API permissions are granted

### 2. Rate Limiting

**Issue**: Tests failing due to Microsoft Graph rate limits
**Solution**:
- Tests use mocked responses by default
- If testing with real API, add delays between requests
- Consider using test throttling settings

### 3. Token Expiration

**Issue**: Long-running tests failing due to token expiration
**Solution**:
- Tests mock token refresh automatically
- Set shorter test timeouts for quicker feedback
- Use fresh test tokens for extended testing

### 4. Webhook Validation

**Issue**: Webhook tests failing validation
**Solution**:
- Ensure webhook endpoint is accessible
- Check client state generation and validation
- Verify subscription configuration matches test setup

### 5. Database Connection Issues

**Issue**: Tests failing to connect to test database
**Solution**:
- Verify Supabase is running locally
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Ensure database migrations are applied

## Performance Benchmarks

### Expected Performance Metrics

- **OAuth Token Exchange**: < 500ms
- **Single Calendar Event Sync**: < 300ms
- **Batch Calendar Sync (10 events)**: < 2 seconds
- **Teams Meeting Creation**: < 1 second
- **Webhook Processing**: < 100ms
- **Large Calendar Sync (100 events)**: < 10 seconds

### Performance Test Configuration

The performance tests create varying loads:
- 10 concurrent appointments for batch testing
- 100 calendar events for large dataset testing
- Multiple simultaneous users for concurrency testing

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Microsoft Graph Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v2
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install
      
    - name: Setup test environment
      env:
        MICROSOFT_CLIENT_ID: ${{ secrets.MICROSOFT_CLIENT_ID }}
        MICROSOFT_CLIENT_SECRET: ${{ secrets.MICROSOFT_CLIENT_SECRET }}
        MICROSOFT_REDIRECT_URI: http://localhost:3000/auth/microsoft/callback
        SUPABASE_URL: http://localhost:54321
        SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      run: |
        npx supabase start
        npx supabase db reset
    
    - name: Run Microsoft Graph tests
      run: node server/src/tests/runMicrosoftGraphTests.js --coverage --bail
      
    - name: Upload coverage
      uses: codecov/codecov-action@v1
      with:
        file: ./coverage/microsoft-graph/lcov.info
```

## Troubleshooting Guide

### Test Environment Issues

1. **Missing Environment Variables**
   ```bash
   # Check if all required variables are set
   node -e "
   const required = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'];
   required.forEach(env => console.log(env + ':', process.env[env] ? '✓' : '✗'));
   "
   ```

2. **Database Connection Problems**
   ```bash
   # Test Supabase connection
   npx supabase status
   
   # Reset if needed
   npx supabase db reset
   ```

3. **Port Conflicts**
   ```bash
   # Check if ports are available
   netstat -tuln | grep 3000
   netstat -tuln | grep 54321
   ```

### API Testing Issues

1. **Microsoft Graph API Permissions**
   - Verify app registration in Azure Portal
   - Check that admin consent is granted
   - Ensure correct redirect URIs are configured

2. **Token Issues**
   - Check token expiration times
   - Verify refresh token functionality
   - Test with fresh tokens

3. **Webhook Problems**
   - Ensure webhook endpoint is publicly accessible
   - Check subscription validation logic
   - Verify client state generation

## Advanced Testing Scenarios

### Multi-tenant Testing
```javascript
// Test both work and personal accounts
const workAccountConfig = { tenant: 'organizations' };
const personalAccountConfig = { tenant: 'consumers' };
```

### Compliance and Security Testing
```javascript
// Test data privacy and GDPR compliance
const dataRetentionTests = {
    userDeletion: 'Verify all user data is properly deleted',
    dataExport: 'Test personal data export functionality',
    consentManagement: 'Verify consent tracking and management'
};
```

### Disaster Recovery Testing
```javascript
// Test system recovery scenarios
const recoveryTests = {
    tokenRevocation: 'Handle revoked Microsoft tokens gracefully',
    serviceOutage: 'Graceful degradation during Microsoft Graph outages',
    dataInconsistency: 'Recover from sync inconsistencies'
};
```

## Contributing to Tests

### Adding New Tests

1. **Create test case in appropriate describe block**
2. **Follow existing patterns for mocking**
3. **Include both success and failure scenarios**
4. **Add performance considerations for new features**
5. **Update this documentation with new test scenarios**

### Test Code Style

- Use descriptive test names that explain the scenario
- Group related tests in describe blocks
- Mock external dependencies consistently
- Include setup and teardown for test isolation
- Add comments for complex test scenarios

---

For more information about the Microsoft Graph integration architecture, see the service implementation files in `server/src/integrations/services/` and `server/src/integrations/providers/microsoft/`. 