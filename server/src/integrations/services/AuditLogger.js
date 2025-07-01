/**
 * Audit Logger
 * Provides comprehensive logging and audit trails for integration operations
 */

import { supabaseAdmin } from '../../config/supabase.js';
import winston from 'winston';
import path from 'path';

class AuditLogger {
    constructor() {
        // Initialize Winston logger
        this.initializeLogger();

        // Log levels
        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            verbose: 4,
            debug: 5,
            silly: 6
        };

        // Event types for categorization
        this.eventTypes = {
            OAUTH_START: 'oauth_start',
            OAUTH_CALLBACK: 'oauth_callback',
            OAUTH_REFRESH: 'oauth_refresh',
            OAUTH_REVOKE: 'oauth_revoke',
            INTEGRATION_CONNECT: 'integration_connect',
            INTEGRATION_DISCONNECT: 'integration_disconnect',
            INTEGRATION_ERROR: 'integration_error',
            API_REQUEST: 'api_request',
            API_RESPONSE: 'api_response',
            WEBHOOK_RECEIVED: 'webhook_received',
            WEBHOOK_PROCESSED: 'webhook_processed',
            RATE_LIMIT_HIT: 'rate_limit_hit',
            HEALTH_CHECK: 'health_check',
            TOKEN_REFRESH: 'token_refresh',
            USER_ACTION: 'user_action',
            SYSTEM_EVENT: 'system_event',
            SECURITY_EVENT: 'security_event'
        };

        // Sensitive fields to mask in logs
        this.sensitiveFields = [
            'access_token',
            'refresh_token',
            'client_secret',
            'password',
            'api_key',
            'authorization',
            'x-api-key'
        ];
    }

    /**
     * Initialize Winston logger with multiple transports
     */
    initializeLogger() {
        const logFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                return JSON.stringify({
                    timestamp,
                    level,
                    message,
                    ...meta
                });
            })
        );

        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: logFormat,
            defaultMeta: { service: 'integration-service' },
            transports: [
                // Console transport
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
                // File transport for all logs
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'integration-service.log'),
                    maxsize: 50 * 1024 * 1024, // 50MB
                    maxFiles: 10,
                    tailable: true
                }),
                // Separate file for errors
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'integration-errors.log'),
                    level: 'error',
                    maxsize: 50 * 1024 * 1024, // 50MB
                    maxFiles: 5,
                    tailable: true
                }),
                // Separate file for audit trail
                new winston.transports.File({
                    filename: path.join(process.cwd(), 'logs', 'integration-audit.log'),
                    level: 'info',
                    maxsize: 100 * 1024 * 1024, // 100MB
                    maxFiles: 20,
                    tailable: true
                })
            ]
        });

        // Handle uncaught exceptions and rejections
        this.logger.exceptions.handle(
            new winston.transports.File({
                filename: path.join(process.cwd(), 'logs', 'integration-exceptions.log')
            })
        );

        this.logger.rejections.handle(
            new winston.transports.File({
                filename: path.join(process.cwd(), 'logs', 'integration-rejections.log')
            })
        );
    }

    /**
     * Mask sensitive data in logs
     * @param {Object} data - Data to mask
     * @returns {Object} Masked data
     */
    maskSensitiveData(data) {
        if (!data || typeof data !== 'object') return data;

        const masked = Array.isArray(data) ? [...data] : { ...data };

        const maskValue = (obj) => {
            if (Array.isArray(obj)) {
                return obj.map(item => maskValue(item));
            }

            if (obj && typeof obj === 'object') {
                const maskedObj = {};
                for (const [key, value] of Object.entries(obj)) {
                    const lowerKey = key.toLowerCase();
                    
                    if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
                        maskedObj[key] = this.maskString(value);
                    } else if (typeof value === 'object' && value !== null) {
                        maskedObj[key] = maskValue(value);
                    } else {
                        maskedObj[key] = value;
                    }
                }
                return maskedObj;
            }

            return obj;
        };

        return maskValue(masked);
    }

    /**
     * Mask string values
     * @param {string} value - String to mask
     * @returns {string} Masked string
     */
    maskString(value) {
        if (typeof value !== 'string' || value.length === 0) return value;
        
        if (value.length <= 8) {
            return '*'.repeat(value.length);
        }
        
        return value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
    }

    /**
     * Log integration event with audit trail
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     * @param {Object} context - Additional context
     */
    async logEvent(eventType, data = {}, context = {}) {
        try {
            const logEntry = {
                event_type: eventType,
                timestamp: new Date().toISOString(),
                data: this.maskSensitiveData(data),
                context: this.maskSensitiveData(context),
                correlation_id: context.correlationId || this.generateCorrelationId(),
                session_id: context.sessionId,
                user_id: context.userId,
                ip_address: context.ipAddress,
                user_agent: context.userAgent,
                provider: context.provider,
                integration_id: context.integrationId
            };

            // Log to Winston
            this.logger.info('Integration Event', logEntry);

            // Store in database for audit trail
            await this.storeAuditLog(logEntry);

            // Send critical events to external monitoring (if configured)
            if (this.isCriticalEvent(eventType)) {
                await this.sendToExternalMonitoring(logEntry);
            }
        } catch (error) {
            // Log error but don't throw to avoid breaking the main flow
            this.logger.error('Audit logging error', {
                error: error.message,
                stack: error.stack,
                originalEvent: eventType
            });
        }
    }

    /**
     * Store audit log in database
     * @param {Object} logEntry - Log entry to store
     */
    async storeAuditLog(logEntry) {
        try {
            const { error } = await supabaseAdmin()
                .from('integration_audit_logs')
                .insert({
                    event_type: logEntry.event_type,
                    user_id: logEntry.user_id,
                    integration_id: logEntry.integration_id,
                    provider: logEntry.provider,
                    event_data: logEntry.data,
                    context_data: logEntry.context,
                    correlation_id: logEntry.correlation_id,
                    session_id: logEntry.session_id,
                    ip_address: logEntry.ip_address,
                    user_agent: logEntry.user_agent,
                    created_at: logEntry.timestamp
                });

            if (error) {
                console.error('Database audit log storage error:', error);
            }
        } catch (error) {
            console.error('Audit log database error:', error);
        }
    }

    /**
     * Check if event is critical
     * @param {string} eventType - Event type
     * @returns {boolean} Is critical
     */
    isCriticalEvent(eventType) {
        const criticalEvents = [
            this.eventTypes.INTEGRATION_ERROR,
            this.eventTypes.SECURITY_EVENT,
            this.eventTypes.OAUTH_REVOKE,
            this.eventTypes.RATE_LIMIT_HIT
        ];

        return criticalEvents.includes(eventType);
    }

    /**
     * Send critical events to external monitoring
     * @param {Object} logEntry - Log entry
     */
    async sendToExternalMonitoring(logEntry) {
        try {
            // This would integrate with services like DataDog, Sentry, etc.
            // For now, just log to console
            console.warn('CRITICAL EVENT:', JSON.stringify(logEntry, null, 2));

            // Example integration with external service
            if (process.env.WEBHOOK_MONITORING_URL) {
                const response = await fetch(process.env.WEBHOOK_MONITORING_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logEntry)
                });

                if (!response.ok) {
                    console.error('External monitoring webhook failed:', response.status);
                }
            }
        } catch (error) {
            console.error('External monitoring error:', error);
        }
    }

    /**
     * Generate correlation ID for request tracking
     * @returns {string} Correlation ID
     */
    generateCorrelationId() {
        return `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Log OAuth flow events
     */
    async logOAuthStart(userId, provider, context = {}) {
        await this.logEvent(this.eventTypes.OAUTH_START, {
            provider,
            scopes: context.scopes,
            redirect_uri: context.redirectUri
        }, { userId, provider, ...context });
    }

    async logOAuthCallback(userId, provider, success, context = {}) {
        await this.logEvent(this.eventTypes.OAUTH_CALLBACK, {
            provider,
            success,
            error: context.error
        }, { userId, provider, ...context });
    }

    async logOAuthRefresh(userId, provider, success, context = {}) {
        await this.logEvent(this.eventTypes.OAUTH_REFRESH, {
            provider,
            success,
            error: context.error
        }, { userId, provider, ...context });
    }

    async logOAuthRevoke(userId, provider, integrationId, context = {}) {
        await this.logEvent(this.eventTypes.OAUTH_REVOKE, {
            provider,
            integration_id: integrationId
        }, { userId, provider, integrationId, ...context });
    }

    /**
     * Log integration lifecycle events
     */
    async logIntegrationConnect(userId, provider, integrationId, context = {}) {
        await this.logEvent(this.eventTypes.INTEGRATION_CONNECT, {
            provider,
            integration_id: integrationId,
            config: this.maskSensitiveData(context.config)
        }, { userId, provider, integrationId, ...context });
    }

    async logIntegrationDisconnect(userId, provider, integrationId, context = {}) {
        await this.logEvent(this.eventTypes.INTEGRATION_DISCONNECT, {
            provider,
            integration_id: integrationId,
            reason: context.reason
        }, { userId, provider, integrationId, ...context });
    }

    async logIntegrationError(userId, provider, integrationId, error, context = {}) {
        await this.logEvent(this.eventTypes.INTEGRATION_ERROR, {
            provider,
            integration_id: integrationId,
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            }
        }, { userId, provider, integrationId, ...context });
    }

    /**
     * Log API requests and responses
     */
    async logApiRequest(provider, method, endpoint, context = {}) {
        await this.logEvent(this.eventTypes.API_REQUEST, {
            provider,
            method,
            endpoint,
            headers: this.maskSensitiveData(context.headers),
            query: context.query,
            body_size: context.bodySize
        }, { provider, ...context });
    }

    async logApiResponse(provider, method, endpoint, status, context = {}) {
        await this.logEvent(this.eventTypes.API_RESPONSE, {
            provider,
            method,
            endpoint,
            status,
            response_time: context.responseTime,
            response_size: context.responseSize,
            error: context.error
        }, { provider, ...context });
    }

    /**
     * Log webhook events
     */
    async logWebhookReceived(provider, eventType, context = {}) {
        await this.logEvent(this.eventTypes.WEBHOOK_RECEIVED, {
            provider,
            webhook_event_type: eventType,
            headers: this.maskSensitiveData(context.headers),
            body_size: context.bodySize
        }, { provider, ...context });
    }

    async logWebhookProcessed(provider, eventType, success, context = {}) {
        await this.logEvent(this.eventTypes.WEBHOOK_PROCESSED, {
            provider,
            webhook_event_type: eventType,
            success,
            processing_time: context.processingTime,
            error: context.error
        }, { provider, ...context });
    }

    /**
     * Log rate limiting events
     */
    async logRateLimitHit(provider, userId, limitType, context = {}) {
        await this.logEvent(this.eventTypes.RATE_LIMIT_HIT, {
            provider,
            limit_type: limitType,
            current_count: context.currentCount,
            limit: context.limit,
            reset_at: context.resetAt
        }, { userId, provider, ...context });
    }

    /**
     * Log health check events
     */
    async logHealthCheck(provider, healthy, context = {}) {
        await this.logEvent(this.eventTypes.HEALTH_CHECK, {
            provider,
            healthy,
            response_time: context.responseTime,
            error: context.error,
            capabilities: context.capabilities
        }, { provider, ...context });
    }

    /**
     * Log security events
     */
    async logSecurityEvent(eventDescription, context = {}) {
        await this.logEvent(this.eventTypes.SECURITY_EVENT, {
            description: eventDescription,
            severity: context.severity || 'medium',
            threat_level: context.threatLevel,
            action_taken: context.actionTaken
        }, context);
    }

    /**
     * Get audit logs with filtering
     * @param {Object} filters - Filter options
     * @returns {Array} Audit logs
     */
    async getAuditLogs(filters = {}) {
        try {
            let query = supabaseAdmin()
                .from('integration_audit_logs')
                .select('*')
                .order('created_at', { ascending: false });

            // Apply filters
            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }
            if (filters.provider) {
                query = query.eq('provider', filters.provider);
            }
            if (filters.eventType) {
                query = query.eq('event_type', filters.eventType);
            }
            if (filters.startDate) {
                query = query.gte('created_at', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('created_at', filters.endDate);
            }
            if (filters.correlationId) {
                query = query.eq('correlation_id', filters.correlationId);
            }

            // Pagination
            const limit = Math.min(filters.limit || 100, 1000);
            const offset = filters.offset || 0;
            query = query.range(offset, offset + limit - 1);

            const { data, error } = await query;

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Get audit logs error:', error);
            throw error;
        }
    }

    /**
     * Get audit statistics
     * @param {Object} filters - Filter options
     * @returns {Object} Statistics
     */
    async getAuditStats(filters = {}) {
        try {
            // This could be implemented with database views or aggregation
            const logs = await this.getAuditLogs({ ...filters, limit: 10000 });

            const stats = {
                total_events: logs.length,
                by_event_type: {},
                by_provider: {},
                by_user: {},
                recent_errors: logs.filter(log => 
                    log.event_type === this.eventTypes.INTEGRATION_ERROR &&
                    new Date(log.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                ).length
            };

            logs.forEach(log => {
                // Count by event type
                stats.by_event_type[log.event_type] = 
                    (stats.by_event_type[log.event_type] || 0) + 1;

                // Count by provider
                if (log.provider) {
                    stats.by_provider[log.provider] = 
                        (stats.by_provider[log.provider] || 0) + 1;
                }

                // Count by user
                if (log.user_id) {
                    stats.by_user[log.user_id] = 
                        (stats.by_user[log.user_id] || 0) + 1;
                }
            });

            return stats;
        } catch (error) {
            console.error('Get audit stats error:', error);
            throw error;
        }
    }

    /**
     * Export audit logs for compliance
     * @param {Object} filters - Filter options
     * @param {string} format - Export format (json, csv)
     * @returns {string} Exported data
     */
    async exportAuditLogs(filters = {}, format = 'json') {
        try {
            const logs = await this.getAuditLogs(filters);

            if (format === 'csv') {
                return this.convertToCSV(logs);
            }

            return JSON.stringify(logs, null, 2);
        } catch (error) {
            console.error('Export audit logs error:', error);
            throw error;
        }
    }

    /**
     * Convert logs to CSV format
     * @param {Array} logs - Audit logs
     * @returns {string} CSV data
     */
    convertToCSV(logs) {
        if (logs.length === 0) return '';

        const headers = [
            'timestamp', 'event_type', 'user_id', 'provider', 
            'integration_id', 'correlation_id', 'ip_address'
        ];

        const csvRows = [headers.join(',')];

        logs.forEach(log => {
            const row = headers.map(header => {
                const value = log[header] || '';
                return `"${value.toString().replace(/"/g, '""')}"`;
            });
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    /**
     * Clean up old audit logs (for data retention)
     * @param {number} retentionDays - Days to retain logs
     */
    async cleanupOldLogs(retentionDays = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            const { error } = await supabaseAdmin()
                .from('integration_audit_logs')
                .delete()
                .lt('created_at', cutoffDate.toISOString());

            if (error) throw error;

            this.logger.info('Audit log cleanup completed', {
                retention_days: retentionDays,
                cutoff_date: cutoffDate.toISOString()
            });
        } catch (error) {
            console.error('Audit log cleanup error:', error);
            throw error;
        }
    }
}

export default AuditLogger; 