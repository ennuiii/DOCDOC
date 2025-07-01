/**
 * @fileoverview Base OAuth Provider Interface
 * Abstract interface for all OAuth integration providers (Google, Microsoft, Zoom, CalDAV)
 * Defines the standard methods that all provider implementations must support
 */

/**
 * @typedef {Object} OAuthCredentials
 * @property {string} accessToken - The OAuth access token
 * @property {string} [refreshToken] - The OAuth refresh token (if applicable)
 * @property {number} [expiresAt] - Token expiration timestamp (ms since epoch)
 * @property {string[]} [scopes] - Granted OAuth scopes
 * @property {Object} [metadata] - Provider-specific metadata
 */

/**
 * @typedef {Object} UserInfo
 * @property {string} id - User's unique identifier from the provider
 * @property {string} email - User's email address
 * @property {string} name - User's display name
 * @property {string} [avatar] - URL to user's profile picture
 * @property {Object} [profile] - Additional profile information
 */

/**
 * @typedef {Object} AuthenticationResult
 * @property {boolean} success - Whether authentication was successful
 * @property {OAuthCredentials} [credentials] - OAuth credentials (if successful)
 * @property {UserInfo} [user] - User information (if successful)
 * @property {string} [error] - Error message (if failed)
 * @property {string} [redirectUrl] - URL to redirect user for OAuth flow
 */

/**
 * @typedef {Object} HealthStatus
 * @property {boolean} healthy - Whether the provider is functioning correctly
 * @property {number} responseTime - Response time in milliseconds
 * @property {string} [error] - Error message if unhealthy
 * @property {Date} lastChecked - When the health check was performed
 */

/**
 * Abstract base class for OAuth providers
 * All integration providers must extend this class and implement its abstract methods
 */
export class OAuthProvider {
  /**
   * @param {string} providerId - Unique identifier for this provider (e.g., 'google', 'microsoft')
   * @param {Object} config - Provider-specific configuration
   */
  constructor(providerId, config) {
    if (new.target === OAuthProvider) {
      throw new Error('OAuthProvider is an abstract class and cannot be instantiated directly');
    }
    
    this.providerId = providerId;
    this.config = config;
  }

  /**
   * Initiate OAuth authentication flow
   * @param {string} userId - PharmaDOC user ID
   * @param {string[]} [scopes] - Requested OAuth scopes
   * @param {string} [redirectUri] - OAuth callback URL
   * @returns {Promise<AuthenticationResult>}
   * @abstract
   */
  async authenticate(userId, scopes = [], redirectUri = null) {
    throw new Error('authenticate() method must be implemented by subclass');
  }

  /**
   * Handle OAuth callback and complete authentication
   * @param {string} code - Authorization code from OAuth callback
   * @param {string} state - State parameter for CSRF protection
   * @param {string} userId - PharmaDOC user ID
   * @returns {Promise<AuthenticationResult>}
   * @abstract
   */
  async handleCallback(code, state, userId) {
    throw new Error('handleCallback() method must be implemented by subclass');
  }

  /**
   * Refresh expired access token
   * @param {string} userId - PharmaDOC user ID
   * @param {string} refreshToken - Current refresh token
   * @returns {Promise<OAuthCredentials>}
   * @abstract
   */
  async refreshToken(userId, refreshToken) {
    throw new Error('refreshToken() method must be implemented by subclass');
  }

  /**
   * Revoke OAuth tokens and disconnect integration
   * @param {string} userId - PharmaDOC user ID
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<boolean>}
   * @abstract
   */
  async revokeToken(userId, accessToken) {
    throw new Error('revokeToken() method must be implemented by subclass');
  }

  /**
   * Get user information from the provider
   * @param {string} accessToken - Valid access token
   * @returns {Promise<UserInfo>}
   * @abstract
   */
  async getUser(accessToken) {
    throw new Error('getUser() method must be implemented by subclass');
  }

  /**
   * Check if the provider is healthy and responsive
   * @returns {Promise<HealthStatus>}
   * @abstract
   */
  async healthCheck() {
    throw new Error('healthCheck() method must be implemented by subclass');
  }

  /**
   * Validate OAuth scopes for this provider
   * @param {string[]} scopes - Scopes to validate
   * @returns {boolean}
   * @abstract
   */
  validateScopes(scopes) {
    throw new Error('validateScopes() method must be implemented by subclass');
  }

  /**
   * Get the OAuth authorization URL for this provider
   * @param {string} state - State parameter for CSRF protection
   * @param {string[]} scopes - Requested OAuth scopes
   * @param {string} redirectUri - OAuth callback URL
   * @returns {string}
   * @abstract
   */
  getAuthorizationUrl(state, scopes, redirectUri) {
    throw new Error('getAuthorizationUrl() method must be implemented by subclass');
  }

  /**
   * Check if stored credentials are still valid
   * @param {OAuthCredentials} credentials - Credentials to validate
   * @returns {Promise<boolean>}
   */
  async isTokenValid(credentials) {
    if (!credentials || !credentials.accessToken) {
      return false;
    }

    // Check expiration if available
    if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
      return false;
    }

    // Subclasses can override for provider-specific validation
    return true;
  }

  /**
   * Get human-readable provider name
   * @returns {string}
   */
  get displayName() {
    return this.providerId.charAt(0).toUpperCase() + this.providerId.slice(1);
  }

  /**
   * Get supported OAuth scopes for this provider
   * @returns {string[]}
   * @abstract
   */
  getSupportedScopes() {
    throw new Error('getSupportedScopes() method must be implemented by subclass');
  }
}

/**
 * Provider registry for managing all OAuth providers
 */
export class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  /**
   * Register a new OAuth provider
   * @param {OAuthProvider} provider - Provider instance to register
   */
  register(provider) {
    if (!(provider instanceof OAuthProvider)) {
      throw new Error('Provider must extend OAuthProvider class');
    }
    
    this.providers.set(provider.providerId, provider);
  }

  /**
   * Get a registered provider by ID
   * @param {string} providerId - Provider identifier
   * @returns {OAuthProvider|null}
   */
  get(providerId) {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all registered providers
   * @returns {OAuthProvider[]}
   */
  getAll() {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a provider is registered
   * @param {string} providerId - Provider identifier
   * @returns {boolean}
   */
  has(providerId) {
    return this.providers.has(providerId);
  }

  /**
   * Get all provider IDs
   * @returns {string[]}
   */
  getProviderIds() {
    return Array.from(this.providers.keys());
  }
}

// Global provider registry instance
export const providerRegistry = new ProviderRegistry(); 