/**
 * Integration Permission Management Service
 * 
 * Provides comprehensive permission management including:
 * - Granular permission system for integration features
 * - Role-based access control (RBAC) for integrations
 * - OAuth scope validation and management
 * - Permission inheritance and delegation
 * - Dynamic permission adjustment
 * - Integration-specific permission controls
 * - Permission audit and compliance reporting
 * - Temporary permission grants and revocation
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

class IntegrationPermissionService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Permission hierarchy and definitions
        this.permissionDefinitions = {
            // Calendar permissions
            'calendar.read': {
                description: 'Read calendar events and schedules',
                category: 'calendar',
                risk_level: 'low',
                requires_consent: true,
                data_types: ['calendar_events', 'scheduling_data']
            },
            'calendar.write': {
                description: 'Create and modify calendar events',
                category: 'calendar',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['calendar_events', 'scheduling_data'],
                depends_on: ['calendar.read']
            },
            'calendar.delete': {
                description: 'Delete calendar events',
                category: 'calendar',
                risk_level: 'high',
                requires_consent: true,
                data_types: ['calendar_events'],
                depends_on: ['calendar.read', 'calendar.write']
            },
            'calendar.sync': {
                description: 'Synchronize calendar data across providers',
                category: 'calendar',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['calendar_events', 'sync_metadata'],
                depends_on: ['calendar.read']
            },

            // Meeting permissions
            'meeting.create': {
                description: 'Create video meetings and invitations',
                category: 'meeting',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['meeting_data', 'participant_info']
            },
            'meeting.manage': {
                description: 'Manage meeting settings and participants',
                category: 'meeting',
                risk_level: 'high',
                requires_consent: true,
                data_types: ['meeting_data', 'participant_info', 'meeting_settings'],
                depends_on: ['meeting.create']
            },
            'meeting.record': {
                description: 'Record meetings and access recordings',
                category: 'meeting',
                risk_level: 'high',
                requires_consent: true,
                data_types: ['meeting_recordings', 'audio_video_data'],
                depends_on: ['meeting.create']
            },

            // Contact permissions
            'contacts.read': {
                description: 'Read contact information',
                category: 'contacts',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['contact_info', 'email_addresses']
            },
            'contacts.write': {
                description: 'Create and modify contacts',
                category: 'contacts',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['contact_info', 'email_addresses'],
                depends_on: ['contacts.read']
            },

            // Integration management permissions
            'integration.connect': {
                description: 'Connect new integration providers',
                category: 'integration',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['oauth_tokens', 'provider_credentials']
            },
            'integration.disconnect': {
                description: 'Disconnect integration providers',
                category: 'integration',
                risk_level: 'low',
                requires_consent: false,
                data_types: ['integration_status']
            },
            'integration.configure': {
                description: 'Configure integration settings',
                category: 'integration',
                risk_level: 'medium',
                requires_consent: true,
                data_types: ['integration_settings', 'sync_preferences'],
                depends_on: ['integration.connect']
            },

            // Administrative permissions
            'admin.users': {
                description: 'Manage user accounts and permissions',
                category: 'admin',
                risk_level: 'critical',
                requires_consent: false,
                data_types: ['user_data', 'permission_data'],
                admin_only: true
            },
            'admin.integrations': {
                description: 'Manage system-wide integration settings',
                category: 'admin',
                risk_level: 'critical',
                requires_consent: false,
                data_types: ['system_settings', 'provider_configs'],
                admin_only: true
            },
            'admin.audit': {
                description: 'Access audit logs and compliance reports',
                category: 'admin',
                risk_level: 'high',
                requires_consent: false,
                data_types: ['audit_logs', 'compliance_data'],
                admin_only: true
            }
        };

        // Role definitions with permission sets
        this.roleDefinitions = {
            'user': {
                description: 'Standard user with basic integration access',
                default_permissions: [
                    'calendar.read', 'calendar.write', 'calendar.sync',
                    'meeting.create', 'contacts.read', 'contacts.write',
                    'integration.connect', 'integration.disconnect', 'integration.configure'
                ],
                max_integrations: 5,
                features: ['basic_sync', 'meeting_scheduling']
            },
            'premium_user': {
                description: 'Premium user with advanced features',
                default_permissions: [
                    'calendar.read', 'calendar.write', 'calendar.delete', 'calendar.sync',
                    'meeting.create', 'meeting.manage', 'meeting.record',
                    'contacts.read', 'contacts.write',
                    'integration.connect', 'integration.disconnect', 'integration.configure'
                ],
                max_integrations: 15,
                features: ['advanced_sync', 'meeting_recording', 'bulk_operations']
            },
            'admin': {
                description: 'Administrator with full system access',
                default_permissions: ['*'], // All permissions
                max_integrations: -1, // Unlimited
                features: ['admin_panel', 'user_management', 'system_config']
            },
            'readonly': {
                description: 'Read-only access for auditing',
                default_permissions: [
                    'calendar.read', 'contacts.read'
                ],
                max_integrations: 0,
                features: ['read_only_access']
            }
        };

        // OAuth scope mappings for different providers
        this.scopeMappings = {
            google: {
                'https://www.googleapis.com/auth/calendar': ['calendar.read', 'calendar.write', 'calendar.delete'],
                'https://www.googleapis.com/auth/calendar.readonly': ['calendar.read'],
                'https://www.googleapis.com/auth/contacts': ['contacts.read', 'contacts.write'],
                'https://www.googleapis.com/auth/contacts.readonly': ['contacts.read']
            },
            microsoft: {
                'https://graph.microsoft.com/Calendars.ReadWrite': ['calendar.read', 'calendar.write', 'calendar.delete'],
                'https://graph.microsoft.com/Calendars.Read': ['calendar.read'],
                'https://graph.microsoft.com/Contacts.ReadWrite': ['contacts.read', 'contacts.write'],
                'https://graph.microsoft.com/Contacts.Read': ['contacts.read'],
                'https://graph.microsoft.com/OnlineMeetings.ReadWrite': ['meeting.create', 'meeting.manage']
            },
            zoom: {
                'meeting:write': ['meeting.create', 'meeting.manage'],
                'meeting:read': ['meeting.create'],
                'recording:read': ['meeting.record'],
                'user:read': ['contacts.read']
            }
        };

        // Initialize permission cache
        this.permissionCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes

        console.log('Integration Permission Service initialized');
    }

    /**
     * Check if user has specific permission
     */
    async hasPermission(userId, permission, context = {}) {
        try {
            // Check cache first
            const cacheKey = `${userId}:${permission}:${JSON.stringify(context)}`;
            const cached = this.permissionCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                return cached.result;
            }

            // Get user permissions
            const userPermissions = await this.getUserPermissions(userId);
            
            // Check direct permission
            if (userPermissions.permissions.includes(permission) || userPermissions.permissions.includes('*')) {
                const result = { allowed: true, reason: 'Direct permission' };
                this.permissionCache.set(cacheKey, { result, timestamp: Date.now() });
                return result;
            }

            // Check role-based permissions
            const roleCheck = await this.checkRolePermissions(userPermissions.role, permission);
            if (roleCheck.allowed) {
                this.permissionCache.set(cacheKey, { result: roleCheck, timestamp: Date.now() });
                return roleCheck;
            }

            // Check temporary permissions
            const tempCheck = await this.checkTemporaryPermissions(userId, permission);
            if (tempCheck.allowed) {
                this.permissionCache.set(cacheKey, { result: tempCheck, timestamp: Date.now() });
                return tempCheck;
            }

            // Check delegation
            const delegationCheck = await this.checkDelegatedPermissions(userId, permission, context);
            if (delegationCheck.allowed) {
                this.permissionCache.set(cacheKey, { result: delegationCheck, timestamp: Date.now() });
                return delegationCheck;
            }

            const result = { allowed: false, reason: 'Permission denied' };
            this.permissionCache.set(cacheKey, { result, timestamp: Date.now() });
            return result;

        } catch (error) {
            console.error('Permission check error:', error);
            return { allowed: false, reason: 'Permission check failed', error: error.message };
        }
    }

    /**
     * Get user permissions and role
     */
    async getUserPermissions(userId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select(`
                    id, role, 
                    user_permissions (permission, granted_at, expires_at, granted_by),
                    user_roles (role_name, granted_at, expires_at)
                `)
                .eq('id', userId)
                .single();

            if (error) {
                throw error;
            }

            // Compile all permissions
            const permissions = new Set();
            const role = data.role || 'user';

            // Add role-based permissions
            const rolePerms = this.roleDefinitions[role]?.default_permissions || [];
            rolePerms.forEach(perm => permissions.add(perm));

            // Add explicit user permissions
            if (data.user_permissions) {
                data.user_permissions.forEach(perm => {
                    if (!perm.expires_at || new Date(perm.expires_at) > new Date()) {
                        permissions.add(perm.permission);
                    }
                });
            }

            // Add additional roles
            if (data.user_roles) {
                data.user_roles.forEach(userRole => {
                    if (!userRole.expires_at || new Date(userRole.expires_at) > new Date()) {
                        const rolePerms = this.roleDefinitions[userRole.role_name]?.default_permissions || [];
                        rolePerms.forEach(perm => permissions.add(perm));
                    }
                });
            }

            return {
                userId,
                role,
                permissions: Array.from(permissions),
                additional_roles: data.user_roles || []
            };

        } catch (error) {
            console.error('Failed to get user permissions:', error);
            return {
                userId,
                role: 'user',
                permissions: this.roleDefinitions.user.default_permissions,
                additional_roles: []
            };
        }
    }

    /**
     * Check role-based permissions
     */
    async checkRolePermissions(role, permission) {
        const roleDefinition = this.roleDefinitions[role];
        if (!roleDefinition) {
            return { allowed: false, reason: 'Unknown role' };
        }

        if (roleDefinition.default_permissions.includes('*') || 
            roleDefinition.default_permissions.includes(permission)) {
            return { allowed: true, reason: `Role-based permission (${role})` };
        }

        return { allowed: false, reason: 'Role does not include permission' };
    }

    /**
     * Check temporary permissions
     */
    async checkTemporaryPermissions(userId, permission) {
        try {
            const { data, error } = await this.supabase
                .from('temporary_permissions')
                .select('*')
                .eq('user_id', userId)
                .eq('permission', permission)
                .gt('expires_at', new Date().toISOString())
                .eq('active', true)
                .order('expires_at', { ascending: false })
                .limit(1);

            if (error) {
                throw error;
            }

            if (data && data.length > 0) {
                return { 
                    allowed: true, 
                    reason: 'Temporary permission',
                    expires_at: data[0].expires_at,
                    granted_by: data[0].granted_by
                };
            }

            return { allowed: false, reason: 'No valid temporary permission' };

        } catch (error) {
            console.error('Temporary permission check error:', error);
            return { allowed: false, reason: 'Temporary permission check failed' };
        }
    }

    /**
     * Check delegated permissions
     */
    async checkDelegatedPermissions(userId, permission, context) {
        try {
            // Check if permission can be delegated
            const permissionDef = this.permissionDefinitions[permission];
            if (!permissionDef || permissionDef.admin_only) {
                return { allowed: false, reason: 'Permission cannot be delegated' };
            }

            const { data, error } = await this.supabase
                .from('permission_delegations')
                .select('*')
                .eq('delegated_to', userId)
                .eq('permission', permission)
                .gt('expires_at', new Date().toISOString())
                .eq('active', true);

            if (error) {
                throw error;
            }

            if (data && data.length > 0) {
                // Check delegation conditions
                for (const delegation of data) {
                    if (this.matchesDelegationContext(delegation.conditions, context)) {
                        return {
                            allowed: true,
                            reason: 'Delegated permission',
                            delegated_by: delegation.delegated_by,
                            expires_at: delegation.expires_at
                        };
                    }
                }
            }

            return { allowed: false, reason: 'No valid delegation' };

        } catch (error) {
            console.error('Delegation check error:', error);
            return { allowed: false, reason: 'Delegation check failed' };
        }
    }

    /**
     * Grant permission to user
     */
    async grantPermission(userId, permission, grantedBy, options = {}) {
        try {
            // Validate permission exists
            if (!this.permissionDefinitions[permission] && permission !== '*') {
                throw new Error(`Unknown permission: ${permission}`);
            }

            // Check if granter has permission to grant
            const granterCheck = await this.canGrantPermission(grantedBy, permission);
            if (!granterCheck.allowed) {
                throw new Error(`Cannot grant permission: ${granterCheck.reason}`);
            }

            // Check dependencies
            const dependencyCheck = await this.checkPermissionDependencies(userId, permission);
            if (!dependencyCheck.satisfied) {
                throw new Error(`Permission dependencies not satisfied: ${dependencyCheck.missing.join(', ')}`);
            }

            const permissionRecord = {
                permission_id: crypto.randomUUID(),
                user_id: userId,
                permission,
                granted_by: grantedBy,
                granted_at: new Date().toISOString(),
                expires_at: options.expiresAt,
                reason: options.reason,
                conditions: options.conditions || {},
                temporary: !!options.temporary
            };

            const { error } = await this.supabase
                .from('user_permissions')
                .insert(permissionRecord);

            if (error) {
                throw error;
            }

            // Clear permission cache for user
            this.clearUserPermissionCache(userId);

            // Log permission grant
            await this.logPermissionEvent(userId, 'permission_granted', {
                permission,
                granted_by: grantedBy,
                expires_at: options.expiresAt,
                temporary: !!options.temporary
            });

            return permissionRecord.permission_id;

        } catch (error) {
            console.error('Permission grant failed:', error);
            throw error;
        }
    }

    /**
     * Revoke permission from user
     */
    async revokePermission(userId, permission, revokedBy, reason = null) {
        try {
            // Check if revoker has permission to revoke
            const revokerCheck = await this.canRevokePermission(revokedBy, permission);
            if (!revokerCheck.allowed) {
                throw new Error(`Cannot revoke permission: ${revokerCheck.reason}`);
            }

            const { error } = await this.supabase
                .from('user_permissions')
                .update({
                    revoked_at: new Date().toISOString(),
                    revoked_by: revokedBy,
                    revoke_reason: reason
                })
                .eq('user_id', userId)
                .eq('permission', permission)
                .is('revoked_at', null);

            if (error) {
                throw error;
            }

            // Clear permission cache
            this.clearUserPermissionCache(userId);

            // Log permission revocation
            await this.logPermissionEvent(userId, 'permission_revoked', {
                permission,
                revoked_by: revokedBy,
                reason
            });

            return true;

        } catch (error) {
            console.error('Permission revocation failed:', error);
            throw error;
        }
    }

    /**
     * Grant temporary permission
     */
    async grantTemporaryPermission(userId, permission, grantedBy, durationMs, reason = null) {
        try {
            const expiresAt = new Date(Date.now() + durationMs).toISOString();
            
            const tempPermission = {
                temp_permission_id: crypto.randomUUID(),
                user_id: userId,
                permission,
                granted_by: grantedBy,
                granted_at: new Date().toISOString(),
                expires_at: expiresAt,
                reason,
                active: true
            };

            const { error } = await this.supabase
                .from('temporary_permissions')
                .insert(tempPermission);

            if (error) {
                throw error;
            }

            // Clear permission cache
            this.clearUserPermissionCache(userId);

            // Log temporary permission
            await this.logPermissionEvent(userId, 'temporary_permission_granted', {
                permission,
                granted_by: grantedBy,
                expires_at: expiresAt,
                duration_ms: durationMs,
                reason
            });

            return tempPermission.temp_permission_id;

        } catch (error) {
            console.error('Temporary permission grant failed:', error);
            throw error;
        }
    }

    /**
     * Validate OAuth scopes against permissions
     */
    async validateOAuthScopes(provider, scopes, userId) {
        try {
            const scopeMapping = this.scopeMappings[provider];
            if (!scopeMapping) {
                return { valid: true, reason: 'No scope validation configured for provider' };
            }

            const requiredPermissions = new Set();
            
            // Map scopes to permissions
            scopes.forEach(scope => {
                const permissions = scopeMapping[scope];
                if (permissions) {
                    permissions.forEach(perm => requiredPermissions.add(perm));
                }
            });

            // Check if user has all required permissions
            const missingPermissions = [];
            for (const permission of requiredPermissions) {
                const hasPermission = await this.hasPermission(userId, permission);
                if (!hasPermission.allowed) {
                    missingPermissions.push(permission);
                }
            }

            if (missingPermissions.length > 0) {
                return {
                    valid: false,
                    reason: 'Missing required permissions',
                    missing_permissions: missingPermissions,
                    required_scopes: scopes
                };
            }

            return {
                valid: true,
                validated_permissions: Array.from(requiredPermissions),
                validated_scopes: scopes
            };

        } catch (error) {
            console.error('OAuth scope validation failed:', error);
            return { valid: false, reason: 'Scope validation failed', error: error.message };
        }
    }

    /**
     * Generate permission report for user
     */
    async generatePermissionReport(userId) {
        try {
            const userPermissions = await this.getUserPermissions(userId);
            
            const [
                temporaryPermissions,
                delegations,
                permissionHistory,
                oauthIntegrations
            ] = await Promise.all([
                this.getTemporaryPermissions(userId),
                this.getPermissionDelegations(userId),
                this.getPermissionHistory(userId),
                this.getUserOAuthIntegrations(userId)
            ]);

            return {
                user_id: userId,
                report_id: crypto.randomUUID(),
                generated_at: new Date().toISOString(),
                
                current_permissions: {
                    role: userPermissions.role,
                    permissions: userPermissions.permissions,
                    additional_roles: userPermissions.additional_roles
                },
                
                temporary_permissions: temporaryPermissions,
                delegated_permissions: delegations,
                
                oauth_integrations: oauthIntegrations.map(integration => ({
                    provider: integration.provider,
                    scopes: integration.scope,
                    validated_permissions: this.mapScopesToPermissions(integration.provider, integration.scope),
                    connected_at: integration.created_at
                })),
                
                permission_history: permissionHistory,
                
                compliance_status: {
                    all_permissions_valid: await this.validateAllUserPermissions(userId),
                    oauth_compliance: await this.validateOAuthCompliance(userId),
                    no_expired_permissions: await this.checkExpiredPermissions(userId)
                }
            };

        } catch (error) {
            console.error('Permission report generation failed:', error);
            throw error;
        }
    }

    /**
     * Helper methods
     */
    matchesDelegationContext(conditions, context) {
        if (!conditions || Object.keys(conditions).length === 0) {
            return true; // No conditions means always match
        }

        for (const [key, value] of Object.entries(conditions)) {
            if (context[key] !== value) {
                return false;
            }
        }

        return true;
    }

    async canGrantPermission(granterId, permission) {
        // Check if granter is admin or has permission to grant
        const granterPermissions = await this.getUserPermissions(granterId);
        
        if (granterPermissions.role === 'admin' || granterPermissions.permissions.includes('*')) {
            return { allowed: true };
        }

        if (granterPermissions.permissions.includes('admin.users')) {
            return { allowed: true };
        }

        return { allowed: false, reason: 'Insufficient privileges to grant permissions' };
    }

    async canRevokePermission(revokerId, permission) {
        return await this.canGrantPermission(revokerId, permission);
    }

    async checkPermissionDependencies(userId, permission) {
        const permissionDef = this.permissionDefinitions[permission];
        if (!permissionDef || !permissionDef.depends_on) {
            return { satisfied: true, missing: [] };
        }

        const userPermissions = await this.getUserPermissions(userId);
        const missing = [];

        for (const dependency of permissionDef.depends_on) {
            if (!userPermissions.permissions.includes(dependency)) {
                missing.push(dependency);
            }
        }

        return {
            satisfied: missing.length === 0,
            missing
        };
    }

    clearUserPermissionCache(userId) {
        for (const key of this.permissionCache.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.permissionCache.delete(key);
            }
        }
    }

    mapScopesToPermissions(provider, scopes) {
        const scopeMapping = this.scopeMappings[provider];
        if (!scopeMapping) return [];

        const permissions = new Set();
        scopes.forEach(scope => {
            const perms = scopeMapping[scope];
            if (perms) {
                perms.forEach(perm => permissions.add(perm));
            }
        });

        return Array.from(permissions);
    }

    async logPermissionEvent(userId, eventType, data) {
        try {
            await this.supabase
                .from('permission_audit_logs')
                .insert({
                    event_id: crypto.randomUUID(),
                    user_id: userId,
                    event_type: eventType,
                    event_data: data,
                    timestamp: new Date().toISOString()
                });
        } catch (error) {
            console.warn('Failed to log permission event:', error);
        }
    }

    // Additional helper methods would be implemented here
    // ... (getTemporaryPermissions, getPermissionDelegations, etc.)
}

module.exports = IntegrationPermissionService; 