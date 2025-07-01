/**
 * Audit Logging & Security Monitoring Service
 * 
 * Provides comprehensive security monitoring including:
 * - Comprehensive audit logging for all integration operations
 * - Security event monitoring and alerting
 * - User activity tracking for integration usage
 * - Security dashboard and reporting
 * - Anomaly detection for unusual access patterns
 * - Compliance logging for regulatory requirements
 * - Secure log storage with tamper protection
 * - Real-time security alerts and notifications
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const EventEmitter = require('events');

class AuditLoggingService extends EventEmitter {
    constructor() {
        super();
        
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Audit configuration
        this.config = {
            retention: {
                security_events: 365,    // 1 year
                user_activities: 90,     // 3 months
                api_logs: 30,            // 1 month
                webhook_logs: 30,        // 1 month
                compliance_logs: 2555    // 7 years (regulatory requirement)
            },
            anomalyDetection: {
                enabled: true,
                thresholds: {
                    loginFailures: 5,          // per 15 minutes
                    apiCallsPerMinute: 1000,   // per user
                    dataAccessVolume: 10000,   // records per hour
                    unusualLocations: true,    // detect geo anomalies
                    timeBasedAccess: true      // detect off-hours access
                }
            },
            alerting: {
                enabled: true,
                channels: ['email', 'webhook', 'database'],
                severityLevels: ['low', 'medium', 'high', 'critical'],
                realTime: true
            },
            compliance: {
                hipaa: true,
                gdpr: true,
                soc2: true,
                pci: false
            }
        };

        // Activity patterns storage for anomaly detection
        this.userPatterns = new Map();
        this.baselineMetrics = new Map();
        
        // Real-time alert queue
        this.alertQueue = [];
        
        // Initialize monitoring
        this.initializeMonitoring();
    }

    /**
     * Initialize security monitoring and anomaly detection
     */
    initializeMonitoring() {
        // Start anomaly detection engine
        setInterval(() => {
            this.detectAnomalies();
        }, 60000); // Check every minute

        // Process alert queue
        setInterval(() => {
            this.processAlertQueue();
        }, 5000); // Process alerts every 5 seconds

        // Cleanup old logs
        setInterval(() => {
            this.cleanupOldLogs();
        }, 24 * 60 * 60 * 1000); // Daily cleanup

        console.log('Audit logging and security monitoring initialized');
    }

    /**
     * Log security event with comprehensive details
     */
    async logSecurityEvent(event) {
        try {
            const securityEvent = {
                event_id: crypto.randomUUID(),
                event_type: event.type,
                severity: event.severity || 'medium',
                user_id: event.userId,
                integration_id: event.integrationId,
                provider: event.provider,
                
                // Event details
                event_data: event.data || {},
                metadata: {
                    timestamp: new Date().toISOString(),
                    source_ip: event.sourceIP,
                    user_agent: event.userAgent,
                    session_id: event.sessionId,
                    request_id: event.requestId,
                    correlation_id: event.correlationId
                },
                
                // Security context
                security_context: {
                    authentication_method: event.authMethod,
                    authorization_level: event.authLevel,
                    risk_score: await this.calculateRiskScore(event),
                    geo_location: event.geoLocation,
                    device_fingerprint: event.deviceFingerprint
                },
                
                // Compliance flags
                compliance_flags: {
                    hipaa_relevant: this.isHIPAARelevant(event),
                    gdpr_relevant: this.isGDPRRelevant(event),
                    pii_accessed: this.containsPII(event.data),
                    phi_accessed: this.containsPHI(event.data)
                },
                
                // Tamper protection
                integrity_hash: this.calculateEventHash({
                    type: event.type,
                    userId: event.userId,
                    data: event.data,
                    timestamp: new Date().toISOString()
                }),
                
                created_at: new Date().toISOString()
            };

            // Store in database
            const { error } = await this.supabase
                .from('security_audit_logs')
                .insert(securityEvent);

            if (error) {
                console.error('Failed to log security event:', error);
                throw error;
            }

            // Emit event for real-time processing
            this.emit('securityEvent', securityEvent);

            // Check if this triggers alerts
            await this.checkForAlerts(securityEvent);

            return securityEvent.event_id;
        } catch (error) {
            console.error('Security event logging failed:', error);
            throw error;
        }
    }

    /**
     * Log user activity for integration usage tracking
     */
    async logUserActivity(activity) {
        try {
            const userActivity = {
                activity_id: crypto.randomUUID(),
                user_id: activity.userId,
                integration_id: activity.integrationId,
                provider: activity.provider,
                
                // Activity details
                activity_type: activity.type,
                activity_description: activity.description,
                activity_data: activity.data || {},
                
                // Context information
                session_context: {
                    session_id: activity.sessionId,
                    source_ip: activity.sourceIP,
                    user_agent: activity.userAgent,
                    geo_location: activity.geoLocation,
                    device_type: activity.deviceType
                },
                
                // Timing information
                started_at: activity.startedAt || new Date().toISOString(),
                completed_at: activity.completedAt || new Date().toISOString(),
                duration_ms: activity.durationMs,
                
                // Result information
                status: activity.status || 'completed',
                result_data: activity.result || {},
                error_details: activity.error,
                
                // Analytics data
                analytics: {
                    data_volume: activity.dataVolume || 0,
                    api_calls_made: activity.apiCallsMade || 0,
                    sync_operations: activity.syncOperations || 0,
                    meeting_operations: activity.meetingOperations || 0
                },
                
                created_at: new Date().toISOString()
            };

            // Store in database
            const { error } = await this.supabase
                .from('user_activity_logs')
                .insert(userActivity);

            if (error) {
                console.error('Failed to log user activity:', error);
                throw error;
            }

            // Update user patterns for anomaly detection
            await this.updateUserPatterns(userActivity);

            return userActivity.activity_id;
        } catch (error) {
            console.error('User activity logging failed:', error);
            throw error;
        }
    }

    /**
     * Log API request/response for comprehensive audit trail
     */
    async logAPIOperation(operation) {
        try {
            const apiLog = {
                log_id: crypto.randomUUID(),
                user_id: operation.userId,
                integration_id: operation.integrationId,
                provider: operation.provider,
                
                // Request details
                request: {
                    method: operation.method,
                    url: this.sanitizeURL(operation.url),
                    headers: this.sanitizeHeaders(operation.headers),
                    body_size: operation.bodySize || 0,
                    timestamp: operation.requestTime || new Date().toISOString()
                },
                
                // Response details
                response: {
                    status_code: operation.statusCode,
                    headers: this.sanitizeHeaders(operation.responseHeaders),
                    body_size: operation.responseBodySize || 0,
                    duration_ms: operation.durationMs,
                    timestamp: new Date().toISOString()
                },
                
                // Security context
                security_data: {
                    oauth_token_used: !!operation.oauthTokenUsed,
                    api_key_used: !!operation.apiKeyUsed,
                    rate_limit_remaining: operation.rateLimitRemaining,
                    quota_remaining: operation.quotaRemaining
                },
                
                // Error information
                error_details: operation.error,
                retry_count: operation.retryCount || 0,
                
                created_at: new Date().toISOString()
            };

            // Store in database
            const { error } = await this.supabase
                .from('api_audit_logs')
                .insert(apiLog);

            if (error) {
                console.error('Failed to log API operation:', error);
                throw error;
            }

            return apiLog.log_id;
        } catch (error) {
            console.error('API operation logging failed:', error);
            throw error;
        }
    }

    /**
     * Log compliance-relevant events
     */
    async logComplianceEvent(event) {
        try {
            const complianceLog = {
                compliance_id: crypto.randomUUID(),
                event_type: event.type,
                compliance_framework: event.framework, // HIPAA, GDPR, SOC2, etc.
                
                // Data subject information
                data_subject: {
                    user_id: event.userId,
                    patient_id: event.patientId,
                    data_categories: event.dataCategories || [],
                    sensitive_data_types: event.sensitiveDataTypes || []
                },
                
                // Processing details
                processing_activity: {
                    purpose: event.purpose,
                    legal_basis: event.legalBasis,
                    data_processed: event.dataProcessed,
                    retention_period: event.retentionPeriod,
                    cross_border_transfer: event.crossBorderTransfer || false
                },
                
                // Access control
                access_control: {
                    accessor_role: event.accessorRole,
                    authorization_basis: event.authorizationBasis,
                    access_level: event.accessLevel,
                    data_minimization_applied: event.dataMinimization || true
                },
                
                // Audit trail
                audit_trail: {
                    system_component: event.systemComponent,
                    integration_provider: event.provider,
                    processing_location: event.processingLocation,
                    encryption_used: event.encryptionUsed || false,
                    backup_created: event.backupCreated || false
                },
                
                // Compliance verification
                compliance_verification: {
                    consent_obtained: event.consentObtained || false,
                    consent_timestamp: event.consentTimestamp,
                    right_to_withdraw: event.rightToWithdraw || true,
                    data_protection_assessment: event.dpaCompleted || false
                },
                
                created_at: new Date().toISOString()
            };

            // Store in database with extended retention
            const { error } = await this.supabase
                .from('compliance_audit_logs')
                .insert(complianceLog);

            if (error) {
                console.error('Failed to log compliance event:', error);
                throw error;
            }

            return complianceLog.compliance_id;
        } catch (error) {
            console.error('Compliance event logging failed:', error);
            throw error;
        }
    }

    /**
     * Calculate risk score for security events
     */
    async calculateRiskScore(event) {
        let riskScore = 0;

        // Base risk by event type
        const eventRisks = {
            'login_failure': 2,
            'token_refresh_failed': 3,
            'unauthorized_access': 8,
            'data_breach': 10,
            'admin_action': 4,
            'integration_created': 3,
            'integration_deleted': 5,
            'bulk_data_access': 6,
            'off_hours_access': 4,
            'unusual_location': 5
        };

        riskScore += eventRisks[event.type] || 1;

        // Location-based risk
        if (event.geoLocation) {
            const isUnusualLocation = await this.isUnusualLocation(event.userId, event.geoLocation);
            if (isUnusualLocation) riskScore += 3;
        }

        // Time-based risk
        const isOffHours = this.isOffHoursAccess(new Date());
        if (isOffHours) riskScore += 2;

        // Volume-based risk
        if (event.data?.volumeAccessed > 1000) riskScore += 2;
        if (event.data?.volumeAccessed > 10000) riskScore += 4;

        // Frequency-based risk
        const recentEvents = await this.getRecentUserEvents(event.userId, 3600000); // 1 hour
        if (recentEvents.length > 100) riskScore += 3;

        return Math.min(riskScore, 10); // Cap at 10
    }

    /**
     * Detect anomalies in user behavior
     */
    async detectAnomalies() {
        try {
            const activeUsers = await this.getActiveUsers();
            
            for (const userId of activeUsers) {
                await this.detectUserAnomalies(userId);
            }
        } catch (error) {
            console.error('Anomaly detection failed:', error);
        }
    }

    /**
     * Detect anomalies for specific user
     */
    async detectUserAnomalies(userId) {
        try {
            const userPattern = this.userPatterns.get(userId) || {};
            const recentActivity = await this.getRecentUserActivity(userId);

            // Check for unusual API call volume
            const apiCallAnomaly = await this.detectAPICallAnomaly(userId, recentActivity);
            if (apiCallAnomaly.detected) {
                await this.createAlert('api_volume_anomaly', 'medium', userId, apiCallAnomaly);
            }

            // Check for unusual access patterns
            const accessAnomaly = await this.detectAccessPatternAnomaly(userId, recentActivity);
            if (accessAnomaly.detected) {
                await this.createAlert('access_pattern_anomaly', 'medium', userId, accessAnomaly);
            }

            // Check for unusual data volume access
            const dataAnomaly = await this.detectDataVolumeAnomaly(userId, recentActivity);
            if (dataAnomaly.detected) {
                await this.createAlert('data_volume_anomaly', 'high', userId, dataAnomaly);
            }

            // Check for geographical anomalies
            const geoAnomaly = await this.detectGeographicalAnomaly(userId, recentActivity);
            if (geoAnomaly.detected) {
                await this.createAlert('geographical_anomaly', 'high', userId, geoAnomaly);
            }

        } catch (error) {
            console.error(`Anomaly detection failed for user ${userId}:`, error);
        }
    }

    /**
     * Create security alert
     */
    async createAlert(alertType, severity, userId, details) {
        const alert = {
            alert_id: crypto.randomUUID(),
            alert_type: alertType,
            severity,
            user_id: userId,
            details,
            status: 'active',
            created_at: new Date().toISOString(),
            requires_action: severity === 'high' || severity === 'critical'
        };

        // Add to alert queue for immediate processing
        this.alertQueue.push(alert);

        // Store in database
        const { error } = await this.supabase
            .from('security_alerts')
            .insert(alert);

        if (error) {
            console.error('Failed to create alert:', error);
        }

        // Emit for real-time processing
        this.emit('securityAlert', alert);

        return alert.alert_id;
    }

    /**
     * Process alert queue
     */
    async processAlertQueue() {
        if (this.alertQueue.length === 0) return;

        const alertsToProcess = this.alertQueue.splice(0, 10); // Process up to 10 alerts at a time

        for (const alert of alertsToProcess) {
            try {
                await this.processAlert(alert);
            } catch (error) {
                console.error('Alert processing failed:', error);
                // Re-queue failed alerts with exponential backoff
                setTimeout(() => {
                    this.alertQueue.push(alert);
                }, 5000);
            }
        }
    }

    /**
     * Process individual alert
     */
    async processAlert(alert) {
        // Send notifications based on severity
        if (alert.severity === 'critical') {
            await this.sendCriticalAlert(alert);
        } else if (alert.severity === 'high') {
            await this.sendHighPriorityAlert(alert);
        }

        // Update metrics
        await this.updateSecurityMetrics(alert);

        // Auto-respond to certain alert types
        if (alert.requires_action) {
            await this.triggerAutoResponse(alert);
        }
    }

    /**
     * Generate security dashboard data
     */
    async generateSecurityDashboard(timeRange = '24h') {
        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - this.parseTimeRange(timeRange));

            const [
                securityEvents,
                userActivities,
                apiLogs,
                alerts,
                complianceEvents
            ] = await Promise.all([
                this.getSecurityEventsSummary(startTime, endTime),
                this.getUserActivitiesSummary(startTime, endTime),
                this.getAPILogsSummary(startTime, endTime),
                this.getAlertsSummary(startTime, endTime),
                this.getComplianceEventsSummary(startTime, endTime)
            ]);

            return {
                timeRange: {
                    start: startTime.toISOString(),
                    end: endTime.toISOString()
                },
                overview: {
                    securityEvents: securityEvents.total,
                    userActivities: userActivities.total,
                    apiCalls: apiLogs.total,
                    activeAlerts: alerts.active,
                    riskScore: await this.calculateOverallRiskScore(),
                    complianceStatus: this.getComplianceStatus()
                },
                trends: {
                    securityEvents: securityEvents.trends,
                    userActivities: userActivities.trends,
                    apiUsage: apiLogs.trends,
                    alertFrequency: alerts.trends
                },
                topRisks: await this.getTopSecurityRisks(),
                recentAlerts: alerts.recent,
                complianceSummary: complianceEvents.summary,
                anomalies: await this.getDetectedAnomalies(startTime, endTime)
            };
        } catch (error) {
            console.error('Dashboard generation failed:', error);
            throw error;
        }
    }

    /**
     * Helper methods for data sanitization and utility functions
     */
    sanitizeURL(url) {
        if (!url) return url;
        try {
            const urlObj = new URL(url);
            // Remove sensitive parameters
            ['access_token', 'api_key', 'secret', 'password'].forEach(param => {
                if (urlObj.searchParams.has(param)) {
                    urlObj.searchParams.set(param, '[REDACTED]');
                }
            });
            return urlObj.toString();
        } catch {
            return url;
        }
    }

    sanitizeHeaders(headers) {
        if (!headers) return headers;
        const sanitized = { ...headers };
        ['authorization', 'x-api-key', 'cookie', 'x-auth-token'].forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        return sanitized;
    }

    calculateEventHash(eventData) {
        const dataString = JSON.stringify(eventData, Object.keys(eventData).sort());
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }

    isHIPAARelevant(event) {
        const hipaaKeywords = ['patient', 'medical', 'health', 'phi', 'diagnosis', 'treatment'];
        const eventString = JSON.stringify(event).toLowerCase();
        return hipaaKeywords.some(keyword => eventString.includes(keyword));
    }

    isGDPRRelevant(event) {
        const gdprKeywords = ['personal', 'pii', 'email', 'name', 'address', 'phone'];
        const eventString = JSON.stringify(event).toLowerCase();
        return gdprKeywords.some(keyword => eventString.includes(keyword));
    }

    containsPII(data) {
        if (!data) return false;
        const piiPatterns = [
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
            /\b\d{3}-\d{2}-\d{4}\b/, // SSN
            /\b\d{3}-\d{3}-\d{4}\b/  // Phone
        ];
        const dataString = JSON.stringify(data);
        return piiPatterns.some(pattern => pattern.test(dataString));
    }

    containsPHI(data) {
        if (!data) return false;
        const phiKeywords = ['diagnosis', 'treatment', 'medication', 'symptoms', 'medical_record'];
        const dataString = JSON.stringify(data).toLowerCase();
        return phiKeywords.some(keyword => dataString.includes(keyword));
    }

    parseTimeRange(timeRange) {
        const timeMap = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        return timeMap[timeRange] || timeMap['24h'];
    }

    async cleanupOldLogs() {
        try {
            const retentionPeriods = this.config.retention;
            const now = new Date();

            for (const [table, days] of Object.entries(retentionPeriods)) {
                const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
                
                await this.supabase
                    .from(table)
                    .delete()
                    .lt('created_at', cutoffDate.toISOString());
            }

            console.log('Old logs cleanup completed');
        } catch (error) {
            console.error('Log cleanup failed:', error);
        }
    }

    // Additional helper methods would be implemented here
    // ... (getActiveUsers, getRecentUserActivity, detectAPICallAnomaly, etc.)
}

module.exports = AuditLoggingService; 