# Webhook Integration Testing Documentation

## Overview
This document describes the comprehensive testing framework for PharmaDOC's webhook processing system. The testing suite validates real-time event processing from all calendar and meeting providers including Google Calendar, Microsoft Graph, Zoom, and CalDAV.

## Architecture

### Core Components
- **WebhookProcessingService**: Main webhook handler and router
- **WebhookQueueService**: Asynchronous job processing with priority queues
- **WebhookSecurityService**: Authentication and validation for all providers
- **WebhookMonitoringService**: Performance tracking and alerting

### Test Structure
```
server/src/integrations/tests/
├── WebhookProcessingIntegration.test.js  # Main test suite
├── runWebhookTests.js                    # CLI test runner
├── setupTests.js                         # Test environment setup
└── WEBHOOK_INTEGRATION_TESTING.md       # This documentation
```

## Test Suites

### 1. Google Calendar Webhook Tests
Tests webhook processing for Google Calendar push notifications:
- Valid webhook payload processing
- Channel ID and resource validation
- Event state handling (exists, not_exists, sync)
- Token authentication
- Expiration handling

**Example Test:**
```javascript
test('should process valid Google Calendar webhook', async () => {
  const response = await request(app)
    .post('/webhooks/google')
    .set({
      'x-goog-channel-id': 'test-channel-123',
      'x-goog-resource-id': 'test-resource-456',
      'x-goog-resource-state': 'exists'
    })
    .expect(200);
});
```

### 2. Microsoft Graph Webhook Tests
Tests Microsoft Graph subscription notifications:
- Notification payload validation
- Multiple notifications in single request
- Subscription expiration handling
- Client state validation
- URL validation challenges

### 3. Zoom Webhook Tests
Tests Zoom meeting event processing:
- Meeting lifecycle events (started, ended)
- Participant events (joined, left)
- URL validation challenges
- Bearer token authentication
- Event timestamp validation

### 4. CalDAV Webhook Tests
Tests CalDAV calendar change notifications:
- Event-level changes (created, updated, deleted)
- Calendar-level changes
- API key authentication
- ETag handling
- Timestamp validation

### 5. Security Validation Tests
Comprehensive security testing:
- Invalid provider rejection
- Authentication failure handling
- Token validation
- Rate limiting
- Malformed payload handling

### 6. Queue Processing Tests
Tests asynchronous job processing:
- Priority queue ordering (high, medium, low)
- Sync job creation and processing
- Meeting event job handling
- Retry mechanisms
- Job status tracking

### 7. Monitoring and Metrics Tests
Tests performance tracking:
- Webhook processing metrics recording
- Security violation logging
- Performance report generation
- Error tracking
- Health check monitoring

### 8. Error Handling Tests
Tests resilience and error recovery:
- Malformed JSON payload handling
- Database connection failures
- Service timeout handling
- Retry logic validation
- Graceful degradation

### 9. Load Testing
Performance and scalability tests:
- Concurrent webhook processing
- Burst event handling
- Queue throughput testing
- Memory usage monitoring
- Response time validation

### 10. End-to-End Workflow Tests
Complete integration scenarios:
- Full Google Calendar sync workflow
- Complete Zoom meeting lifecycle
- Microsoft Graph subscription flow
- CalDAV sync process validation

## Running Tests

### Prerequisites
```bash
# Install test dependencies
npm install --save-dev jest supertest

# Set environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-key"
export ZOOM_WEBHOOK_SECRET_TOKEN="your-zoom-token"
export CALDAV_WEBHOOK_API_KEY="your-caldav-key"
```

### CLI Commands
```bash
# Setup test environment
node runWebhookTests.js setup

# Validate environment
node runWebhookTests.js validate

# Run all tests
node runWebhookTests.js run all

# Run specific test suite
node runWebhookTests.js run google
node runWebhookTests.js run security
node runWebhookTests.js run load

# Generate coverage report
node runWebhookTests.js coverage

# Run performance benchmarks
node runWebhookTests.js benchmark

# Cleanup test environment
node runWebhookTests.js teardown
```

### Test Options
```bash
# Verbose output
node runWebhookTests.js run all --verbose

# With coverage
node runWebhookTests.js run security --coverage

# Watch mode
node runWebhookTests.js run google --watch

# Silent mode
node runWebhookTests.js run all --silent
```

## Test Data Setup

### Database Schema
The tests require the following database tables:
- `calendar_integrations`: Provider integration configurations
- `appointments`: Meeting appointments
- `webhook_jobs`: Queued processing jobs
- `webhook_metrics`: Performance metrics
- `webhook_security_events`: Security violations
- `webhook_errors`: Error logs
- `appointment_logs`: Meeting event logs

### Test Fixtures
Test data includes:
- Mock calendar integrations for all providers
- Sample appointments with external meeting IDs
- Webhook channel/subscription configurations
- Test user accounts and permissions

## Security Testing

### Authentication Tests
- Google Calendar: Channel tokens and expiration
- Microsoft Graph: Client state validation
- Zoom: Bearer token verification
- CalDAV: API key authentication

### Validation Tests
- Payload structure validation
- Event type validation
- Timestamp validation (replay attack prevention)
- Rate limiting enforcement

### Security Violation Handling
- Invalid token rejection
- Malformed payload rejection
- Expired webhook rejection
- Rate limit enforcement

## Performance Benchmarks

### Metrics Tracked
- Webhook processing time (avg, min, max)
- Queue throughput (jobs/second)
- Concurrent request handling
- Memory usage patterns
- Error rates by provider

### Performance Thresholds
- Max processing time: 30 seconds
- Max error rate: 10%
- Max security violations: 5 per hour
- Queue processing: 100 jobs/minute

### Load Testing Scenarios
1. **Single Webhook**: 100 iterations, measures individual processing time
2. **Concurrent Processing**: 10 simultaneous webhooks, tests parallelization
3. **Queue Throughput**: 50 job queue processing, measures efficiency

## Monitoring and Alerting

### Metrics Collection
- Webhook success/failure rates
- Processing time distribution
- Security violation patterns
- Provider-specific performance

### Alert Conditions
- High error rates (>10%)
- Slow processing (>30 seconds)
- Security threshold breaches
- Queue backup conditions

### Reporting
- Hourly performance summaries
- Daily security reports
- Weekly trend analysis
- Monthly capacity planning data

## Debugging

### Verbose Logging
Enable detailed logging with:
```bash
export DEBUG=webhook:*
node runWebhookTests.js run all --verbose
```

### Test Isolation
Run individual test cases:
```bash
# Single test file
npx jest WebhookProcessingIntegration.test.js

# Specific test pattern
npx jest --testNamePattern="Google Calendar"
```

### Mock Data Validation
Verify test data setup:
```bash
node runWebhookTests.js validate
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Webhook Integration Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: node runWebhookTests.js setup
      - run: node runWebhookTests.js run all --coverage
      - run: node runWebhookTests.js benchmark
```

### Coverage Requirements
- Minimum 80% line coverage
- 70% branch coverage
- 90% function coverage
- All critical paths covered

## Troubleshooting

### Common Issues

1. **Database Connection Failures**
   - Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   - Check network connectivity
   - Validate database schema

2. **Authentication Failures**
   - Verify provider API keys/tokens
   - Check token expiration
   - Validate webhook endpoint URLs

3. **Test Timeouts**
   - Increase Jest timeout (default: 30s)
   - Check database performance
   - Monitor network latency

4. **Memory Issues**
   - Monitor test suite memory usage
   - Implement proper cleanup
   - Use test data limits

### Debug Commands
```bash
# Environment validation
node runWebhookTests.js validate

# Database connectivity
node -e "console.log(require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY))"

# Test data verification
node runWebhookTests.js run all --testNamePattern="setup"
```

## Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Implement proper setup/teardown
- Mock external dependencies appropriately

### Data Management
- Use isolated test data
- Implement proper cleanup
- Avoid test data pollution
- Use deterministic test scenarios

### Performance
- Run performance tests separately
- Monitor resource usage
- Implement test timeouts
- Use efficient assertions

### Maintenance
- Update tests with code changes
- Monitor test execution times
- Regular dependency updates
- Documentation updates

## Future Enhancements

### Planned Improvements
1. **Enhanced Load Testing**: More realistic traffic patterns
2. **Chaos Engineering**: Network failure simulation
3. **Performance Profiling**: Detailed bottleneck analysis
4. **Security Penetration**: Advanced attack simulation
5. **Multi-Environment**: Staging and production testing

### Integration Opportunities
1. **Monitoring Integration**: Datadog/New Relic
2. **Alert Integration**: PagerDuty/Slack
3. **Dashboard Integration**: Grafana/Kibana
4. **CI/CD Enhancement**: Advanced pipeline integration

This comprehensive testing framework ensures the reliability, security, and performance of PharmaDOC's webhook processing system across all supported calendar and meeting providers. 