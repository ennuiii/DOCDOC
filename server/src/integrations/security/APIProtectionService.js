/**
 * API Protection Service
 * 
 * Extends rate limiting with comprehensive API protection including:
 * - Circuit breaker patterns for API failures
 * - Adaptive throttling and backoff strategies
 * - API usage analytics and optimization
 * - Rate limit bypass for critical operations
 * - Health monitoring and auto-recovery
 * - Provider-specific protection strategies
 */

const { createClient } = require('@supabase/supabase-js');
const RateLimitManager = require('../services/RateLimitManager');

class APIProtectionService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Initialize rate limit manager
        this.rateLimitManager = new RateLimitManager();

        // Circuit breaker configuration
        this.circuitBreakers = {
            google: this.createCircuitBreaker('google'),
            microsoft: this.createCircuitBreaker('microsoft'),
            zoom: this.createCircuitBreaker('zoom'),
            caldav: this.createCircuitBreaker('caldav')
        };

        // Adaptive throttling configuration
        this.adaptiveConfig = {
            enabled: true,
            baseThrottleMs: 1000,
            maxThrottleMs: 30000,
            adaptationFactor: 1.5,
            recoveryFactor: 0.8,
            errorThreshold: 0.1 // 10% error rate triggers adaptation
        };

        // Health monitoring
        this.healthMetrics = new Map();
        this.providerHealth = new Map();

        // Critical operation bypass tokens
        this.bypassTokens = new Set();

        // Initialize monitoring
        this.initializeMonitoring();
    }

    /**
     * Initialize health monitoring and adaptive systems
     */
    initializeMonitoring() {
        // Health check interval
        setInterval(() => {
            this.performHealthChecks();
        }, 30000); // Every 30 seconds

        // Adaptive throttling adjustment
        setInterval(() => {
            this.adjustAdaptiveThrottling();
        }, 60000); // Every minute

        // Metrics collection
        setInterval(() => {
            this.collectMetrics();
        }, 300000); // Every 5 minutes

        console.log('API Protection Service monitoring initialized');
    }

    /**
     * Create circuit breaker for provider
     */
    createCircuitBreaker(provider) {
        return {
            state: 'closed', // closed, open, half-open
            failureCount: 0,
            successCount: 0,
            lastFailureTime: null,
            
            // Configuration
            failureThreshold: 5,      // failures before opening
            recoveryTimeout: 30000,   // 30 seconds
            successThreshold: 3,      // successes to close from half-open
            volumeThreshold: 10,      // minimum requests before evaluation
            
            // Metrics
            totalRequests: 0,
            totalFailures: 0,
            avgResponseTime: 0,
            
            // State transitions
            lastStateChange: Date.now()
        };
    }

    /**
     * Execute API request with full protection
     */
    async executeProtectedRequest(provider, requestData, options = {}) {
        try {
            // Check for critical operation bypass
            if (options.critical && this.hasBypassToken(options.bypassToken)) {
                return await this.executeRequestWithBypass(provider, requestData, options);
            }

            // Circuit breaker check
            const circuitCheck = await this.checkCircuitBreaker(provider);
            if (!circuitCheck.allowed) {
                throw new Error(`Circuit breaker open for ${provider}: ${circuitCheck.reason}`);
            }

            // Rate limit check
            const rateLimitCheck = await this.rateLimitManager.checkRateLimit(
                provider, 
                requestData.userId, 
                requestData.endpoint
            );

            if (!rateLimitCheck.allowed) {
                // Apply adaptive throttling
                const throttleDelay = await this.calculateAdaptiveThrottle(provider);
                if (throttleDelay > 0) {
                    await this.delay(throttleDelay);
                    // Retry rate limit check after throttling
                    const retryCheck = await this.rateLimitManager.checkRateLimit(
                        provider, 
                        requestData.userId, 
                        requestData.endpoint
                    );
                    if (!retryCheck.allowed) {
                        throw new Error(`Rate limit exceeded for ${provider} after throttling`);
                    }
                }
            }

            // Execute request with monitoring
            const startTime = Date.now();
            let result;
            let error = null;

            try {
                result = await this.executeMonitoredRequest(provider, requestData, options);
                await this.recordSuccess(provider, Date.now() - startTime);
            } catch (requestError) {
                error = requestError;
                await this.recordFailure(provider, requestError, Date.now() - startTime);
                throw requestError;
            }

            // Record request for rate limiting
            await this.rateLimitManager.recordRequest(
                provider,
                requestData.userId,
                requestData.endpoint
            );

            return result;
        } catch (error) {
            await this.logProtectionEvent(provider, 'request_failed', {
                error: error.message,
                requestData,
                options
            });
            throw error;
        }
    }

    /**
     * Check circuit breaker status
     */
    async checkCircuitBreaker(provider) {
        const breaker = this.circuitBreakers[provider];
        if (!breaker) {
            return { allowed: true };
        }

        const now = Date.now();

        switch (breaker.state) {
            case 'closed':
                return { allowed: true };

            case 'open':
                // Check if recovery timeout has passed
                if (now - breaker.lastFailureTime >= breaker.recoveryTimeout) {
                    breaker.state = 'half-open';
                    breaker.successCount = 0;
                    breaker.lastStateChange = now;
                    await this.logCircuitBreakerEvent(provider, 'half_open');
                    return { allowed: true };
                }
                return { 
                    allowed: false, 
                    reason: 'Circuit breaker open',
                    resetTime: breaker.lastFailureTime + breaker.recoveryTimeout
                };

            case 'half-open':
                return { allowed: true };

            default:
                return { allowed: true };
        }
    }

    /**
     * Record successful request
     */
    async recordSuccess(provider, responseTime) {
        const breaker = this.circuitBreakers[provider];
        if (!breaker) return;

        breaker.totalRequests++;
        breaker.successCount++;
        breaker.avgResponseTime = (breaker.avgResponseTime + responseTime) / 2;

        // Circuit breaker state management
        if (breaker.state === 'half-open') {
            if (breaker.successCount >= breaker.successThreshold) {
                breaker.state = 'closed';
                breaker.failureCount = 0;
                breaker.lastStateChange = Date.now();
                await this.logCircuitBreakerEvent(provider, 'closed');
            }
        } else if (breaker.state === 'closed') {
            // Reset failure count on success
            breaker.failureCount = Math.max(0, breaker.failureCount - 1);
        }

        // Update provider health
        await this.updateProviderHealth(provider, 'success', responseTime);
    }

    /**
     * Record failed request
     */
    async recordFailure(provider, error, responseTime) {
        const breaker = this.circuitBreakers[provider];
        if (!breaker) return;

        breaker.totalRequests++;
        breaker.totalFailures++;
        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();

        // Circuit breaker state management
        if (breaker.state === 'closed' || breaker.state === 'half-open') {
            if (breaker.failureCount >= breaker.failureThreshold && 
                breaker.totalRequests >= breaker.volumeThreshold) {
                
                breaker.state = 'open';
                breaker.lastStateChange = Date.now();
                await this.logCircuitBreakerEvent(provider, 'open', { error: error.message });
            }
        }

        // Update provider health
        await this.updateProviderHealth(provider, 'failure', responseTime, error);
    }

    /**
     * Calculate adaptive throttle delay
     */
    async calculateAdaptiveThrottle(provider) {
        if (!this.adaptiveConfig.enabled) return 0;

        const health = this.providerHealth.get(provider);
        if (!health) return this.adaptiveConfig.baseThrottleMs;

        const errorRate = health.failures / Math.max(health.requests, 1);
        
        if (errorRate > this.adaptiveConfig.errorThreshold) {
            // Increase throttle based on error rate
            const throttleMultiplier = Math.min(
                errorRate * this.adaptiveConfig.adaptationFactor,
                this.adaptiveConfig.maxThrottleMs / this.adaptiveConfig.baseThrottleMs
            );
            
            return Math.min(
                this.adaptiveConfig.baseThrottleMs * throttleMultiplier,
                this.adaptiveConfig.maxThrottleMs
            );
        }

        // Reduce throttle if error rate is low
        const currentThrottle = health.currentThrottle || this.adaptiveConfig.baseThrottleMs;
        return Math.max(
            currentThrottle * this.adaptiveConfig.recoveryFactor,
            0
        );
    }

    /**
     * Execute request with monitoring
     */
    async executeMonitoredRequest(provider, requestData, options) {
        // This would integrate with your actual provider services
        // For now, simulate based on provider
        
        const startTime = Date.now();
        
        try {
            // Simulate provider-specific request execution
            switch (provider) {
                case 'google':
                    return await this.simulateGoogleRequest(requestData);
                case 'microsoft':
                    return await this.simulateMicrosoftRequest(requestData);
                case 'zoom':
                    return await this.simulateZoomRequest(requestData);
                case 'caldav':
                    return await this.simulateCalDAVRequest(requestData);
                default:
                    throw new Error(`Unknown provider: ${provider}`);
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            await this.logProtectionEvent(provider, 'request_error', {
                error: error.message,
                duration,
                requestData
            });
            throw error;
        }
    }

    /**
     * Execute critical request with bypass
     */
    async executeRequestWithBypass(provider, requestData, options) {
        console.log(`Executing critical request for ${provider} with bypass token`);
        
        // Remove bypass token after use
        this.removeBypassToken(options.bypassToken);
        
        // Execute directly without rate limiting
        const result = await this.executeMonitoredRequest(provider, requestData, options);
        
        await this.logProtectionEvent(provider, 'bypass_used', {
            requestData,
            bypassToken: options.bypassToken
        });
        
        return result;
    }

    /**
     * Generate bypass token for critical operations
     */
    generateBypassToken(reason, expiresIn = 300000) { // 5 minutes default
        const token = `bypass_${Date.now()}_${Math.random().toString(36)}`;
        
        this.bypassTokens.add(token);
        
        // Auto-expire token
        setTimeout(() => {
            this.bypassTokens.delete(token);
        }, expiresIn);
        
        console.log(`Generated bypass token for reason: ${reason}`);
        return token;
    }

    /**
     * Check if bypass token is valid
     */
    hasBypassToken(token) {
        return token && this.bypassTokens.has(token);
    }

    /**
     * Remove bypass token
     */
    removeBypassToken(token) {
        return this.bypassTokens.delete(token);
    }

    /**
     * Update provider health metrics
     */
    async updateProviderHealth(provider, result, responseTime, error = null) {
        if (!this.providerHealth.has(provider)) {
            this.providerHealth.set(provider, {
                requests: 0,
                successes: 0,
                failures: 0,
                avgResponseTime: 0,
                lastSuccess: null,
                lastFailure: null,
                currentThrottle: this.adaptiveConfig.baseThrottleMs,
                healthScore: 1.0
            });
        }

        const health = this.providerHealth.get(provider);
        health.requests++;

        if (result === 'success') {
            health.successes++;
            health.lastSuccess = Date.now();
        } else {
            health.failures++;
            health.lastFailure = Date.now();
        }

        // Update average response time
        health.avgResponseTime = (health.avgResponseTime + responseTime) / 2;

        // Calculate health score (0-1)
        const errorRate = health.failures / health.requests;
        const responseTimeFactor = Math.min(health.avgResponseTime / 5000, 1); // 5s max
        health.healthScore = Math.max(0, 1 - errorRate - (responseTimeFactor * 0.5));

        this.providerHealth.set(provider, health);
    }

    /**
     * Perform health checks on all providers
     */
    async performHealthChecks() {
        for (const provider of Object.keys(this.circuitBreakers)) {
            await this.performProviderHealthCheck(provider);
        }
    }

    /**
     * Perform health check for specific provider
     */
    async performProviderHealthCheck(provider) {
        try {
            const health = this.providerHealth.get(provider);
            const breaker = this.circuitBreakers[provider];
            
            if (!health || !breaker) return;

            // Calculate overall health status
            const healthStatus = {
                provider,
                health_score: health.healthScore,
                circuit_state: breaker.state,
                error_rate: health.failures / Math.max(health.requests, 1),
                avg_response_time: health.avgResponseTime,
                last_success: health.lastSuccess,
                last_failure: health.lastFailure,
                current_throttle: health.currentThrottle,
                timestamp: new Date().toISOString()
            };

            // Store health data
            await this.supabase
                .from('api_health_status')
                .upsert(healthStatus, { onConflict: 'provider' });

        } catch (error) {
            console.error(`Health check failed for ${provider}:`, error);
        }
    }

    /**
     * Adjust adaptive throttling based on performance
     */
    async adjustAdaptiveThrottling() {
        if (!this.adaptiveConfig.enabled) return;

        for (const [provider, health] of this.providerHealth) {
            const newThrottle = await this.calculateAdaptiveThrottle(provider);
            health.currentThrottle = newThrottle;
            
            console.log(`Adjusted throttle for ${provider}: ${newThrottle}ms`);
        }
    }

    /**
     * Collect and store performance metrics
     */
    async collectMetrics() {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
                providers: {}
            };

            for (const [provider, health] of this.providerHealth) {
                const breaker = this.circuitBreakers[provider];
                
                metrics.providers[provider] = {
                    health_score: health.healthScore,
                    requests: health.requests,
                    successes: health.successes,
                    failures: health.failures,
                    error_rate: health.failures / Math.max(health.requests, 1),
                    avg_response_time: health.avgResponseTime,
                    circuit_state: breaker.state,
                    current_throttle: health.currentThrottle
                };
            }

            // Store metrics
            await this.supabase
                .from('api_performance_metrics')
                .insert(metrics);

            // Reset counters for next period
            this.resetPeriodCounters();

        } catch (error) {
            console.error('Metrics collection failed:', error);
        }
    }

    /**
     * Reset period counters
     */
    resetPeriodCounters() {
        for (const [provider, health] of this.providerHealth) {
            // Keep running averages but reset period counters
            health.requests = 0;
            health.successes = 0;
            health.failures = 0;
        }
    }

    /**
     * Get protection status for provider
     */
    async getProtectionStatus(provider) {
        const health = this.providerHealth.get(provider);
        const breaker = this.circuitBreakers[provider];
        const rateLimitStatus = await this.rateLimitManager.getRateLimitStatus(provider);

        return {
            provider,
            health: health || null,
            circuit_breaker: breaker || null,
            rate_limits: rateLimitStatus,
            adaptive_throttle: health?.currentThrottle || 0,
            protection_enabled: true
        };
    }

    /**
     * Log protection events
     */
    async logProtectionEvent(provider, eventType, data) {
        try {
            await this.supabase
                .from('api_protection_events')
                .insert({
                    provider,
                    event_type: eventType,
                    event_data: data,
                    timestamp: new Date().toISOString()
                });
        } catch (error) {
            console.warn('Failed to log protection event:', error);
        }
    }

    /**
     * Log circuit breaker events
     */
    async logCircuitBreakerEvent(provider, state, data = {}) {
        console.log(`Circuit breaker ${state} for ${provider}`);
        
        await this.logProtectionEvent(provider, `circuit_breaker_${state}`, {
            new_state: state,
            ...data
        });
    }

    /**
     * Utility methods for request simulation
     */
    async simulateGoogleRequest(requestData) {
        await this.delay(Math.random() * 500 + 100); // 100-600ms
        if (Math.random() < 0.05) throw new Error('Google API error');
        return { success: true, provider: 'google', data: requestData };
    }

    async simulateMicrosoftRequest(requestData) {
        await this.delay(Math.random() * 400 + 150); // 150-550ms  
        if (Math.random() < 0.03) throw new Error('Microsoft Graph error');
        return { success: true, provider: 'microsoft', data: requestData };
    }

    async simulateZoomRequest(requestData) {
        await this.delay(Math.random() * 300 + 200); // 200-500ms
        if (Math.random() < 0.08) throw new Error('Zoom API error');
        return { success: true, provider: 'zoom', data: requestData };
    }

    async simulateCalDAVRequest(requestData) {
        await this.delay(Math.random() * 600 + 300); // 300-900ms
        if (Math.random() < 0.10) throw new Error('CalDAV error');
        return { success: true, provider: 'caldav', data: requestData };
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = APIProtectionService; 