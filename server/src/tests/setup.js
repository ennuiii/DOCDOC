/**
 * Jest Test Setup
 * Configures the test environment for Google Calendar integration tests
 */

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock environment variables for testing if not set
if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'http://localhost:54321';
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
}

if (!process.env.GOOGLE_CLIENT_ID) {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
}

// Global test configuration
global.testConfig = {
    timeout: 30000,
    retries: 3
};

// Setup global mocks
global.mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

// Console logging for tests
if (process.env.TEST_VERBOSE === 'true') {
    console.log('Test environment initialized');
    console.log('Environment variables configured');
}

export default {}; 