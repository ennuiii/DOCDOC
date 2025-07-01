/**
 * OAuth Token Security Service
 * 
 * Provides comprehensive security for OAuth tokens including:
 * - Encryption at rest using Supabase vault
 * - Automatic token refresh with secure rotation
 * - Token validation and integrity checking
 * - Secure token revocation processes
 * - Token lifecycle management with expiration tracking
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

class OAuthTokenSecurityService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Encryption configuration
        this.algorithm = 'aes-256-gcm';
        this.keyDerivationRounds = 100000;
        this.tokenValidityBuffer = 300; // 5 minutes buffer for token expiry
        
        // Cache for decrypted tokens to avoid excessive vault calls
        this.tokenCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
        
        // Initialize vault key if not exists
        this.initializeVaultKey();
    }

    /**
     * Initialize Supabase vault key for token encryption
     */
    async initializeVaultKey() {
        try {
            const keyName = 'oauth_token_master_key';
            
            // Check if key exists
            const { data: existingKey, error: checkError } = await this.supabase.rpc(
                'vault_select',
                { name: keyName }
            );

            if (checkError && !checkError.message.includes('not found')) {
                throw checkError;
            }

            // Create master key if it doesn't exist
            if (!existingKey || existingKey.length === 0) {
                const masterKey = crypto.randomBytes(32).toString('hex');
                
                const { error: insertError } = await this.supabase.rpc(
                    'vault_insert',
                    {
                        name: keyName,
                        secret: masterKey,
                        description: 'Master key for OAuth token encryption'
                    }
                );

                if (insertError) {
                    throw insertError;
                }

                console.log('OAuth token master key initialized in Supabase vault');
            }
        } catch (error) {
            console.error('Failed to initialize vault key:', error);
            throw new Error('OAuth token security initialization failed');
        }
    }

    /**
     * Get master key from Supabase vault
     */
    async getMasterKey() {
        try {
            const { data, error } = await this.supabase.rpc(
                'vault_select',
                { name: 'oauth_token_master_key' }
            );

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) {
                throw new Error('Master key not found in vault');
            }

            return data[0].secret;
        } catch (error) {
            console.error('Failed to retrieve master key:', error);
            throw new Error('Unable to access token encryption key');
        }
    }

    /**
     * Derive encryption key from master key and integration ID
     */
    async deriveEncryptionKey(integrationId) {
        const masterKey = await this.getMasterKey();
        const salt = Buffer.from(integrationId, 'utf8');
        
        return crypto.pbkdf2Sync(
            masterKey,
            salt,
            this.keyDerivationRounds,
            32,
            'sha256'
        );
    }

    /**
     * Encrypt OAuth token data
     */
    async encryptTokenData(tokenData, integrationId) {
        try {
            const key = await this.deriveEncryptionKey(integrationId);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(this.algorithm, key);
            
            cipher.setAAD(Buffer.from(integrationId, 'utf8'));
            
            const tokenString = JSON.stringify({
                ...tokenData,
                encrypted_at: new Date().toISOString(),
                integrity_hash: this.calculateIntegrityHash(tokenData)
            });
            
            let encrypted = cipher.update(tokenString, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted_data: encrypted,
                iv: iv.toString('hex'),
                auth_tag: authTag.toString('hex'),
                encryption_version: '1.0'
            };
        } catch (error) {
            console.error('Token encryption failed:', error);
            throw new Error('Failed to encrypt OAuth token');
        }
    }

    /**
     * Decrypt OAuth token data
     */
    async decryptTokenData(encryptedData, integrationId) {
        try {
            // Check cache first
            const cacheKey = `${integrationId}_${encryptedData.auth_tag}`;
            const cached = this.tokenCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.data;
            }

            const key = await this.deriveEncryptionKey(integrationId);
            const decipher = crypto.createDecipher(this.algorithm, key);
            
            decipher.setAuthTag(Buffer.from(encryptedData.auth_tag, 'hex'));
            decipher.setAAD(Buffer.from(integrationId, 'utf8'));
            
            let decrypted = decipher.update(encryptedData.encrypted_data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            const tokenData = JSON.parse(decrypted);
            
            // Verify integrity
            const expectedHash = this.calculateIntegrityHash({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                token_expires_at: tokenData.token_expires_at,
                scope: tokenData.scope
            });
            
            if (tokenData.integrity_hash !== expectedHash) {
                throw new Error('Token integrity verification failed');
            }
            
            // Cache decrypted data
            this.tokenCache.set(cacheKey, {
                data: tokenData,
                timestamp: Date.now()
            });
            
            return tokenData;
        } catch (error) {
            console.error('Token decryption failed:', error);
            throw new Error('Failed to decrypt OAuth token');
        }
    }

    /**
     * Calculate integrity hash for token data
     */
    calculateIntegrityHash(tokenData) {
        const dataString = JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: tokenData.token_expires_at,
            scope: Array.isArray(tokenData.scope) ? tokenData.scope.sort() : tokenData.scope
        });
        
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }

    /**
     * Store encrypted OAuth tokens
     */
    async storeTokens(integrationId, tokenData) {
        try {
            const encryptedData = await this.encryptTokenData(tokenData, integrationId);
            
            const { error } = await this.supabase
                .from('user_integrations')
                .update({
                    access_token: encryptedData.encrypted_data,
                    refresh_token: encryptedData.auth_tag, // Store auth_tag in refresh_token field
                    token_expires_at: tokenData.token_expires_at,
                    scope: tokenData.scope,
                    config: {
                        ...tokenData.config,
                        encryption_meta: {
                            iv: encryptedData.iv,
                            version: encryptedData.encryption_version
                        }
                    },
                    updated_at: new Date().toISOString()
                })
                .eq('id', integrationId);

            if (error) {
                throw error;
            }

            // Clear cache for this integration
            this.clearTokenCache(integrationId);

            await this.logSecurityEvent(integrationId, 'token_stored', {
                scope: tokenData.scope,
                expires_at: tokenData.token_expires_at
            });

            return true;
        } catch (error) {
            console.error('Failed to store encrypted tokens:', error);
            await this.logSecurityEvent(integrationId, 'token_store_failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Retrieve and decrypt OAuth tokens
     */
    async retrieveTokens(integrationId) {
        try {
            const { data, error } = await this.supabase
                .from('user_integrations')
                .select('access_token, refresh_token, token_expires_at, scope, config, provider')
                .eq('id', integrationId)
                .single();

            if (error) {
                throw error;
            }

            if (!data.access_token) {
                return null;
            }

            const encryptedData = {
                encrypted_data: data.access_token,
                auth_tag: data.refresh_token,
                iv: data.config?.encryption_meta?.iv,
                encryption_version: data.config?.encryption_meta?.version || '1.0'
            };

            const decryptedData = await this.decryptTokenData(encryptedData, integrationId);

            await this.logSecurityEvent(integrationId, 'token_retrieved', {
                provider: data.provider,
                scope: data.scope
            });

            return {
                access_token: decryptedData.access_token,
                refresh_token: decryptedData.refresh_token,
                token_expires_at: data.token_expires_at,
                scope: data.scope,
                provider: data.provider
            };
        } catch (error) {
            console.error('Failed to retrieve tokens:', error);
            await this.logSecurityEvent(integrationId, 'token_retrieval_failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if token needs refresh
     */
    needsRefresh(tokenExpiresAt) {
        if (!tokenExpiresAt) {
            return true;
        }

        const expiryTime = new Date(tokenExpiresAt).getTime();
        const currentTime = Date.now();
        const bufferTime = this.tokenValidityBuffer * 1000;

        return (expiryTime - currentTime) <= bufferTime;
    }

    /**
     * Refresh OAuth token with provider-specific logic
     */
    async refreshToken(integrationId) {
        try {
            const tokenData = await this.retrieveTokens(integrationId);
            
            if (!tokenData || !tokenData.refresh_token) {
                throw new Error('No refresh token available');
            }

            // Get provider-specific OAuth service
            const OAuthService = this.getOAuthService(tokenData.provider);
            const oauthService = new OAuthService();

            // Perform token refresh
            const newTokenData = await oauthService.refreshAccessToken(
                tokenData.refresh_token
            );

            // Store new encrypted tokens
            await this.storeTokens(integrationId, {
                access_token: newTokenData.access_token,
                refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
                token_expires_at: newTokenData.expires_at,
                scope: tokenData.scope,
                config: tokenData.config
            });

            await this.logSecurityEvent(integrationId, 'token_refreshed', {
                provider: tokenData.provider,
                new_expires_at: newTokenData.expires_at
            });

            return newTokenData;
        } catch (error) {
            console.error('Token refresh failed:', error);
            await this.logSecurityEvent(integrationId, 'token_refresh_failed', {
                error: error.message
            });
            
            // Mark integration as expired
            await this.markIntegrationExpired(integrationId);
            throw error;
        }
    }

    /**
     * Get provider-specific OAuth service
     */
    getOAuthService(provider) {
        switch (provider) {
            case 'google':
                return require('../providers/google/GoogleOAuthProvider');
            case 'microsoft':
                return require('../providers/microsoft/MicrosoftOAuthProvider');
            case 'zoom':
                return require('../providers/zoom/ZoomOAuthProvider');
            default:
                throw new Error(`Unsupported OAuth provider: ${provider}`);
        }
    }

    /**
     * Validate token and auto-refresh if needed
     */
    async validateAndRefreshToken(integrationId) {
        try {
            const tokenData = await this.retrieveTokens(integrationId);
            
            if (!tokenData) {
                throw new Error('No token data found');
            }

            if (this.needsRefresh(tokenData.token_expires_at)) {
                console.log(`Token for integration ${integrationId} needs refresh`);
                return await this.refreshToken(integrationId);
            }

            return tokenData;
        } catch (error) {
            console.error('Token validation failed:', error);
            throw error;
        }
    }

    /**
     * Revoke OAuth tokens securely
     */
    async revokeTokens(integrationId) {
        try {
            const tokenData = await this.retrieveTokens(integrationId);
            
            if (tokenData && tokenData.access_token) {
                // Revoke with provider
                const OAuthService = this.getOAuthService(tokenData.provider);
                const oauthService = new OAuthService();
                
                try {
                    await oauthService.revokeToken(tokenData.access_token);
                } catch (revokeError) {
                    console.warn('Provider token revocation failed:', revokeError);
                    // Continue with local cleanup even if provider revocation fails
                }
            }

            // Clear tokens from database
            const { error } = await this.supabase
                .from('user_integrations')
                .update({
                    access_token: null,
                    refresh_token: null,
                    token_expires_at: null,
                    status: 'disconnected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', integrationId);

            if (error) {
                throw error;
            }

            // Clear cache
            this.clearTokenCache(integrationId);

            await this.logSecurityEvent(integrationId, 'token_revoked', {
                provider: tokenData?.provider
            });

            return true;
        } catch (error) {
            console.error('Token revocation failed:', error);
            await this.logSecurityEvent(integrationId, 'token_revocation_failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Mark integration as expired
     */
    async markIntegrationExpired(integrationId) {
        try {
            const { error } = await this.supabase
                .from('user_integrations')
                .update({
                    status: 'expired',
                    last_error: 'OAuth token expired and refresh failed',
                    error_count: this.supabase.raw('error_count + 1'),
                    updated_at: new Date().toISOString()
                })
                .eq('id', integrationId);

            if (error) {
                throw error;
            }

            await this.logSecurityEvent(integrationId, 'integration_expired', {});
        } catch (error) {
            console.error('Failed to mark integration as expired:', error);
        }
    }

    /**
     * Clear token cache for integration
     */
    clearTokenCache(integrationId) {
        for (const [key] of this.tokenCache) {
            if (key.startsWith(integrationId)) {
                this.tokenCache.delete(key);
            }
        }
    }

    /**
     * Log security events
     */
    async logSecurityEvent(integrationId, eventType, metadata = {}) {
        try {
            const { error } = await this.supabase
                .from('security_audit_logs')
                .insert({
                    integration_id: integrationId,
                    event_type: eventType,
                    metadata,
                    timestamp: new Date().toISOString(),
                    source: 'oauth_token_security'
                });

            if (error && !error.message.includes('does not exist')) {
                console.warn('Failed to log security event:', error);
            }
        } catch (error) {
            console.warn('Security event logging failed:', error);
        }
    }

    /**
     * Cleanup expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.tokenCache) {
            if ((now - value.timestamp) > this.cacheTimeout) {
                this.tokenCache.delete(key);
            }
        }
    }

    /**
     * Get token statistics and health metrics
     */
    async getTokenHealthMetrics() {
        try {
            const { data, error } = await this.supabase
                .from('user_integrations')
                .select('id, provider, status, token_expires_at, updated_at, error_count')
                .not('access_token', 'is', null);

            if (error) {
                throw error;
            }

            const metrics = {
                total_tokens: data.length,
                by_provider: {},
                by_status: {},
                expiring_soon: 0,
                expired: 0,
                healthy: 0
            };

            const now = Date.now();
            const soonThreshold = 24 * 60 * 60 * 1000; // 24 hours

            data.forEach(integration => {
                // Provider stats
                metrics.by_provider[integration.provider] = 
                    (metrics.by_provider[integration.provider] || 0) + 1;

                // Status stats
                metrics.by_status[integration.status] = 
                    (metrics.by_status[integration.status] || 0) + 1;

                // Expiry stats
                if (integration.token_expires_at) {
                    const expiryTime = new Date(integration.token_expires_at).getTime();
                    if (expiryTime < now) {
                        metrics.expired++;
                    } else if ((expiryTime - now) < soonThreshold) {
                        metrics.expiring_soon++;
                    } else {
                        metrics.healthy++;
                    }
                }
            });

            return metrics;
        } catch (error) {
            console.error('Failed to get token health metrics:', error);
            throw error;
        }
    }

    /**
     * Batch refresh expiring tokens
     */
    async refreshExpiringTokens() {
        try {
            const { data, error } = await this.supabase
                .from('user_integrations')
                .select('id, provider, token_expires_at')
                .not('access_token', 'is', null)
                .eq('status', 'connected');

            if (error) {
                throw error;
            }

            const now = Date.now();
            const refreshThreshold = this.tokenValidityBuffer * 1000;
            const expiring = data.filter(integration => {
                if (!integration.token_expires_at) return false;
                const expiryTime = new Date(integration.token_expires_at).getTime();
                return (expiryTime - now) <= refreshThreshold;
            });

            console.log(`Found ${expiring.length} tokens needing refresh`);

            const results = await Promise.allSettled(
                expiring.map(integration => this.refreshToken(integration.id))
            );

            const successes = results.filter(r => r.status === 'fulfilled').length;
            const failures = results.filter(r => r.status === 'rejected').length;

            return { total: expiring.length, successes, failures };
        } catch (error) {
            console.error('Batch token refresh failed:', error);
            throw error;
        }
    }
}

module.exports = OAuthTokenSecurityService; 