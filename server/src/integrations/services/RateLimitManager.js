/**
 * Rate Limit Manager
 * Handles rate limiting and request queuing for integration providers
 */

import Redis from 'redis';

class RateLimitManager {
    constructor() {
        // Initialize Redis client for distributed rate limiting
        this.redis = null;
        this.initRedis();

        // Provider rate limits (requests per time window)
        this.rateLimits = {
            google: {
                requests_per_second: 10,
                requests_per_minute: 600,
                requests_per_day: 1000000,
                quota_user_limit: 1000, // Per user per day
                burst_limit: 50
            },
            microsoft: {
                requests_per_second: 20,
                requests_per_minute: 1200,
                requests_per_day: 500000,
                quota_user_limit: 2000,
                burst_limit: 100
            },
            zoom: {
                requests_per_second: 10,
                requests_per_minute: 600,
                requests_per_day: 100000,
                quota_user_limit: 500,
                burst_limit: 30
            },
            caldav: {
                requests_per_second: 5,
                requests_per_minute: 300,
                requests_per_day: 50000,
                quota_user_limit: 1000,
                burst_limit: 20
            }
        };

        // Request queues
        this.requestQueues = {
            google: [],
            microsoft: [],
            zoom: [],
            caldav: []
        };

        // Queue processors
        this.queueProcessors = {};

        // Rate limit windows
        this.rateLimitWindows = {
            second: 1000,      // 1 second
            minute: 60000,     // 1 minute
            hour: 3600000,     // 1 hour
            day: 86400000      // 1 day
        };

        // Initialize queue processors
        this.initializeQueueProcessors();
    }

    /**
     * Initialize Redis connection
     */
    async initRedis() {
        try {
            if (process.env.REDIS_URL) {
                this.redis = Redis.createClient({
                    url: process.env.REDIS_URL
                });

                this.redis.on('error', (err) => {
                    console.error('Redis Client Error:', err);
                    this.redis = null; // Fall back to in-memory
                });

                await this.redis.connect();
                console.log('Connected to Redis for rate limiting');
            } else {
                console.log('No Redis URL provided, using in-memory rate limiting');
            }
        } catch (error) {
            console.error('Redis initialization error:', error);
            this.redis = null; // Fall back to in-memory
        }
    }

    /**
     * Initialize queue processors for each provider
     */
    initializeQueueProcessors() {
        Object.keys(this.rateLimits).forEach(provider => {
            this.queueProcessors[provider] = setInterval(
                () => this.processQueue(provider),
                1000 // Process every second
            );
        });
    }

    /**
     * Check if request is allowed under rate limits
     * @param {string} provider - Provider name
     * @param {string} userId - User ID (optional)
     * @param {string} endpoint - API endpoint (optional)
     * @returns {Object} Rate limit check result
     */
    async checkRateLimit(provider, userId = null, endpoint = null) {
        try {
            const limits = this.rateLimits[provider];
            if (!limits) {
                return { allowed: true, reason: 'No limits configured' };
            }

            const now = Date.now();
            const checks = [];

            // Check different time windows
            const windows = [
                { name: 'second', duration: this.rateLimitWindows.second, limit: limits.requests_per_second },
                { name: 'minute', duration: this.rateLimitWindows.minute, limit: limits.requests_per_minute },
                { name: 'day', duration: this.rateLimitWindows.day, limit: limits.requests_per_day }
            ];

            for (const window of windows) {
                const key = `rate_limit:${provider}:${window.name}`;
                const userKey = userId ? `rate_limit:${provider}:${userId}:${window.name}` : null;

                // Check global rate limit
                const globalCount = await this.getRequestCount(key, window.duration);
                if (globalCount >= window.limit) {
                    return {
                        allowed: false,
                        reason: `${provider} ${window.name} rate limit exceeded`,
                        limit: window.limit,
                        current: globalCount,
                        reset_at: now + window.duration
                    };
                }

                // Check user-specific rate limit
                if (userId && limits.quota_user_limit) {
                    const userCount = await this.getRequestCount(userKey, this.rateLimitWindows.day);
                    if (userCount >= limits.quota_user_limit) {
                        return {
                            allowed: false,
                            reason: `User daily quota exceeded for ${provider}`,
                            limit: limits.quota_user_limit,
                            current: userCount,
                            reset_at: now + this.rateLimitWindows.day
                        };
                    }
                }

                checks.push({
                    window: window.name,
                    count: globalCount,
                    limit: window.limit,
                    user_count: userId ? await this.getRequestCount(userKey, window.duration) : 0
                });
            }

            return {
                allowed: true,
                checks,
                remaining: Math.min(...checks.map(c => c.limit - c.count))
            };
        } catch (error) {
            console.error('Rate limit check error:', error);
            // Fail open - allow request if check fails
            return { allowed: true, reason: 'Rate limit check failed' };
        }
    }

    /**
     * Record a request for rate limiting
     * @param {string} provider - Provider name
     * @param {string} userId - User ID (optional)
     * @param {string} endpoint - API endpoint (optional)
     */
    async recordRequest(provider, userId = null, endpoint = null) {
        try {
            const now = Date.now();

            // Record for different time windows
            const windows = ['second', 'minute', 'day'];

            for (const window of windows) {
                const key = `rate_limit:${provider}:${window}`;
                const userKey = userId ? `rate_limit:${provider}:${userId}:${window}` : null;

                await this.incrementRequestCount(key, this.rateLimitWindows[window]);
                if (userKey) {
                    await this.incrementRequestCount(userKey, this.rateLimitWindows[window]);
                }
            }

            // Record endpoint-specific metrics if provided
            if (endpoint) {
                const endpointKey = `rate_limit:${provider}:endpoint:${endpoint}:minute`;
                await this.incrementRequestCount(endpointKey, this.rateLimitWindows.minute);
            }
        } catch (error) {
            console.error('Request recording error:', error);
            // Don't throw - recording failures shouldn't break the request
        }
    }

    /**
     * Get request count for a time window
     * @param {string} key - Redis key
     * @param {number} windowMs - Time window in milliseconds
     * @returns {number} Request count
     */
    async getRequestCount(key, windowMs) {
        try {
            if (this.redis) {
                // Use Redis with sliding window
                const now = Date.now();
                const windowStart = now - windowMs;

                // Remove expired entries
                await this.redis.zRemRangeByScore(key, 0, windowStart);

                // Count current entries
                return await this.redis.zCard(key);
            } else {
                // Fall back to in-memory (less accurate)
                return this.getInMemoryRequestCount(key, windowMs);
            }
        } catch (error) {
            console.error('Get request count error:', error);
            return 0;
        }
    }

    /**
     * Increment request count
     * @param {string} key - Redis key
     * @param {number} windowMs - Time window in milliseconds
     */
    async incrementRequestCount(key, windowMs) {
        try {
            if (this.redis) {
                const now = Date.now();
                // Add current timestamp to sorted set
                await this.redis.zAdd(key, { score: now, value: `${now}_${Math.random()}` });
                // Set expiration
                await this.redis.expire(key, Math.ceil(windowMs / 1000));
            } else {
                // Fall back to in-memory
                this.incrementInMemoryRequestCount(key, windowMs);
            }
        } catch (error) {
            console.error('Increment request count error:', error);
        }
    }

    /**
     * In-memory request count (fallback)
     */
    getInMemoryRequestCount(key, windowMs) {
        if (!this.inMemoryCounters) this.inMemoryCounters = {};
        
        const now = Date.now();
        const counter = this.inMemoryCounters[key] || { requests: [], lastCleanup: now };
        
        // Clean old requests
        if (now - counter.lastCleanup > windowMs / 4) {
            counter.requests = counter.requests.filter(timestamp => 
                now - timestamp < windowMs
            );
            counter.lastCleanup = now;
        }
        
        return counter.requests.length;
    }

    /**
     * In-memory request increment (fallback)
     */
    incrementInMemoryRequestCount(key, windowMs) {
        if (!this.inMemoryCounters) this.inMemoryCounters = {};
        
        const now = Date.now();
        const counter = this.inMemoryCounters[key] || { requests: [], lastCleanup: now };
        
        counter.requests.push(now);
        this.inMemoryCounters[key] = counter;
    }

    /**
     * Queue a request for later processing
     * @param {string} provider - Provider name
     * @param {Object} requestData - Request data
     * @param {number} priority - Priority (lower = higher priority)
     * @returns {Promise} Request promise
     */
    async queueRequest(provider, requestData, priority = 5) {
        return new Promise((resolve, reject) => {
            const queueItem = {
                id: `${Date.now()}_${Math.random()}`,
                provider,
                requestData,
                priority,
                resolve,
                reject,
                queued_at: Date.now(),
                retries: 0,
                max_retries: 3
            };

            const queue = this.requestQueues[provider];
            if (!queue) {
                reject(new Error(`No queue found for provider: ${provider}`));
                return;
            }

            // Insert in priority order
            let inserted = false;
            for (let i = 0; i < queue.length; i++) {
                if (queue[i].priority > priority) {
                    queue.splice(i, 0, queueItem);
                    inserted = true;
                    break;
                }
            }

            if (!inserted) {
                queue.push(queueItem);
            }

            console.log(`Queued request for ${provider}, queue length: ${queue.length}`);
        });
    }

    /**
     * Process queue for a provider
     * @param {string} provider - Provider name
     */
    async processQueue(provider) {
        try {
            const queue = this.requestQueues[provider];
            if (!queue || queue.length === 0) return;

            // Check if we can process requests
            const rateLimitCheck = await this.checkRateLimit(provider);
            if (!rateLimitCheck.allowed) {
                console.log(`Rate limit hit for ${provider}, delaying queue processing`);
                return;
            }

            // Process up to burst limit at once
            const limits = this.rateLimits[provider];
            const batchSize = Math.min(limits.burst_limit || 10, queue.length);

            for (let i = 0; i < batchSize; i++) {
                const item = queue.shift();
                if (!item) break;

                try {
                    // Check rate limit again for this specific request
                    const itemRateLimitCheck = await this.checkRateLimit(
                        provider, 
                        item.requestData.userId,
                        item.requestData.endpoint
                    );

                    if (!itemRateLimitCheck.allowed) {
                        // Put back in queue if rate limited
                        queue.unshift(item);
                        break;
                    }

                    // Process the request
                    const result = await this.executeRequest(item);
                    
                    // Record the request
                    await this.recordRequest(
                        provider,
                        item.requestData.userId,
                        item.requestData.endpoint
                    );

                    item.resolve(result);
                } catch (error) {
                    console.error(`Queue processing error for ${provider}:`, error);

                    // Retry logic
                    if (item.retries < item.max_retries) {
                        item.retries++;
                        queue.push(item); // Add to end for retry
                        console.log(`Retrying request ${item.id}, attempt ${item.retries}`);
                    } else {
                        item.reject(error);
                    }
                }
            }
        } catch (error) {
            console.error(`Queue processor error for ${provider}:`, error);
        }
    }

    /**
     * Execute a queued request
     * @param {Object} item - Queue item
     * @returns {any} Request result
     */
    async executeRequest(item) {
        const { provider, requestData } = item;
        
        // This would integrate with your provider services
        // For now, simulate request execution
        console.log(`Executing ${provider} request:`, requestData.method, requestData.endpoint);
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
            success: true,
            provider,
            method: requestData.method,
            endpoint: requestData.endpoint,
            executed_at: Date.now()
        };
    }

    /**
     * Get queue statistics
     * @param {string} provider - Provider name (optional)
     * @returns {Object} Queue stats
     */
    getQueueStats(provider = null) {
        if (provider) {
            const queue = this.requestQueues[provider];
            return {
                provider,
                queue_length: queue ? queue.length : 0,
                oldest_item: queue && queue.length > 0 ? 
                    Date.now() - queue[queue.length - 1].queued_at : 0
            };
        }

        const stats = {};
        Object.keys(this.requestQueues).forEach(p => {
            stats[p] = this.getQueueStats(p);
        });

        return stats;
    }

    /**
     * Get rate limit status
     * @param {string} provider - Provider name
     * @param {string} userId - User ID (optional)
     * @returns {Object} Rate limit status
     */
    async getRateLimitStatus(provider, userId = null) {
        try {
            const limits = this.rateLimits[provider];
            if (!limits) {
                return { provider, error: 'No limits configured' };
            }

            const status = {
                provider,
                limits,
                current_usage: {},
                queue_length: this.requestQueues[provider]?.length || 0
            };

            // Get current usage for different windows
            const windows = ['second', 'minute', 'day'];
            for (const window of windows) {
                const key = `rate_limit:${provider}:${window}`;
                const userKey = userId ? `rate_limit:${provider}:${userId}:${window}` : null;

                status.current_usage[window] = {
                    global: await this.getRequestCount(key, this.rateLimitWindows[window]),
                    user: userKey ? await this.getRequestCount(userKey, this.rateLimitWindows[window]) : 0
                };
            }

            return status;
        } catch (error) {
            console.error('Rate limit status error:', error);
            return { provider, error: error.message };
        }
    }

    /**
     * Clear rate limits (for testing/admin)
     * @param {string} provider - Provider name
     * @param {string} userId - User ID (optional)
     */
    async clearRateLimits(provider, userId = null) {
        try {
            if (this.redis) {
                const pattern = userId ? 
                    `rate_limit:${provider}:${userId}:*` : 
                    `rate_limit:${provider}:*`;
                
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(keys);
                }
            } else {
                // Clear in-memory counters
                if (this.inMemoryCounters) {
                    const keysToDelete = Object.keys(this.inMemoryCounters).filter(key => 
                        key.includes(provider) && (!userId || key.includes(userId))
                    );
                    keysToDelete.forEach(key => delete this.inMemoryCounters[key]);
                }
            }

            console.log(`Cleared rate limits for ${provider}${userId ? ` user ${userId}` : ''}`);
        } catch (error) {
            console.error('Clear rate limits error:', error);
        }
    }

    /**
     * Shutdown rate limit manager
     */
    async shutdown() {
        try {
            // Clear queue processors
            Object.values(this.queueProcessors).forEach(processor => {
                clearInterval(processor);
            });

            // Close Redis connection
            if (this.redis) {
                await this.redis.disconnect();
            }

            console.log('Rate Limit Manager shutdown complete');
        } catch (error) {
            console.error('Rate Limit Manager shutdown error:', error);
        }
    }
}

export default RateLimitManager; 