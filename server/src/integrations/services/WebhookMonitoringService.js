/**
 * Webhook Monitoring Service
 * Monitors webhook health and performance metrics
 */

const EventEmitter = require('events');

class WebhookMonitoringService extends EventEmitter {
    constructor() {
        super();
        this.metrics = {
            received: 0,
            processed: 0,
            failed: 0,
            latency: [],
            providerMetrics: {}
        };
        this.healthChecks = new Map();
        this.alertThresholds = {
            failureRate: 0.1, // 10%
            latencyMs: 5000,   // 5 seconds
            consecutiveFailures: 5
        };
    }

    /**
     * Record webhook received
     * @param {string} provider - Provider name
     * @param {Object} metadata - Additional metadata
     */
    recordWebhookReceived(provider, metadata = {}) {
        this.metrics.received++;
        
        if (!this.metrics.providerMetrics[provider]) {
            this.metrics.providerMetrics[provider] = {
                received: 0,
                processed: 0,
                failed: 0,
                latency: []
            };
        }
        
        this.metrics.providerMetrics[provider].received++;
        
        this.emit('webhook:received', {
            provider,
            timestamp: new Date(),
            metadata
        });
    }

    /**
     * Record webhook processed successfully
     * @param {string} provider - Provider name
     * @param {number} latencyMs - Processing latency in milliseconds
     * @param {Object} metadata - Additional metadata
     */
    recordWebhookProcessed(provider, latencyMs, metadata = {}) {
        this.metrics.processed++;
        this.metrics.latency.push(latencyMs);
        
        if (this.metrics.providerMetrics[provider]) {
            this.metrics.providerMetrics[provider].processed++;
            this.metrics.providerMetrics[provider].latency.push(latencyMs);
        }
        
        // Keep only last 1000 latency measurements
        if (this.metrics.latency.length > 1000) {
            this.metrics.latency = this.metrics.latency.slice(-1000);
        }
        
        this.emit('webhook:processed', {
            provider,
            latencyMs,
            timestamp: new Date(),
            metadata
        });
    }

    /**
     * Record webhook processing failure
     * @param {string} provider - Provider name
     * @param {Error} error - Error that occurred
     * @param {Object} metadata - Additional metadata
     */
    recordWebhookFailed(provider, error, metadata = {}) {
        this.metrics.failed++;
        
        if (this.metrics.providerMetrics[provider]) {
            this.metrics.providerMetrics[provider].failed++;
        }
        
        this.emit('webhook:failed', {
            provider,
            error: error.message,
            timestamp: new Date(),
            metadata
        });
        
        // Check if we need to trigger alerts
        this.checkAlertThresholds(provider);
    }

    /**
     * Get current monitoring metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        const avgLatency = this.metrics.latency.length > 0 
            ? this.metrics.latency.reduce((sum, l) => sum + l, 0) / this.metrics.latency.length 
            : 0;
            
        const successRate = this.metrics.received > 0 
            ? (this.metrics.processed / this.metrics.received) 
            : 1;

        return {
            ...this.metrics,
            averageLatencyMs: Math.round(avgLatency),
            successRate: Math.round(successRate * 100) / 100,
            failureRate: Math.round((1 - successRate) * 100) / 100
        };
    }

    /**
     * Get health status for all providers
     * @returns {Object} Health status by provider
     */
    getHealthStatus() {
        const status = {};
        
        for (const [provider, metrics] of Object.entries(this.metrics.providerMetrics)) {
            const received = metrics.received || 0;
            const processed = metrics.processed || 0;
            const failed = metrics.failed || 0;
            
            const successRate = received > 0 ? (processed / received) : 1;
            const avgLatency = metrics.latency.length > 0 
                ? metrics.latency.reduce((sum, l) => sum + l, 0) / metrics.latency.length 
                : 0;
            
            status[provider] = {
                status: this.determineHealthStatus(successRate, avgLatency, failed),
                successRate: Math.round(successRate * 100) / 100,
                averageLatencyMs: Math.round(avgLatency),
                totalReceived: received,
                totalProcessed: processed,
                totalFailed: failed
            };
        }
        
        return status;
    }

    /**
     * Determine health status based on metrics
     * @param {number} successRate - Success rate (0-1)
     * @param {number} avgLatency - Average latency in ms
     * @param {number} failedCount - Number of failures
     * @returns {string} Health status
     */
    determineHealthStatus(successRate, avgLatency, failedCount) {
        if (successRate < (1 - this.alertThresholds.failureRate) || 
            avgLatency > this.alertThresholds.latencyMs) {
            return 'unhealthy';
        } else if (successRate < 0.95 || avgLatency > this.alertThresholds.latencyMs * 0.7) {
            return 'degraded';
        } else {
            return 'healthy';
        }
    }

    /**
     * Check if alert thresholds are exceeded
     * @param {string} provider - Provider name
     */
    checkAlertThresholds(provider) {
        const metrics = this.metrics.providerMetrics[provider];
        if (!metrics) return;
        
        const received = metrics.received || 0;
        const failed = metrics.failed || 0;
        
        if (received > 0) {
            const failureRate = failed / received;
            
            if (failureRate >= this.alertThresholds.failureRate) {
                this.emit('alert:highFailureRate', {
                    provider,
                    failureRate: Math.round(failureRate * 100) / 100,
                    threshold: this.alertThresholds.failureRate
                });
            }
        }
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            received: 0,
            processed: 0,
            failed: 0,
            latency: [],
            providerMetrics: {}
        };
        
        this.emit('metrics:reset');
    }

    /**
     * Start monitoring
     */
    start() {
        console.log('Webhook monitoring service started');
        this.emit('monitoring:started');
    }

    /**
     * Stop monitoring
     */
    stop() {
        console.log('Webhook monitoring service stopped');
        this.emit('monitoring:stopped');
    }
}

module.exports = WebhookMonitoringService; 