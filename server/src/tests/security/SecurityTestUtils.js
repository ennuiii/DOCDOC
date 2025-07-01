/**
 * Security Test Utilities
 * 
 * Provides utilities for security testing including:
 * - Test environment setup and cleanup
 * - Mock data generation
 * - Security assertion helpers
 * - Performance benchmarking
 * - Vulnerability simulation
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

class SecurityTestUtils {
    constructor(config) {
        this.config = config;
        this.supabase = createClient(
            config.supabase.url,
            config.supabase.key
        );
        
        // Test data storage
        this.testData = {
            users: new Map(),
            integrations: new Map(),
            tokens: new Map(),
            auditLogs: new Map()
        };
        
        // Performance metrics
        this.performanceMetrics = {
            operationTimes: [],
            memoryUsage: [],
            errorRates: []
        };
    }

    /**
     * Setup test environment
     */
    async setupTestEnvironment() {
        try {
            console.log('Setting up security test environment...');
            
            // Create test users
            await this.createTestUsers();
            
            // Create test integrations
            await this.createTestIntegrations();
            
            // Initialize test database state
            await this.initializeTestDatabase();
            
            // Setup mock API endpoints
            await this.setupMockEndpoints();
            
            console.log('Security test environment setup complete');
        } catch (error) {
            console.error('Failed to setup test environment:', error);
            throw error;
        }
    }

    /**
     * Cleanup test environment
     */
    async cleanupTestEnvironment() {
        try {
            console.log('Cleaning up security test environment...');
            
            // Remove test data
            await this.removeTestUsers();
            await this.removeTestIntegrations();
            await this.clearTestAuditLogs();
            
            // Clear caches
            this.testData.users.clear();
            this.testData.integrations.clear();
            this.testData.tokens.clear();
            this.testData.auditLogs.clear();
            
            console.log('Security test environment cleanup complete');
        } catch (error) {
            console.error('Failed to cleanup test environment:', error);
            // Don't throw on cleanup failures
        }
    }

    /**
     * Reset test state between tests
     */
    async resetTestState() {
        // Reset performance metrics
        this.performanceMetrics = {
            operationTimes: [],
            memoryUsage: [],
            errorRates: []
        };
        
        // Clear any cached data that might affect tests
        await this.clearSecurityEventCache();
        await this.resetRateLimitCounters();
    }

    /**
     * Create test users with different roles
     */
    async createTestUsers() {
        const users = [
            { id: 'test-admin-001', role: 'admin', email: 'admin@test.pharmadoc.com' },
            { id: 'test-user-001', role: 'user', email: 'user@test.pharmadoc.com' },
            { id: 'test-premium-001', role: 'premium_user', email: 'premium@test.pharmadoc.com' },
            { id: 'test-readonly-001', role: 'readonly', email: 'readonly@test.pharmadoc.com' }
        ];

        for (const user of users) {
            // Store in test data
            this.testData.users.set(user.id, user);
            
            // Create in database if needed
            const { error } = await this.supabase
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    created_at: new Date().toISOString(),
                    is_test_user: true
                }, { onConflict: 'id' });

            if (error && !error.message.includes('already exists')) {
                console.warn(`Warning: Could not create test user ${user.id}:`, error.message);
            }
        }
    }

    /**
     * Create test integrations for different providers
     */
    async createTestIntegrations() {
        const integrations = [
            {
                id: 'test-google-001',
                user_id: 'test-user-001',
                provider: 'google',
                status: 'active',
                encrypted_tokens: this.generateMockEncryptedTokens('google')
            },
            {
                id: 'test-microsoft-001',
                user_id: 'test-premium-001',
                provider: 'microsoft',
                status: 'active',
                encrypted_tokens: this.generateMockEncryptedTokens('microsoft')
            },
            {
                id: 'test-zoom-001',
                user_id: 'test-admin-001',
                provider: 'zoom',
                status: 'active',
                encrypted_tokens: this.generateMockEncryptedTokens('zoom')
            },
            {
                id: 'test-caldav-001',
                user_id: 'test-user-001',
                provider: 'caldav',
                status: 'active',
                encrypted_tokens: this.generateMockEncryptedTokens('caldav')
            }
        ];

        for (const integration of integrations) {
            this.testData.integrations.set(integration.id, integration);
            
            const { error } = await this.supabase
                .from('calendar_integrations')
                .upsert({
                    ...integration,
                    created_at: new Date().toISOString(),
                    is_test_integration: true
                }, { onConflict: 'id' });

            if (error && !error.message.includes('already exists')) {
                console.warn(`Warning: Could not create test integration ${integration.id}:`, error.message);
            }
        }
    }

    /**
     * Generate mock encrypted tokens for testing
     */
    generateMockEncryptedTokens(provider) {
        const mockTokenData = {
            access_token: `mock-access-token-${provider}-${Date.now()}`,
            refresh_token: `mock-refresh-token-${provider}-${Date.now()}`,
            token_expires_at: new Date(Date.now() + 3600000).toISOString(),
            scope: this.getProviderScopes(provider)
        };

        // Create a mock encrypted structure
        return JSON.stringify({
            encrypted_data: crypto.randomBytes(64).toString('hex'),
            iv: crypto.randomBytes(16).toString('hex'),
            auth_tag: crypto.randomBytes(16).toString('hex'),
            encryption_version: '1.0'
        });
    }

    /**
     * Get typical scopes for each provider
     */
    getProviderScopes(provider) {
        const scopes = {
            google: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
            microsoft: 'https://graph.microsoft.com/calendars.readwrite https://graph.microsoft.com/user.read',
            zoom: 'meeting:write meeting:read',
            caldav: 'calendar:read calendar:write'
        };
        
        return scopes[provider] || 'basic';
    }

    /**
     * Initialize test database state
     */
    async initializeTestDatabase() {
        // Create test audit log entries
        await this.createTestAuditLogs();
        
        // Create test security events
        await this.createTestSecurityEvents();
        
        // Create test permissions
        await this.createTestPermissions();
        
        // Create test GDPR consent records
        await this.createTestConsentRecords();
    }

    /**
     * Create test audit logs
     */
    async createTestAuditLogs() {
        const auditLogs = [
            {
                id: 'audit-001',
                user_id: 'test-user-001',
                event_type: 'oauth_token_refresh',
                timestamp: new Date().toISOString(),
                metadata: { provider: 'google', success: true },
                integrity_hash: crypto.randomBytes(32).toString('hex')
            },
            {
                id: 'audit-002',
                user_id: 'test-premium-001',
                event_type: 'api_request',
                timestamp: new Date().toISOString(),
                metadata: { endpoint: '/calendar/events', status: 200 },
                integrity_hash: crypto.randomBytes(32).toString('hex')
            }
        ];

        for (const log of auditLogs) {
            this.testData.auditLogs.set(log.id, log);
        }
    }

    /**
     * Create test security events
     */
    async createTestSecurityEvents() {
        const securityEvents = [
            {
                user_id: 'test-user-001',
                event_type: 'suspicious_login_attempt',
                risk_score: 7.5,
                metadata: {
                    ip_address: '192.168.1.100',
                    user_agent: 'Suspicious Bot 1.0'
                }
            },
            {
                user_id: 'test-premium-001',
                event_type: 'rate_limit_exceeded',
                risk_score: 5.0,
                metadata: {
                    endpoint: '/api/calendar/sync',
                    requests_count: 150
                }
            }
        ];

        // These would be stored in the audit system
        for (const event of securityEvents) {
            // Store for test verification
            this.testData.auditLogs.set(`security-${Date.now()}`, event);
        }
    }

    /**
     * Create test permissions
     */
    async createTestPermissions() {
        const permissions = [
            {
                user_id: 'test-user-001',
                permission: 'calendar.read',
                granted_by: 'system',
                granted_at: new Date().toISOString()
            },
            {
                user_id: 'test-user-001',
                permission: 'calendar.write',
                granted_by: 'system',
                granted_at: new Date().toISOString()
            },
            {
                user_id: 'test-admin-001',
                permission: '*',
                granted_by: 'system',
                granted_at: new Date().toISOString()
            }
        ];

        // Store permissions for testing
        for (const permission of permissions) {
            const key = `${permission.user_id}-${permission.permission}`;
            this.testData.users.set(key, permission);
        }
    }

    /**
     * Create test GDPR consent records
     */
    async createTestConsentRecords() {
        const consentRecords = [
            {
                user_id: 'test-user-001',
                consent_type: 'functional',
                consent_given: true,
                consent_method: 'explicit',
                timestamp: new Date().toISOString()
            },
            {
                user_id: 'test-user-001',
                consent_type: 'analytics',
                consent_given: false,
                consent_method: 'explicit',
                timestamp: new Date().toISOString()
            }
        ];

        // Store consent records for testing
        for (const record of consentRecords) {
            const key = `consent-${record.user_id}-${record.consent_type}`;
            this.testData.users.set(key, record);
        }
    }

    /**
     * Setup mock API endpoints for testing
     */
    async setupMockEndpoints() {
        // This would typically setup mock HTTP servers
        // For now, we'll just log that we're setting up mocks
        console.log('Setting up mock API endpoints for security testing');
    }

    /**
     * Remove test users from database
     */
    async removeTestUsers() {
        const { error } = await this.supabase
            .from('users')
            .delete()
            .eq('is_test_user', true);

        if (error) {
            console.warn('Warning: Could not remove test users:', error.message);
        }
    }

    /**
     * Remove test integrations from database
     */
    async removeTestIntegrations() {
        const { error } = await this.supabase
            .from('calendar_integrations')
            .delete()
            .eq('is_test_integration', true);

        if (error) {
            console.warn('Warning: Could not remove test integrations:', error.message);
        }
    }

    /**
     * Clear test audit logs
     */
    async clearTestAuditLogs() {
        // This would clear test audit logs from the database
        console.log('Clearing test audit logs');
    }

    /**
     * Clear security event cache
     */
    async clearSecurityEventCache() {
        // This would clear any cached security events
        console.log('Clearing security event cache');
    }

    /**
     * Reset rate limit counters
     */
    async resetRateLimitCounters() {
        // This would reset rate limiting counters
        console.log('Resetting rate limit counters');
    }

    /**
     * Generate malicious payloads for security testing
     */
    generateMaliciousPayloads() {
        return {
            xss: {
                simple: '<script>alert("xss")</script>',
                encoded: '%3Cscript%3Ealert(%22xss%22)%3C/script%3E',
                img_onerror: '<img src=x onerror=alert("xss")>',
                svg: '<svg onload=alert("xss")></svg>'
            },
            sqlInjection: {
                simple: "'; DROP TABLE users; --",
                union: "' UNION SELECT * FROM sensitive_table --",
                boolean: "' OR '1'='1",
                time_based: "'; WAITFOR DELAY '00:00:05' --"
            },
            pathTraversal: {
                simple: '../../../etc/passwd',
                encoded: '%2e%2e%2f%2e%2e%2f%2e%2e%2f%65%74%63%2f%70%61%73%73%77%64',
                windows: '..\\..\\..\\windows\\system32\\config\\sam'
            },
            commandInjection: {
                simple: '; cat /etc/passwd',
                backticks: '`cat /etc/passwd`',
                subshell: '$(cat /etc/passwd)'
            },
            oversized: {
                large_string: 'A'.repeat(10 * 1024 * 1024), // 10MB string
                deep_object: this.createDeepObject(20), // 20 levels deep
                many_keys: this.createManyKeysObject(10000) // 10k properties
            }
        };
    }

    /**
     * Create deeply nested object for testing
     */
    createDeepObject(depth) {
        let obj = {};
        let current = obj;
        
        for (let i = 0; i < depth; i++) {
            current.nested = {};
            current = current.nested;
        }
        
        current.value = 'deep_value';
        return obj;
    }

    /**
     * Create object with many keys for testing
     */
    createManyKeysObject(count) {
        const obj = {};
        for (let i = 0; i < count; i++) {
            obj[`key_${i}`] = `value_${i}`;
        }
        return obj;
    }

    /**
     * Generate performance test data
     */
    generatePerformanceTestData() {
        return {
            concurrent_requests: Array.from({ length: 100 }, (_, i) => ({
                id: i,
                timestamp: Date.now() + i * 100,
                payload: { data: `request_${i}` }
            })),
            large_payloads: Array.from({ length: 10 }, (_, i) => ({
                id: i,
                data: crypto.randomBytes(1024 * 1024).toString('hex') // 1MB each
            })),
            rapid_fire: Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                timestamp: Date.now() + i
            }))
        };
    }

    /**
     * Assert security properties
     */
    assertSecure(value, checks = {}) {
        const assertions = {
            noXSS: () => {
                if (typeof value === 'string') {
                    expect(value).not.toMatch(/<script[^>]*>/i);
                    expect(value).not.toMatch(/javascript:/i);
                    expect(value).not.toMatch(/on\w+\s*=/i);
                }
            },
            noSQLInjection: () => {
                if (typeof value === 'string') {
                    expect(value).not.toMatch(/['"];?\s*(drop|delete|update|insert|select)\s/i);
                    expect(value).not.toMatch(/union\s+select/i);
                    expect(value).not.toMatch(/or\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i);
                }
            },
            noPathTraversal: () => {
                if (typeof value === 'string') {
                    expect(value).not.toMatch(/\.\.\//);
                    expect(value).not.toMatch(/\.\.\\/);
                    expect(value).not.toMatch(/%2e%2e%2f/i);
                }
            },
            encrypted: () => {
                if (typeof value === 'string') {
                    // Should not contain plaintext patterns
                    expect(value).not.toMatch(/password|token|secret|key/i);
                    // Should look like encrypted data (hex or base64)
                    expect(value).toMatch(/^[a-f0-9]{32,}$|^[A-Za-z0-9+/]+=*$/);
                }
            },
            hasIntegrity: () => {
                if (typeof value === 'object' && value !== null) {
                    expect(value).toHaveProperty('integrity_hash');
                    expect(value.integrity_hash).toMatch(/^[a-f0-9]{64}$/);
                }
            }
        };

        // Run requested checks
        Object.keys(checks).forEach(check => {
            if (checks[check] && assertions[check]) {
                assertions[check]();
            }
        });
    }

    /**
     * Measure operation performance
     */
    async measurePerformance(operation, label = 'operation') {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();

        let result;
        let error = null;

        try {
            result = await operation();
        } catch (err) {
            error = err;
        }

        const endTime = Date.now();
        const endMemory = process.memoryUsage();

        const metrics = {
            label,
            duration: endTime - startTime,
            memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
            success: error === null,
            error: error?.message
        };

        this.performanceMetrics.operationTimes.push(metrics);

        if (error) {
            throw error;
        }

        return { result, metrics };
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const operations = this.performanceMetrics.operationTimes;
        
        if (operations.length === 0) {
            return { message: 'No performance data collected' };
        }

        const durations = operations.map(op => op.duration);
        const memoryUsages = operations.map(op => op.memoryUsed);
        const successRate = operations.filter(op => op.success).length / operations.length;

        return {
            total_operations: operations.length,
            success_rate: successRate,
            duration: {
                min: Math.min(...durations),
                max: Math.max(...durations),
                avg: durations.reduce((a, b) => a + b, 0) / durations.length,
                p95: this.percentile(durations, 95)
            },
            memory: {
                min: Math.min(...memoryUsages),
                max: Math.max(...memoryUsages),
                avg: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length
            },
            errors: operations.filter(op => !op.success).map(op => ({
                label: op.label,
                error: op.error
            }))
        };
    }

    /**
     * Calculate percentile
     */
    percentile(arr, p) {
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[index];
    }

    /**
     * Simulate attack scenarios
     */
    simulateAttacks() {
        return {
            bruteForce: async (target, attempts = 100) => {
                const results = [];
                for (let i = 0; i < attempts; i++) {
                    try {
                        const result = await target(`attempt_${i}`);
                        results.push({ attempt: i, success: true, result });
                    } catch (error) {
                        results.push({ attempt: i, success: false, error: error.message });
                    }
                }
                return results;
            },
            
            replayAttack: async (request, delay = 1000) => {
                // Send same request multiple times with delay
                const results = [];
                for (let i = 0; i < 3; i++) {
                    if (i > 0) await new Promise(resolve => setTimeout(resolve, delay));
                    try {
                        const result = await request();
                        results.push({ replay: i, success: true, result });
                    } catch (error) {
                        results.push({ replay: i, success: false, error: error.message });
                    }
                }
                return results;
            },
            
            timingAttack: async (validOperation, invalidOperation, iterations = 10) => {
                const validTimes = [];
                const invalidTimes = [];
                
                for (let i = 0; i < iterations; i++) {
                    // Time valid operation
                    const validStart = Date.now();
                    try {
                        await validOperation();
                    } catch (e) { /* ignore */ }
                    validTimes.push(Date.now() - validStart);
                    
                    // Time invalid operation
                    const invalidStart = Date.now();
                    try {
                        await invalidOperation();
                    } catch (e) { /* ignore */ }
                    invalidTimes.push(Date.now() - invalidStart);
                }
                
                return {
                    valid_avg: validTimes.reduce((a, b) => a + b, 0) / validTimes.length,
                    invalid_avg: invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length,
                    timing_difference: Math.abs(
                        validTimes.reduce((a, b) => a + b, 0) / validTimes.length -
                        invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length
                    )
                };
            }
        };
    }
}

module.exports = SecurityTestUtils; 