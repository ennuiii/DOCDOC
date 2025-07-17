/**
 * Microsoft OAuth Provider
 * Handles Microsoft Graph and Teams OAuth authentication
 * Enhanced for multi-tenant support with OnlineMeetings permissions
 */

import { OAuthProvider } from '../../types/OAuthProvider.js';
import AuditLogger from '../../services/AuditLogger.js';
import RateLimitManager from '../../services/RateLimitManager.js';

class MicrosoftOAuthProvider extends OAuthProvider {
    constructor() {
        super();
        this.providerId = 'microsoft';
        this.providerName = 'Microsoft';
        this.baseUrl = 'https://login.microsoftonline.com';
        this.graphUrl = 'https://graph.microsoft.com/v1.0';
        this.betaGraphUrl = 'https://graph.microsoft.com/beta';
        
        // Rate limiting for Microsoft Graph API
        this.rateLimiter = new RateLimitManager({
            requests: 2000,
            window: 300000, // 5 minutes
            burstLimit: 100
        });
        
        this.auditLogger = new AuditLogger('MicrosoftOAuth');
        
        // Required scopes for calendar and Teams integration
        // Using simplified scope format for delegated permissions
        this.scopes = [
            'openid',
            'profile',
            'email',
            'offline_access',
            'User.Read',
            'Calendars.ReadWrite',
            'Calendars.Read.Shared',
            'OnlineMeetings.ReadWrite',
            'OnlineMeetings.Read'
        ];

        // Cache for user tenant information
        this.tenantCache = new Map();
        this.cacheExpiry = 3600000; // 1 hour
    }

    /**
     * Generate authorization URL for Microsoft OAuth flow
     * Enhanced for multi-tenant support
     * @param {string} state - CSRF protection state parameter
     * @param {string} redirectUri - Callback URL
     * @param {Object} options - Additional options
     * @returns {string} Authorization URL
     */
    getAuthorizationUrl(state, redirectUri, options = {}) {
        try {
            const {
                tenant = 'common', // 'common' for multi-tenant
                prompt = 'consent', // Force consent for multi-tenant apps
                responseMode = 'query',
                additionalScopes = [],
                domain_hint = null // For better user experience
            } = options;

            const allScopes = [...this.scopes, ...additionalScopes];
            
            const params = new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID,
                response_type: 'code',
                redirect_uri: redirectUri,
                response_mode: responseMode,
                scope: allScopes.join(' '),
                state: state,
                prompt: prompt
            });

            // Add domain hint if provided for better UX
            if (domain_hint) {
                params.append('domain_hint', domain_hint);
            }

            const authUrl = `${this.baseUrl}/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
            
            this.auditLogger.log('info', 'Authorization URL generated for multi-tenant app', {
                tenant,
                scopes: allScopes.length,
                prompt,
                domain_hint,
                state: state.substring(0, 8) + '...'
            });

            return authUrl;
        } catch (error) {
            this.auditLogger.log('error', 'Failed to generate authorization URL', { error: error.message });
            throw new Error(`Failed to generate Microsoft authorization URL: ${error.message}`);
        }
    }

    /**
     * Exchange authorization code for access token
     * @param {string} code - Authorization code from callback
     * @param {string} redirectUri - Same redirect URI used in authorization
     * @param {Object} options - Additional options
     * @returns {Object} Token response with access and refresh tokens
     */
    async exchangeCodeForToken(code, redirectUri, options = {}) {
        try {
            await this.rateLimiter.checkRateLimit('microsoft', null, 'token_exchange');
            
            const { tenant = 'common' } = options;
            
            const tokenEndpoint = `${this.baseUrl}/${tenant}/oauth2/v2.0/token`;
            
            const params = new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET,
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            });

            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: params.toString()
            });

            const tokenData = await response.json();

            if (!response.ok) {
                throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
            }

            // Validate required token properties
            if (!tokenData.access_token) {
                throw new Error('Invalid token response: missing access_token');
            }

            const result = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in || 3600,
                token_type: tokenData.token_type || 'Bearer',
                scope: tokenData.scope,
                id_token: tokenData.id_token,
                expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000)
            };

            this.auditLogger.log('info', 'Token exchange successful', {
                expires_in: result.expires_in,
                scope: result.scope,
                has_refresh_token: !!result.refresh_token
            });

            return result;
        } catch (error) {
            this.auditLogger.log('error', 'Token exchange failed', { 
                error: error.message,
                code: code.substring(0, 10) + '...'
            });
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken - Refresh token
     * @param {Object} options - Additional options
     * @returns {Object} New token response
     */
    async refreshAccessToken(refreshToken, options = {}) {
        try {
            await this.rateLimiter.checkRateLimit('microsoft', null, 'token_refresh');
            
            const { tenant = 'common' } = options;
            
            const tokenEndpoint = `${this.baseUrl}/${tenant}/oauth2/v2.0/token`;
            
            const params = new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: params.toString()
            });

            const tokenData = await response.json();

            if (!response.ok) {
                throw new Error(`Token refresh failed: ${tokenData.error_description || tokenData.error}`);
            }

            const result = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
                expires_in: tokenData.expires_in || 3600,
                token_type: tokenData.token_type || 'Bearer',
                scope: tokenData.scope,
                expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000)
            };

            this.auditLogger.log('info', 'Token refresh successful', {
                expires_in: result.expires_in,
                scope: result.scope
            });

            return result;
        } catch (error) {
            this.auditLogger.log('error', 'Token refresh failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Revoke access or refresh token
     * @param {string} token - Token to revoke
     * @param {string} tokenType - Type of token ('access_token' or 'refresh_token')
     * @param {Object} options - Additional options
     */
    async revokeToken(token, tokenType = 'access_token', options = {}) {
        try {
            const { tenant = 'common' } = options;
            
            // Microsoft doesn't have a standard revoke endpoint
            // We can invalidate by calling logout endpoint
            const logoutUrl = `${this.baseUrl}/${tenant}/oauth2/v2.0/logout`;
            
            // For now, just log the revocation
            this.auditLogger.log('info', 'Token revoked', {
                token_type: tokenType,
                token_hash: token.substring(0, 10) + '...'
            });

            // In a production environment, you might want to:
            // 1. Store revoked tokens in a blacklist
            // 2. Call Microsoft's logout endpoint if available
            // 3. Notify your application to invalidate cached permissions
            
            return { success: true, revoked_at: new Date().toISOString() };
        } catch (error) {
            this.auditLogger.log('error', 'Token revocation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Get user profile information
     * @param {string} accessToken - Valid access token
     * @returns {Object} User profile data
     */
    async getUserProfile(accessToken) {
        try {
            await this.rateLimiter.checkRateLimit('microsoft', null, 'api_request');
            
            const response = await fetch(`${this.graphUrl}/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                await this.handleApiError(response, 'getUserProfile');
            }

            const userData = await response.json();

            const result = {
                id: userData.id,
                email: userData.mail || userData.userPrincipalName,
                name: userData.displayName,
                first_name: userData.givenName,
                last_name: userData.surname,
                picture: null, // Will be fetched separately if needed
                verified_email: true,
                locale: userData.preferredLanguage,
                timezone: userData.mailboxSettings?.timeZone,
                raw: userData
            };

            this.auditLogger.log('info', 'User profile retrieved', {
                user_id: result.id,
                email: result.email
            });

            return result;
        } catch (error) {
            this.auditLogger.log('error', 'Failed to get user profile', { error: error.message });
            throw error;
        }
    }

    /**
     * Get user's profile photo
     * @param {string} accessToken - Valid access token
     * @param {string} size - Photo size ('48x48', '64x64', '96x96', '120x120', '240x240', '360x360', '432x432', '504x504', '648x648')
     * @returns {string|null} Base64 encoded photo or null if not available
     */
    async getUserPhoto(accessToken, size = '96x96') {
        try {
            await this.rateLimiter.checkRateLimit('microsoft', null, 'api_request');
            
            const response = await fetch(`${this.graphUrl}/me/photos/${size}/$value`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.status === 404) {
                return null; // No photo available
            }

            if (!response.ok) {
                await this.handleApiError(response, 'getUserPhoto');
            }

            const photoBuffer = await response.arrayBuffer();
            const base64Photo = Buffer.from(photoBuffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';

            return `data:${mimeType};base64,${base64Photo}`;
        } catch (error) {
            this.auditLogger.log('warn', 'Failed to get user photo', { 
                error: error.message,
                size
            });
            return null; // Photo is optional
        }
    }

    /**
     * Validate access token
     * @param {string} accessToken - Token to validate
     * @returns {Object} Token validation result
     */
    async validateToken(accessToken) {
        try {
            await this.rateLimiter.checkRateLimit('microsoft', null, 'token_validation');
            
            const response = await fetch(`${this.graphUrl}/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            const isValid = response.ok;
            const result = {
                valid: isValid,
                expires_at: null, // Microsoft tokens don't include expiry in the token itself
                user_id: null,
                scopes: []
            };

            if (isValid) {
                const userData = await response.json();
                result.user_id = userData.id;
                // Scopes would need to be retrieved from token introspection if available
            }

            return result;
        } catch (error) {
            this.auditLogger.log('error', 'Token validation failed', { error: error.message });
            return { valid: false, error: error.message };
        }
    }

    /**
     * Get API client for making Graph API requests
     * @param {string} accessToken - Valid access token
     * @param {boolean} useBeta - Use beta endpoint
     * @returns {Object} API client
     */
    getApiClient(accessToken, useBeta = false) {
        const baseUrl = useBeta ? this.betaGraphUrl : this.graphUrl;
        
        return {
            baseUrl,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            rateLimiter: this.rateLimiter,
            auditLogger: this.auditLogger
        };
    }

    /**
     * Handle API errors with enhanced multi-tenant support
     * @param {Response} response - Fetch response
     * @param {string} operation - Operation name
     */
    async handleApiError(response, operation) {
        const errorData = await response.json().catch(() => ({}));
        
        let errorMessage = `Microsoft Graph API error in ${operation}: ${response.status} ${response.statusText}`;
        let suggestions = [];

        // Enhanced error handling for multi-tenant scenarios
        if (operation.includes('OnlineMeetings') || operation.includes('Teams')) {
            if (response.status === 403) {
                errorMessage = `OnlineMeetings permission denied in ${operation}. This is likely a multi-tenant consent issue.`;
                suggestions = [
                    'The OnlineMeetings.ReadWrite permission requires admin consent in the user\'s tenant',
                    'Ask the tenant administrator to grant consent for OnlineMeetings permissions',
                    'Alternatively, configure your Azure app as single-tenant if all users are from your organization'
                ];
            } else if (response.status === 401) {
                errorMessage = `Authentication failed in ${operation}. Token may not include required scopes.`;
                suggestions = [
                    'Ensure the access token includes OnlineMeetings.ReadWrite scope',
                    'Reconnect the Microsoft integration to refresh permissions',
                    'Verify that admin consent has been granted for OnlineMeetings permissions'
                ];
            } else if (response.status === 400 && errorData.error?.code === 'Forbidden') {
                errorMessage = `OnlineMeetings API access forbidden. Multi-tenant app may need additional configuration.`;
                suggestions = [
                    'Check if your Azure app registration is properly configured for multi-tenant access',
                    'Verify that OnlineMeetings.ReadWrite is configured as a delegated permission (not application permission)',
                    'Ensure admin consent has been provided in the target tenant'
                ];
            }
        }
        
        const error = new Error(errorMessage);
        error.status = response.status;
        error.statusText = response.statusText;
        error.errorData = errorData;
        error.suggestions = suggestions;
        error.isMultiTenantIssue = suggestions.length > 0;

        this.auditLogger.log('error', 'API error with multi-tenant analysis', {
            operation,
            status: response.status,
            error: errorData,
            suggestions,
            isMultiTenantIssue: error.isMultiTenantIssue
        });

        throw error;
    }

    /**
     * Get required scopes for specific features
     * @param {Array} features - List of features ('calendar', 'meetings', 'profile')
     * @returns {Array} Required scopes
     */
    static getRequiredScopes(features = []) {
        const scopeMap = {
            profile: [
                'openid',
                'profile',
                'email',
                'https://graph.microsoft.com/User.Read'
            ],
            calendar: [
                'https://graph.microsoft.com/Calendars.ReadWrite',
                'https://graph.microsoft.com/Calendars.Read.Shared'
            ],
            meetings: [
                'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
                'https://graph.microsoft.com/OnlineMeetings.Read'
            ]
        };

        const requiredScopes = new Set(['offline_access']); // Always include for refresh tokens

        features.forEach(feature => {
            if (scopeMap[feature]) {
                scopeMap[feature].forEach(scope => requiredScopes.add(scope));
            }
        });

        return Array.from(requiredScopes);
    }

    /**
     * Get user's tenant information
     * Essential for multi-tenant OnlineMeetings permission handling
     * @param {string} accessToken - Valid access token
     * @returns {Object} Tenant information
     */
    async getUserTenantInfo(accessToken) {
        try {
            // Check cache first
            const cacheKey = `tenant_${accessToken.substring(0, 20)}`;
            const cached = this.tenantCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                return cached.data;
            }

            await this.rateLimiter.checkRateLimit('microsoft', null, 'api_request');
            
            const response = await fetch(`${this.graphUrl}/organization`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                // Fallback: extract tenant from token claims if possible
                return await this.extractTenantFromToken(accessToken);
            }

            const orgData = await response.json();
            const tenantInfo = {
                tenantId: orgData.value[0]?.id,
                tenantDisplayName: orgData.value[0]?.displayName,
                verifiedDomains: orgData.value[0]?.verifiedDomains || []
            };

            // Cache the result
            this.tenantCache.set(cacheKey, {
                data: tenantInfo,
                timestamp: Date.now()
            });

            this.auditLogger.log('info', 'Tenant information retrieved', {
                tenantId: tenantInfo.tenantId,
                tenantName: tenantInfo.tenantDisplayName
            });

            return tenantInfo;
        } catch (error) {
            this.auditLogger.log('warn', 'Failed to get tenant info, using fallback', { 
                error: error.message 
            });
            return await this.extractTenantFromToken(accessToken);
        }
    }

    /**
     * Extract tenant ID from JWT token as fallback
     * @param {string} accessToken - JWT access token
     * @returns {Object} Basic tenant info
     */
    async extractTenantFromToken(accessToken) {
        try {
            // Decode JWT token (basic decode, not verification)
            const payload = JSON.parse(
                Buffer.from(accessToken.split('.')[1], 'base64').toString()
            );

            return {
                tenantId: payload.tid || 'unknown',
                tenantDisplayName: payload.tenant_name || 'Unknown Tenant',
                verifiedDomains: []
            };
        } catch (error) {
            this.auditLogger.log('warn', 'Failed to extract tenant from token', { 
                error: error.message 
            });
            return {
                tenantId: 'unknown',
                tenantDisplayName: 'Unknown Tenant',
                verifiedDomains: []
            };
        }
    }

    /**
     * Validate OnlineMeetings permissions for multi-tenant scenario
     * @param {string} accessToken - Access token to validate
     * @returns {Object} Validation result with recommendations
     */
    async validateOnlineMeetingsPermissions(accessToken) {
        try {
            this.auditLogger.log('info', 'Validating OnlineMeetings permissions for multi-tenant app');

            // Get tenant information
            const tenantInfo = await this.getUserTenantInfo(accessToken);

            // Test basic Graph API access
            const userResponse = await fetch(`${this.graphUrl}/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!userResponse.ok) {
                throw new Error('Basic Graph API access failed');
            }

            // Test OnlineMeetings specific endpoint
            const meetingsTestResponse = await fetch(`${this.graphUrl}/me/onlineMeetings?$top=1`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            const result = {
                tenantInfo,
                basicAccess: userResponse.ok,
                onlineMeetingsAccess: meetingsTestResponse.ok,
                status: meetingsTestResponse.status,
                canCreateMeetings: false,
                recommendations: []
            };

            if (meetingsTestResponse.ok) {
                result.canCreateMeetings = true;
                this.auditLogger.log('info', 'OnlineMeetings permissions validated successfully');
            } else {
                const errorData = await meetingsTestResponse.json().catch(() => ({}));
                result.error = errorData;

                // Provide specific recommendations based on error
                if (meetingsTestResponse.status === 403) {
                    result.recommendations.push(
                        'OnlineMeetings.ReadWrite permission requires admin consent in the target tenant'
                    );
                    result.recommendations.push(
                        'Ask the tenant administrator to grant consent for OnlineMeetings permissions'
                    );
                } else if (meetingsTestResponse.status === 401) {
                    result.recommendations.push(
                        'Authentication issue - token may not include OnlineMeetings scope'
                    );
                    result.recommendations.push(
                        'Reconnect the Microsoft integration to ensure proper scope consent'
                    );
                }

                this.auditLogger.log('warn', 'OnlineMeetings permissions validation failed', {
                    status: meetingsTestResponse.status,
                    error: errorData,
                    tenantId: tenantInfo.tenantId
                });
            }

            return result;
        } catch (error) {
            this.auditLogger.log('error', 'OnlineMeetings permission validation error', { 
                error: error.message 
            });
            throw error;
        }
    }
}

export default MicrosoftOAuthProvider; 