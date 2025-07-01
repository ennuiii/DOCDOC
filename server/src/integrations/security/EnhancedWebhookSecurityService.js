/**
 * Enhanced Webhook Security Service
 * 
 * Provides comprehensive webhook security including:
 * - Enhanced signature verification for all providers
 * - Anti-replay attack protection with timestamp validation
 * - Payload size limits and structure validation
 * - Webhook endpoint IP allowlisting
 * - Webhook rate limiting per provider
 * - Webhook payload sanitization and validation
 * - Secure webhook delivery confirmation
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const WebhookSecurityService = require('../services/WebhookSecurityService');

class EnhancedWebhookSecurityService extends WebhookSecurityService {
    constructor() {
        super();
        
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Enhanced security configuration
        this.enhancedConfig = {
            payloadLimits: {
                maxSize: 1024 * 1024, // 1MB max payload size
                maxEvents: 100,       // Max events per webhook
                maxDepth: 10          // Max object nesting depth
            },
            rateLimiting: {
                windowMs: 60000,      // 1 minute window
                limits: {
                    google: 1000,     // 1000 webhooks per minute
                    microsoft: 1000,  // 1000 webhooks per minute
                    zoom: 500,        // 500 webhooks per minute
                    caldav: 200       // 200 webhooks per minute
                }
            },
            antiReplay: {
                timestampTolerance: 300000, // 5 minutes
                nonceExpiration: 3600000    // 1 hour
            },
            ipAllowlisting: {
                enabled: true,
                allowedRanges: {
                    google: [
                        '64.233.160.0/19',
                        '66.102.0.0/20',
                        '66.249.80.0/20',
                        '72.14.192.0/18',
                        '74.125.0.0/16',
                        '108.177.8.0/21',
                        '173.194.0.0/16',
                        '207.126.144.0/20',
                        '209.85.128.0/17',
                        '216.58.192.0/19',
                        '216.239.32.0/19'
                    ],
                    microsoft: [
                        '13.107.42.14/32',
                        '13.107.6.171/32',
                        '2620:1ec:4::14/128',
                        '2620:1ec:c11::171/128'
                    ],
                    zoom: [
                        '3.7.35.0/25',
                        '3.21.137.128/25',
                        '3.22.11.0/24',
                        '3.23.93.0/24',
                        '3.25.41.128/25',
                        '3.25.42.0/25',
                        '52.61.100.128/25'
                    ]
                }
            }
        };

        // Rate limiting storage
        this.rateLimitStorage = new Map();
        
        // Nonce storage for replay protection
        this.nonceStorage = new Map();
        
        // Initialize cleanup intervals
        this.initializeCleanupIntervals();
    }

    /**
     * Initialize cleanup intervals for rate limiting and nonce storage
     */
    initializeCleanupIntervals() {
        // Clean rate limit storage every minute
        setInterval(() => {
            this.cleanupRateLimitStorage();
        }, 60000);

        // Clean nonce storage every hour
        setInterval(() => {
            this.cleanupNonceStorage();
        }, 3600000);
    }

    /**
     * Enhanced webhook validation with comprehensive security checks
     */
    async validateWebhookEnhanced(req, provider) {
        try {
            // 1. Validate IP address
            const ipValidation = await this.validateIPAddress(req, provider);
            if (!ipValidation.valid) {
                await this.logSecurityViolation(req, provider, 'ip_validation_failed', ipValidation);
                return ipValidation;
            }

            // 2. Check rate limiting
            const rateLimitValidation = await this.validateRateLimit(req, provider);
            if (!rateLimitValidation.valid) {
                await this.logSecurityViolation(req, provider, 'rate_limit_exceeded', rateLimitValidation);
                return rateLimitValidation;
            }

            // 3. Validate payload size and structure
            const payloadValidation = await this.validatePayload(req, provider);
            if (!payloadValidation.valid) {
                await this.logSecurityViolation(req, provider, 'payload_validation_failed', payloadValidation);
                return payloadValidation;
            }

            // 4. Enhanced signature verification
            const signatureValidation = await this.validateSignatureEnhanced(req, provider);
            if (!signatureValidation.valid) {
                await this.logSecurityViolation(req, provider, 'signature_validation_failed', signatureValidation);
                return signatureValidation;
            }

            // 5. Anti-replay protection
            const replayValidation = await this.validateAntiReplay(req, provider);
            if (!replayValidation.valid) {
                await this.logSecurityViolation(req, provider, 'replay_attack_detected', replayValidation);
                return replayValidation;
            }

            // 6. Sanitize payload
            const sanitizedPayload = this.sanitizeWebhookPayload(req.body, provider);
            req.body = sanitizedPayload;

            // 7. Call base validation
            const baseValidation = await super.validateWebhook(req, provider);
            if (!baseValidation.valid) {
                await this.logSecurityViolation(req, provider, 'base_validation_failed', baseValidation);
                return baseValidation;
            }

            // Log successful validation
            await this.logWebhookValidation(req, provider, 'success');

            return { valid: true, enhanced: true };
        } catch (error) {
            console.error('Enhanced webhook validation error:', error);
            await this.logSecurityViolation(req, provider, 'validation_exception', { error: error.message });
            return { valid: false, reason: 'Validation exception', error: error.message };
        }
    }

    /**
     * Validate IP address against allowlist
     */
    async validateIPAddress(req, provider) {
        if (!this.enhancedConfig.ipAllowlisting.enabled) {
            return { valid: true };
        }

        const clientIP = this.getClientIP(req);
        const allowedRanges = this.enhancedConfig.ipAllowlisting.allowedRanges[provider];

        if (!allowedRanges) {
            return { valid: true }; // No IP restrictions for this provider
        }

        const isAllowed = allowedRanges.some(range => this.isIPInRange(clientIP, range));
        
        return {
            valid: isAllowed,
            reason: isAllowed ? null : 'IP address not in allowlist',
            clientIP,
            allowedRanges
        };
    }

    /**
     * Extract client IP from request
     */
    getClientIP(req) {
        return req.headers['x-forwarded-for'] ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               'unknown';
    }

    /**
     * Check if IP is in CIDR range
     */
    isIPInRange(ip, cidr) {
        if (!ip || ip === 'unknown') return false;
        
        try {
            const [range, bits] = cidr.split('/');
            const mask = ~(2 ** (32 - parseInt(bits)) - 1);
            
            const ipInt = this.ipToInt(ip);
            const rangeInt = this.ipToInt(range);
            
            return (ipInt & mask) === (rangeInt & mask);
        } catch (error) {
            console.error('IP range validation error:', error);
            return false;
        }
    }

    /**
     * Convert IP to integer
     */
    ipToInt(ip) {
        return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
    }

    /**
     * Validate rate limiting
     */
    async validateRateLimit(req, provider) {
        const clientIP = this.getClientIP(req);
        const key = `${provider}:${clientIP}`;
        const now = Date.now();
        const windowMs = this.enhancedConfig.rateLimiting.windowMs;
        const limit = this.enhancedConfig.rateLimiting.limits[provider] || 100;

        // Get or create rate limit entry
        if (!this.rateLimitStorage.has(key)) {
            this.rateLimitStorage.set(key, { requests: [], firstRequest: now });
        }

        const rateLimitData = this.rateLimitStorage.get(key);
        
        // Filter requests within current window
        rateLimitData.requests = rateLimitData.requests.filter(
            timestamp => (now - timestamp) < windowMs
        );

        // Check limit
        if (rateLimitData.requests.length >= limit) {
            return {
                valid: false,
                reason: 'Rate limit exceeded',
                limit,
                current: rateLimitData.requests.length,
                resetTime: Math.min(...rateLimitData.requests) + windowMs
            };
        }

        // Add current request
        rateLimitData.requests.push(now);
        this.rateLimitStorage.set(key, rateLimitData);

        return { valid: true };
    }

    /**
     * Validate payload size and structure
     */
    async validatePayload(req, provider) {
        const payload = req.body;
        const payloadString = JSON.stringify(payload || {});
        const payloadSize = Buffer.byteLength(payloadString, 'utf8');

        // Check payload size
        if (payloadSize > this.enhancedConfig.payloadLimits.maxSize) {
            return {
                valid: false,
                reason: 'Payload size exceeds limit',
                size: payloadSize,
                limit: this.enhancedConfig.payloadLimits.maxSize
            };
        }

        // Check object depth
        const depth = this.getObjectDepth(payload);
        if (depth > this.enhancedConfig.payloadLimits.maxDepth) {
            return {
                valid: false,
                reason: 'Payload nesting depth exceeds limit',
                depth,
                limit: this.enhancedConfig.payloadLimits.maxDepth
            };
        }

        // Provider-specific payload validation
        const providerValidation = await this.validateProviderPayload(payload, provider);
        if (!providerValidation.valid) {
            return providerValidation;
        }

        return { valid: true };
    }

    /**
     * Get object nesting depth
     */
    getObjectDepth(obj, currentDepth = 0) {
        if (obj === null || typeof obj !== 'object') {
            return currentDepth;
        }

        if (currentDepth > this.enhancedConfig.payloadLimits.maxDepth) {
            return currentDepth; // Early exit to prevent deep recursion
        }

        let maxDepth = currentDepth;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const depth = this.getObjectDepth(obj[key], currentDepth + 1);
                maxDepth = Math.max(maxDepth, depth);
            }
        }

        return maxDepth;
    }

    /**
     * Validate provider-specific payload structure
     */
    async validateProviderPayload(payload, provider) {
        switch (provider) {
            case 'google_calendar':
                return this.validateGooglePayload(payload);
            case 'microsoft_graph':
                return this.validateMicrosoftPayload(payload);
            case 'zoom':
                return this.validateZoomPayload(payload);
            case 'caldav':
                return this.validateCalDAVPayload(payload);
            default:
                return { valid: true };
        }
    }

    /**
     * Validate Google Calendar webhook payload
     */
    validateGooglePayload(payload) {
        // Google Calendar webhooks typically have minimal payload
        // Validation is primarily through headers
        return { valid: true };
    }

    /**
     * Validate Microsoft Graph webhook payload
     */
    validateMicrosoftPayload(payload) {
        if (!payload || !payload.value || !Array.isArray(payload.value)) {
            return { valid: false, reason: 'Invalid Microsoft Graph payload structure' };
        }

        if (payload.value.length > this.enhancedConfig.payloadLimits.maxEvents) {
            return {
                valid: false,
                reason: 'Too many events in payload',
                count: payload.value.length,
                limit: this.enhancedConfig.payloadLimits.maxEvents
            };
        }

        return { valid: true };
    }

    /**
     * Validate Zoom webhook payload
     */
    validateZoomPayload(payload) {
        if (!payload || !payload.event) {
            return { valid: false, reason: 'Invalid Zoom payload structure' };
        }

        const requiredFields = ['event', 'payload'];
        for (const field of requiredFields) {
            if (!payload[field]) {
                return { valid: false, reason: `Missing required field: ${field}` };
            }
        }

        return { valid: true };
    }

    /**
     * Validate CalDAV webhook payload
     */
    validateCalDAVPayload(payload) {
        // Basic structure validation for CalDAV webhooks
        if (!payload || typeof payload !== 'object') {
            return { valid: false, reason: 'Invalid CalDAV payload structure' };
        }

        return { valid: true };
    }

    /**
     * Enhanced signature verification
     */
    async validateSignatureEnhanced(req, provider) {
        switch (provider) {
            case 'google_calendar':
                return this.validateGoogleSignatureEnhanced(req);
            case 'microsoft_graph':
                return this.validateMicrosoftSignatureEnhanced(req);
            case 'zoom':
                return this.validateZoomSignatureEnhanced(req);
            case 'caldav':
                return this.validateCalDAVSignatureEnhanced(req);
            default:
                return { valid: true };
        }
    }

    /**
     * Enhanced Google signature validation
     */
    async validateGoogleSignatureEnhanced(req) {
        // Google Calendar uses OAuth and channel tokens for authentication
        // Enhanced validation includes token freshness and integrity
        const channelToken = req.headers['x-goog-channel-token'];
        const channelId = req.headers['x-goog-channel-id'];

        if (channelToken && channelId) {
            const tokenValidation = await this.validateTokenIntegrity(channelToken, channelId);
            if (!tokenValidation.valid) {
                return tokenValidation;
            }
        }

        return { valid: true };
    }

    /**
     * Enhanced Microsoft signature validation
     */
    async validateMicrosoftSignatureEnhanced(req) {
        // Microsoft Graph uses validation tokens and client state
        // Enhanced validation includes subscription verification
        const payload = req.body;
        
        if (payload && payload.value) {
            for (const notification of payload.value) {
                if (notification.clientState) {
                    const stateValidation = await this.validateClientStateIntegrity(
                        notification.subscriptionId,
                        notification.clientState
                    );
                    if (!stateValidation.valid) {
                        return stateValidation;
                    }
                }
            }
        }

        return { valid: true };
    }

    /**
     * Enhanced Zoom signature validation
     */
    async validateZoomSignatureEnhanced(req) {
        const signature = req.headers['x-zm-signature'];
        const timestamp = req.headers['x-zm-request-timestamp'];
        const payload = JSON.stringify(req.body);

        if (signature && timestamp) {
            // Validate timestamp freshness
            const requestTime = parseInt(timestamp) * 1000;
            const now = Date.now();
            
            if (Math.abs(now - requestTime) > this.enhancedConfig.antiReplay.timestampTolerance) {
                return { valid: false, reason: 'Request timestamp too old or future' };
            }

            // Validate HMAC signature
            const expectedSignature = crypto
                .createHmac('sha256', this.config.zoom.secretToken)
                .update(`v0:${timestamp}:${payload}`)
                .digest('hex');

            const computedSignature = `v0=${expectedSignature}`;
            
            if (!this.constantTimeCompare(signature, computedSignature)) {
                return { valid: false, reason: 'Invalid HMAC signature' };
            }
        }

        return { valid: true };
    }

    /**
     * Enhanced CalDAV signature validation
     */
    async validateCalDAVSignatureEnhanced(req) {
        const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
        
        if (apiKey) {
            const expectedKey = this.config.caldav.apiKey;
            if (!this.constantTimeCompare(apiKey.replace('Bearer ', ''), expectedKey)) {
                return { valid: false, reason: 'Invalid API key' };
            }
        }

        return { valid: true };
    }

    /**
     * Anti-replay protection validation
     */
    async validateAntiReplay(req, provider) {
        const timestamp = this.extractTimestamp(req, provider);
        const nonce = this.extractNonce(req, provider);

        if (timestamp) {
            const requestTime = parseInt(timestamp) * (timestamp.length === 10 ? 1000 : 1);
            const now = Date.now();
            
            if (Math.abs(now - requestTime) > this.enhancedConfig.antiReplay.timestampTolerance) {
                return {
                    valid: false,
                    reason: 'Request timestamp outside tolerance window',
                    timestamp: requestTime,
                    tolerance: this.enhancedConfig.antiReplay.timestampTolerance
                };
            }
        }

        if (nonce) {
            if (this.nonceStorage.has(nonce)) {
                return {
                    valid: false,
                    reason: 'Nonce already used (replay attack detected)',
                    nonce
                };
            }

            // Store nonce with expiration
            this.nonceStorage.set(nonce, {
                timestamp: Date.now(),
                provider
            });
        }

        return { valid: true };
    }

    /**
     * Extract timestamp from request based on provider
     */
    extractTimestamp(req, provider) {
        switch (provider) {
            case 'zoom':
                return req.headers['x-zm-request-timestamp'];
            case 'microsoft_graph':
                return req.body?.value?.[0]?.eventTime ? 
                    new Date(req.body.value[0].eventTime).getTime() / 1000 : null;
            case 'google_calendar':
                return req.headers['x-goog-message-number'];
            default:
                return req.headers['x-timestamp'] || req.headers['timestamp'];
        }
    }

    /**
     * Extract nonce from request based on provider
     */
    extractNonce(req, provider) {
        switch (provider) {
            case 'zoom':
                return req.headers['x-zm-trackingid'];
            case 'microsoft_graph':
                return req.body?.value?.[0]?.id;
            case 'google_calendar':
                return req.headers['x-goog-message-number'];
            default:
                return req.headers['x-nonce'] || req.headers['nonce'];
        }
    }

    /**
     * Sanitize webhook payload
     */
    sanitizeWebhookPayload(payload, provider) {
        if (!payload || typeof payload !== 'object') {
            return payload;
        }

        const sanitized = JSON.parse(JSON.stringify(payload));
        
        // Remove potentially dangerous fields
        const dangerousFields = [
            'script', 'javascript', 'eval', 'function',
            '__proto__', 'constructor', 'prototype'
        ];

        const sanitizeObject = (obj) => {
            if (typeof obj !== 'object' || obj === null) return obj;

            for (const key in obj) {
                if (dangerousFields.includes(key.toLowerCase())) {
                    delete obj[key];
                } else if (typeof obj[key] === 'object') {
                    sanitizeObject(obj[key]);
                } else if (typeof obj[key] === 'string') {
                    // Remove potentially dangerous content
                    obj[key] = obj[key]
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/javascript:/gi, '')
                        .replace(/data:text\/html/gi, '');
                }
            }
        };

        sanitizeObject(sanitized);
        return sanitized;
    }

    /**
     * Validate token integrity
     */
    async validateTokenIntegrity(token, identifier) {
        try {
            // Get stored token data
            const { data, error } = await this.supabase
                .from('webhook_channels')
                .select('token_hash, created_at')
                .eq('channel_id', identifier)
                .single();

            if (error || !data) {
                return { valid: false, reason: 'Channel not found' };
            }

            // Verify token hash
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            if (tokenHash !== data.token_hash) {
                return { valid: false, reason: 'Token hash mismatch' };
            }

            // Check token age
            const tokenAge = Date.now() - new Date(data.created_at).getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            if (tokenAge > maxAge) {
                return { valid: false, reason: 'Token expired' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, reason: 'Token validation error', error: error.message };
        }
    }

    /**
     * Validate client state integrity
     */
    async validateClientStateIntegrity(subscriptionId, clientState) {
        try {
            // Get stored subscription data
            const { data, error } = await this.supabase
                .from('webhook_subscriptions')
                .select('client_state_hash')
                .eq('subscription_id', subscriptionId)
                .single();

            if (error || !data) {
                return { valid: false, reason: 'Subscription not found' };
            }

            // Verify client state hash
            const stateHash = crypto.createHash('sha256').update(clientState).digest('hex');
            if (stateHash !== data.client_state_hash) {
                return { valid: false, reason: 'Client state hash mismatch' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, reason: 'Client state validation error', error: error.message };
        }
    }

    /**
     * Log security violation
     */
    async logSecurityViolation(req, provider, violationType, details) {
        try {
            const logData = {
                provider,
                violation_type: violationType,
                client_ip: this.getClientIP(req),
                user_agent: req.headers['user-agent'] || 'unknown',
                request_url: req.url,
                request_method: req.method,
                headers: JSON.stringify(this.sanitizeHeaders(req.headers)),
                details: JSON.stringify(details),
                timestamp: new Date().toISOString()
            };

            await this.supabase
                .from('webhook_security_violations')
                .insert(logData);
        } catch (error) {
            console.error('Failed to log security violation:', error);
        }
    }

    /**
     * Log successful webhook validation
     */
    async logWebhookValidation(req, provider, status) {
        try {
            const logData = {
                provider,
                status,
                client_ip: this.getClientIP(req),
                request_url: req.url,
                timestamp: new Date().toISOString()
            };

            await this.supabase
                .from('webhook_validation_logs')
                .insert(logData);
        } catch (error) {
            console.warn('Failed to log webhook validation:', error);
        }
    }

    /**
     * Sanitize headers for logging
     */
    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
        
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        
        return sanitized;
    }

    /**
     * Cleanup rate limit storage
     */
    cleanupRateLimitStorage() {
        const now = Date.now();
        const windowMs = this.enhancedConfig.rateLimiting.windowMs;
        
        for (const [key, data] of this.rateLimitStorage) {
            data.requests = data.requests.filter(timestamp => (now - timestamp) < windowMs);
            
            if (data.requests.length === 0) {
                this.rateLimitStorage.delete(key);
            }
        }
    }

    /**
     * Cleanup nonce storage
     */
    cleanupNonceStorage() {
        const now = Date.now();
        const expiration = this.enhancedConfig.antiReplay.nonceExpiration;
        
        for (const [nonce, data] of this.nonceStorage) {
            if ((now - data.timestamp) > expiration) {
                this.nonceStorage.delete(nonce);
            }
        }
    }

    /**
     * Get security metrics
     */
    async getSecurityMetrics() {
        try {
            const { data, error } = await this.supabase
                .from('webhook_security_violations')
                .select('provider, violation_type, timestamp')
                .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (error) throw error;

            const metrics = {
                total_violations: data.length,
                by_provider: {},
                by_type: {},
                violations_last_hour: 0
            };

            const oneHourAgo = Date.now() - 60 * 60 * 1000;

            data.forEach(violation => {
                metrics.by_provider[violation.provider] = 
                    (metrics.by_provider[violation.provider] || 0) + 1;
                    
                metrics.by_type[violation.violation_type] = 
                    (metrics.by_type[violation.violation_type] || 0) + 1;

                const violationTime = new Date(violation.timestamp).getTime();
                if (violationTime > oneHourAgo) {
                    metrics.violations_last_hour++;
                }
            });

            return metrics;
        } catch (error) {
            console.error('Failed to get security metrics:', error);
            throw error;
        }
    }
}

module.exports = EnhancedWebhookSecurityService; 