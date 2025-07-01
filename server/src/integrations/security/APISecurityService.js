/**
 * API Communication Security Service
 * 
 * Provides comprehensive security for API communications including:
 * - Request signing for all API communications
 * - TLS certificate validation and pinning
 * - Secure HTTP client configurations
 * - API endpoint validation and allowlisting
 * - Request/response sanitization
 * - Secure error handling without information leakage
 * - API communication audit trails
 */

const https = require('https');
const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

class APISecurityService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Certificate pinning configuration
        this.certificatePins = {
            'googleapis.com': [
                'sha256/KwccWaCgrnaw6tsrrSO61FgLacNgG2MMLq8GE6+oP5I=',
                'sha256/FEzVOUp4dF3gI0ZVPRJhFbSD608T5Wx+6xWrt0n3lN0='
            ],
            'graph.microsoft.com': [
                'sha256/tq1nGqSr8kE7mNOAOzLN9z5nwJt6e6JV7lGk3lm4xQQ=',
                'sha256/JSMzqOOrtyOT1kmau6zKhgT676hGgczD5VMdRMyJZFA='
            ],
            'api.zoom.us': [
                'sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=',
                'sha256/Vjs8r4z+80wjNcr1YKepWQboSIRi63WsWXhIMN+eWys='
            ]
        };

        // Allowed API endpoints patterns
        this.allowedEndpoints = {
            google: [
                /^https:\/\/www\.googleapis\.com\/calendar\/v3\/.*/,
                /^https:\/\/oauth2\.googleapis\.com\/token$/,
                /^https:\/\/www\.googleapis\.com\/oauth2\/v2\/userinfo$/
            ],
            microsoft: [
                /^https:\/\/graph\.microsoft\.com\/v1\.0\/.*/,
                /^https:\/\/login\.microsoftonline\.com\/.*/,
                /^https:\/\/outlook\.office365\.com\/.*/
            ],
            zoom: [
                /^https:\/\/api\.zoom\.us\/v2\/.*/,
                /^https:\/\/zoom\.us\/oauth\/token$/,
                /^https:\/\/zoom\.us\/oauth\/revoke$/
            ],
            caldav: [
                /^https:\/\/.*\.icloud\.com\/.*/,
                /^https:\/\/caldav\.calendar\.yahoo\.com\/.*/
            ]
        };

        // Request timeout configurations
        this.timeouts = {
            connection: 10000, // 10 seconds
            request: 30000,    // 30 seconds
            idle: 60000        // 60 seconds
        };

        // Rate limiting configurations
        this.rateLimits = new Map();
        this.rateLimitWindows = new Map();

        // Initialize secure HTTP agents
        this.initializeSecureAgents();
    }

    /**
     * Initialize secure HTTPS agents with certificate pinning
     */
    initializeSecureAgents() {
        this.secureAgents = {};

        Object.keys(this.certificatePins).forEach(hostname => {
            this.secureAgents[hostname] = new https.Agent({
                keepAlive: true,
                maxSockets: 50,
                timeout: this.timeouts.connection,
                checkServerIdentity: (host, cert) => {
                    return this.validateCertificatePin(host, cert);
                }
            });
        });
    }

    /**
     * Validate certificate pinning
     */
    validateCertificatePin(hostname, cert) {
        const pins = this.certificatePins[hostname];
        if (!pins) {
            return undefined; // No pinning configured, use default validation
        }

        const certFingerprint = 'sha256/' + crypto
            .createHash('sha256')
            .update(cert.raw)
            .digest('base64');

        if (!pins.includes(certFingerprint)) {
            const error = new Error(`Certificate pin validation failed for ${hostname}`);
            error.code = 'CERT_PIN_VALIDATION_FAILED';
            return error;
        }

        return undefined; // Valid pin
    }

    /**
     * Create secure HTTP client for API communications
     */
    createSecureClient(provider, baseURL) {
        const hostname = new URL(baseURL).hostname;
        
        const client = axios.create({
            baseURL,
            timeout: this.timeouts.request,
            httpsAgent: this.secureAgents[hostname],
            validateStatus: (status) => status < 500, // Don't throw for 4xx errors
            maxRedirects: 3,
            headers: {
                'User-Agent': 'PharmaDOC/1.0 (Integration Security)',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor for security
        client.interceptors.request.use(
            (config) => this.secureRequestInterceptor(config, provider),
            (error) => Promise.reject(this.sanitizeError(error))
        );

        // Add response interceptor for security
        client.interceptors.response.use(
            (response) => this.secureResponseInterceptor(response, provider),
            (error) => Promise.reject(this.sanitizeError(error))
        );

        return client;
    }

    /**
     * Secure request interceptor
     */
    async secureRequestInterceptor(config, provider) {
        try {
            // Validate endpoint
            if (!this.isAllowedEndpoint(config.url, provider)) {
                throw new Error('Endpoint not allowed by security policy');
            }

            // Apply rate limiting
            await this.checkRateLimit(provider, config.url);

            // Sign request
            if (config.data) {
                config.headers['X-Request-Signature'] = this.signRequest(config.data);
                config.headers['X-Request-Timestamp'] = Date.now().toString();
            }

            // Add security headers
            config.headers['X-Content-Type-Options'] = 'nosniff';
            config.headers['X-Frame-Options'] = 'DENY';
            config.headers['X-XSS-Protection'] = '1; mode=block';

            // Sanitize request data
            if (config.data) {
                config.data = this.sanitizeRequestData(config.data);
            }

            // Log request for audit
            await this.logAPIRequest(provider, config);

            return config;
        } catch (error) {
            throw this.sanitizeError(error);
        }
    }

    /**
     * Secure response interceptor
     */
    async secureResponseInterceptor(response, provider) {
        try {
            // Validate response signature if present
            if (response.headers['x-response-signature']) {
                this.validateResponseSignature(response);
            }

            // Sanitize response data
            if (response.data) {
                response.data = this.sanitizeResponseData(response.data);
            }

            // Log response for audit
            await this.logAPIResponse(provider, response);

            return response;
        } catch (error) {
            throw this.sanitizeError(error);
        }
    }

    /**
     * Check if endpoint is allowed
     */
    isAllowedEndpoint(url, provider) {
        const patterns = this.allowedEndpoints[provider];
        if (!patterns) {
            return false;
        }

        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        return patterns.some(pattern => pattern.test(fullUrl));
    }

    /**
     * Sign request data for integrity
     */
    signRequest(data) {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto
            .createHmac('sha256', process.env.API_REQUEST_SIGNING_KEY || 'default-key')
            .update(dataString)
            .digest('hex');
    }

    /**
     * Validate response signature
     */
    validateResponseSignature(response) {
        const expectedSignature = this.signRequest(response.data);
        const receivedSignature = response.headers['x-response-signature'];
        
        if (expectedSignature !== receivedSignature) {
            throw new Error('Response signature validation failed');
        }
    }

    /**
     * Apply rate limiting
     */
    async checkRateLimit(provider, url) {
        const key = `${provider}:${new URL(url).pathname}`;
        const now = Date.now();
        const windowMs = 60000; // 1 minute window
        const maxRequests = this.getRateLimitForProvider(provider);

        // Clean old entries
        this.cleanupRateLimitWindows(now, windowMs);

        // Check current window
        if (!this.rateLimitWindows.has(key)) {
            this.rateLimitWindows.set(key, []);
        }

        const requests = this.rateLimitWindows.get(key);
        const validRequests = requests.filter(timestamp => (now - timestamp) < windowMs);

        if (validRequests.length >= maxRequests) {
            throw new Error(`Rate limit exceeded for ${provider}`);
        }

        // Add current request
        validRequests.push(now);
        this.rateLimitWindows.set(key, validRequests);
    }

    /**
     * Get rate limit for provider
     */
    getRateLimitForProvider(provider) {
        const limits = {
            google: 100,     // 100 requests per minute
            microsoft: 100,  // 100 requests per minute  
            zoom: 50,        // 50 requests per minute
            caldav: 30       // 30 requests per minute
        };
        return limits[provider] || 50;
    }

    /**
     * Cleanup old rate limit windows
     */
    cleanupRateLimitWindows(now, windowMs) {
        for (const [key, requests] of this.rateLimitWindows) {
            const validRequests = requests.filter(timestamp => (now - timestamp) < windowMs);
            if (validRequests.length === 0) {
                this.rateLimitWindows.delete(key);
            } else {
                this.rateLimitWindows.set(key, validRequests);
            }
        }
    }

    /**
     * Sanitize request data to prevent injection
     */
    sanitizeRequestData(data) {
        if (typeof data !== 'object' || data === null) {
            return data;
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                // Remove potentially dangerous characters
                sanitized[key] = value
                    .replace(/[<>'"]/g, '')
                    .replace(/javascript:/gi, '')
                    .replace(/data:/gi, '');
            } else if (Array.isArray(value)) {
                sanitized[key] = value.map(item => 
                    typeof item === 'string' 
                        ? item.replace(/[<>'"]/g, '') 
                        : item
                );
            } else if (typeof value === 'object') {
                sanitized[key] = this.sanitizeRequestData(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    /**
     * Sanitize response data
     */
    sanitizeResponseData(data) {
        if (typeof data !== 'object' || data === null) {
            return data;
        }

        // Remove sensitive fields that should not be exposed
        const sensitiveFields = [
            'password', 'secret', 'key', 'token', 'private',
            'credential', 'auth', 'api_key', 'access_token'
        ];

        const sanitized = { ...data };
        
        const removeSensitiveFields = (obj) => {
            if (typeof obj !== 'object' || obj === null) return obj;
            
            for (const [key, value] of Object.entries(obj)) {
                const lowerKey = key.toLowerCase();
                if (sensitiveFields.some(field => lowerKey.includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof value === 'object') {
                    removeSensitiveFields(value);
                }
            }
        };

        removeSensitiveFields(sanitized);
        return sanitized;
    }

    /**
     * Sanitize error messages to prevent information leakage
     */
    sanitizeError(error) {
        if (!error) return error;

        // Create sanitized error
        const sanitizedError = new Error();
        
        // Safe error types that can be exposed
        const safeErrorTypes = [
            'ValidationError',
            'RateLimitError', 
            'AuthenticationError',
            'NotFoundError',
            'TimeoutError'
        ];

        if (error.response) {
            // HTTP error
            sanitizedError.name = 'APIError';
            sanitizedError.status = error.response.status;
            
            if (error.response.status >= 400 && error.response.status < 500) {
                sanitizedError.message = 'Client error occurred';
            } else {
                sanitizedError.message = 'Server error occurred';
            }
        } else if (safeErrorTypes.includes(error.name)) {
            sanitizedError.name = error.name;
            sanitizedError.message = error.message;
        } else {
            sanitizedError.name = 'APISecurityError';
            sanitizedError.message = 'An error occurred during API communication';
        }

        // Add error code if safe
        if (error.code && error.code.startsWith('E')) {
            sanitizedError.code = error.code;
        }

        return sanitizedError;
    }

    /**
     * Log API request for audit trail
     */
    async logAPIRequest(provider, config) {
        try {
            const logData = {
                type: 'api_request',
                provider,
                method: config.method?.toUpperCase(),
                url: this.sanitizeUrl(config.url),
                headers: this.sanitizeHeaders(config.headers),
                timestamp: new Date().toISOString(),
                source: 'api_security_service'
            };

            await this.supabase
                .from('api_audit_logs')
                .insert(logData);
        } catch (error) {
            console.warn('Failed to log API request:', error);
        }
    }

    /**
     * Log API response for audit trail
     */
    async logAPIResponse(provider, response) {
        try {
            const logData = {
                type: 'api_response',
                provider,
                status: response.status,
                url: this.sanitizeUrl(response.config?.url),
                response_size: JSON.stringify(response.data || {}).length,
                timestamp: new Date().toISOString(),
                source: 'api_security_service'
            };

            await this.supabase
                .from('api_audit_logs')
                .insert(logData);
        } catch (error) {
            console.warn('Failed to log API response:', error);
        }
    }

    /**
     * Sanitize URL for logging (remove sensitive parameters)
     */
    sanitizeUrl(url) {
        if (!url) return url;
        
        try {
            const urlObj = new URL(url);
            const sensitiveParams = ['access_token', 'api_key', 'secret', 'key'];
            
            sensitiveParams.forEach(param => {
                if (urlObj.searchParams.has(param)) {
                    urlObj.searchParams.set(param, '[REDACTED]');
                }
            });
            
            return urlObj.toString();
        } catch {
            return url;
        }
    }

    /**
     * Sanitize headers for logging
     */
    sanitizeHeaders(headers) {
        if (!headers) return headers;
        
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
        
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
            if (sanitized[header.toLowerCase()]) {
                sanitized[header.toLowerCase()] = '[REDACTED]';
            }
        });
        
        return sanitized;
    }

    /**
     * Perform secure API request with all security measures
     */
    async secureRequest(provider, options) {
        try {
            const client = this.createSecureClient(provider, options.baseURL);
            
            const config = {
                method: options.method || 'GET',
                url: options.url,
                data: options.data,
                headers: {
                    ...options.headers,
                    'X-Provider': provider,
                    'X-Security-Version': '1.0'
                },
                timeout: options.timeout || this.timeouts.request
            };

            const response = await client.request(config);
            return response;
        } catch (error) {
            throw this.sanitizeError(error);
        }
    }

    /**
     * Validate API endpoint security
     */
    async validateEndpointSecurity(url) {
        try {
            const urlObj = new URL(url);
            
            // Check protocol
            if (urlObj.protocol !== 'https:') {
                throw new Error('Only HTTPS endpoints are allowed');
            }

            // Check hostname against allowlist
            const isAllowed = Object.values(this.allowedEndpoints)
                .flat()
                .some(pattern => pattern.test(url));
                
            if (!isAllowed) {
                throw new Error('Endpoint not in security allowlist');
            }

            // Check certificate if pinning is configured
            if (this.certificatePins[urlObj.hostname]) {
                await this.validateCertificateForHostname(urlObj.hostname);
            }

            return true;
        } catch (error) {
            throw this.sanitizeError(error);
        }
    }

    /**
     * Validate certificate for hostname
     */
    async validateCertificateForHostname(hostname) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname,
                port: 443,
                method: 'HEAD',
                agent: this.secureAgents[hostname]
            };

            const req = https.request(options, (res) => {
                resolve(true);
            });

            req.on('error', (error) => {
                reject(this.sanitizeError(error));
            });

            req.setTimeout(this.timeouts.connection, () => {
                req.destroy();
                reject(new Error('Certificate validation timeout'));
            });

            req.end();
        });
    }

    /**
     * Get API security metrics
     */
    async getSecurityMetrics() {
        try {
            const { data, error } = await this.supabase
                .from('api_audit_logs')
                .select('provider, type, timestamp')
                .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (error) throw error;

            const metrics = {
                total_requests: 0,
                by_provider: {},
                by_type: {},
                requests_last_hour: 0,
                errors_last_hour: 0
            };

            const oneHourAgo = Date.now() - 60 * 60 * 1000;

            data.forEach(log => {
                metrics.total_requests++;
                
                metrics.by_provider[log.provider] = 
                    (metrics.by_provider[log.provider] || 0) + 1;
                    
                metrics.by_type[log.type] = 
                    (metrics.by_type[log.type] || 0) + 1;

                const logTime = new Date(log.timestamp).getTime();
                if (logTime > oneHourAgo) {
                    if (log.type === 'api_request') {
                        metrics.requests_last_hour++;
                    } else if (log.type === 'api_error') {
                        metrics.errors_last_hour++;
                    }
                }
            });

            return metrics;
        } catch (error) {
            throw this.sanitizeError(error);
        }
    }

    /**
     * Update certificate pins
     */
    updateCertificatePins(hostname, pins) {
        this.certificatePins[hostname] = pins;
        
        // Recreate agent for this hostname
        this.secureAgents[hostname] = new https.Agent({
            keepAlive: true,
            maxSockets: 50,
            timeout: this.timeouts.connection,
            checkServerIdentity: (host, cert) => {
                return this.validateCertificatePin(host, cert);
            }
        });
    }

    /**
     * Add allowed endpoint pattern
     */
    addAllowedEndpoint(provider, pattern) {
        if (!this.allowedEndpoints[provider]) {
            this.allowedEndpoints[provider] = [];
        }
        this.allowedEndpoints[provider].push(pattern);
    }

    /**
     * Remove allowed endpoint pattern
     */
    removeAllowedEndpoint(provider, pattern) {
        if (this.allowedEndpoints[provider]) {
            this.allowedEndpoints[provider] = this.allowedEndpoints[provider]
                .filter(p => p.toString() !== pattern.toString());
        }
    }
}

module.exports = APISecurityService; 