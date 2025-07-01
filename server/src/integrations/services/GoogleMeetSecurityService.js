/**
 * Google Meet Security Service
 * Handles access controls and security settings for Google Meet integration
 * Ensures compliance with PharmaDOC security requirements
 */

const { createClient } = require('@supabase/supabase-js');
const AuditLogger = require('./AuditLogger');

class GoogleMeetSecurityService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        
        // Default security configurations for different meeting types
        this.securityProfiles = {
            // High security for sensitive pharmaceutical discussions
            pharmaceutical: {
                allowExternalGuests: false,
                requireAuthentication: true,
                enableWaitingRoom: true,
                allowRecording: false,
                restrictScreenSharing: true,
                enableEndToEndEncryption: true,
                maxParticipants: 4,
                allowChatting: false,
                requireMeetingPassword: true
            },
            
            // Standard security for regular business meetings
            business: {
                allowExternalGuests: false,
                requireAuthentication: true,
                enableWaitingRoom: true,
                allowRecording: true,
                restrictScreenSharing: false,
                enableEndToEndEncryption: true,
                maxParticipants: 10,
                allowChatting: true,
                requireMeetingPassword: false
            },
            
            // Lower security for public presentations or webinars
            public: {
                allowExternalGuests: true,
                requireAuthentication: false,
                enableWaitingRoom: false,
                allowRecording: true,
                restrictScreenSharing: false,
                enableEndToEndEncryption: false,
                maxParticipants: 100,
                allowChatting: true,
                requireMeetingPassword: false
            }
        };
    }

    /**
     * Get security configuration for an appointment
     * @param {Object} appointment - PharmaDOC appointment
     * @param {Object} userRoles - User roles and permissions
     * @returns {Object} Security configuration
     */
    async getSecurityConfiguration(appointment, userRoles = {}) {
        try {
            // Determine security profile based on appointment context
            const securityProfile = this.determineSecurityProfile(appointment, userRoles);
            
            // Get base configuration
            let config = { ...this.securityProfiles[securityProfile] };
            
            // Apply custom security settings from appointment
            if (appointment.integration_data?.google_meet?.security) {
                config = this.mergeSecuritySettings(config, appointment.integration_data.google_meet.security);
            }
            
            // Apply organizational security policies
            const orgPolicies = await this.getOrganizationSecurityPolicies(appointment);
            if (orgPolicies) {
                config = this.applyOrganizationPolicies(config, orgPolicies);
            }
            
            // Validate final configuration
            const validatedConfig = this.validateSecurityConfiguration(config);
            
            this.auditLogger.log('info', 'GOOGLE_MEET_SECURITY_CONFIG_GENERATED', {
                appointmentId: appointment.id,
                securityProfile,
                config: validatedConfig
            });
            
            return validatedConfig;

        } catch (error) {
            this.auditLogger.log('error', 'GOOGLE_MEET_SECURITY_CONFIG_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            
            // Return safe defaults on error
            return this.securityProfiles.pharmaceutical;
        }
    }

    /**
     * Determine appropriate security profile for appointment
     */
    determineSecurityProfile(appointment, userRoles) {
        // Check for high-security indicators
        if (this.requiresHighSecurity(appointment, userRoles)) {
            return 'pharmaceutical';
        }
        
        // Check for public meeting indicators
        if (this.isPublicMeeting(appointment, userRoles)) {
            return 'public';
        }
        
        // Default to business profile
        return 'business';
    }

    /**
     * Check if appointment requires high security
     */
    requiresHighSecurity(appointment, userRoles) {
        // High security conditions
        const highSecurityConditions = [
            // Contains sensitive pharmaceutical data
            appointment.purpose?.toLowerCase().includes('clinical'),
            appointment.purpose?.toLowerCase().includes('trial'),
            appointment.purpose?.toLowerCase().includes('regulatory'),
            appointment.purpose?.toLowerCase().includes('confidential'),
            
            // Involves external parties that require high security
            appointment.meeting_type === 'virtual' && appointment.purpose?.toLowerCase().includes('regulatory'),
            
            // User roles indicate need for high security
            userRoles.doctor?.specializations?.includes('clinical_trials'),
            userRoles.pharma_rep?.clearance_level === 'high',
            
            // Custom security flag
            appointment.integration_data?.security_level === 'high'
        ];
        
        return highSecurityConditions.some(condition => condition);
    }

    /**
     * Check if this is a public meeting
     */
    isPublicMeeting(appointment, userRoles) {
        const publicMeetingConditions = [
            appointment.purpose?.toLowerCase().includes('presentation'),
            appointment.purpose?.toLowerCase().includes('webinar'),
            appointment.purpose?.toLowerCase().includes('public'),
            appointment.integration_data?.meeting_type === 'public',
            userRoles.isPublicPresentation === true
        ];
        
        return publicMeetingConditions.some(condition => condition);
    }

    /**
     * Merge custom security settings with base configuration
     */
    mergeSecuritySettings(baseConfig, customSettings) {
        const merged = { ...baseConfig };
        
        // Only allow certain settings to be overridden
        const allowedOverrides = [
            'allowRecording',
            'allowChatting',
            'maxParticipants',
            'requireMeetingPassword'
        ];
        
        for (const [key, value] of Object.entries(customSettings)) {
            if (allowedOverrides.includes(key)) {
                merged[key] = value;
            }
        }
        
        return merged;
    }

    /**
     * Get organization-level security policies
     */
    async getOrganizationSecurityPolicies(appointment) {
        try {
            // Get organization policies for the doctor and pharma rep
            const { data: doctorOrg } = await this.supabase
                .from('users')
                .select('organization_id, organizations(security_policies)')
                .eq('id', appointment.doctor_id)
                .single();

            const { data: pharmaOrg } = await this.supabase
                .from('users')
                .select('organization_id, organizations(security_policies)')
                .eq('id', appointment.pharma_rep_id)
                .single();

            // Merge organization policies (most restrictive wins)
            const policies = {};
            
            if (doctorOrg?.organizations?.security_policies?.google_meet) {
                Object.assign(policies, doctorOrg.organizations.security_policies.google_meet);
            }
            
            if (pharmaOrg?.organizations?.security_policies?.google_meet) {
                // Apply most restrictive settings
                const pharmaPolicy = pharmaOrg.organizations.security_policies.google_meet;
                for (const [key, value] of Object.entries(pharmaPolicy)) {
                    if (this.isMoreRestrictive(key, value, policies[key])) {
                        policies[key] = value;
                    }
                }
            }
            
            return Object.keys(policies).length > 0 ? policies : null;

        } catch (error) {
            this.auditLogger.log('warn', 'ORG_SECURITY_POLICIES_FETCH_ERROR', {
                appointmentId: appointment.id,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Apply organization policies to configuration
     */
    applyOrganizationPolicies(config, orgPolicies) {
        const updated = { ...config };
        
        for (const [key, value] of Object.entries(orgPolicies)) {
            if (this.isMoreRestrictive(key, value, updated[key])) {
                updated[key] = value;
            }
        }
        
        return updated;
    }

    /**
     * Check if a security setting is more restrictive
     */
    isMoreRestrictive(settingKey, newValue, currentValue) {
        const restrictiveSettings = {
            allowExternalGuests: false,     // false is more restrictive
            requireAuthentication: true,    // true is more restrictive
            enableWaitingRoom: true,        // true is more restrictive
            allowRecording: false,          // false is more restrictive
            restrictScreenSharing: true,    // true is more restrictive
            enableEndToEndEncryption: true, // true is more restrictive
            allowChatting: false,           // false is more restrictive
            requireMeetingPassword: true    // true is more restrictive
        };
        
        // For numeric values like maxParticipants, lower is more restrictive
        if (settingKey === 'maxParticipants') {
            return newValue < currentValue;
        }
        
        // For boolean settings, check against restrictive values
        if (settingKey in restrictiveSettings) {
            const restrictiveValue = restrictiveSettings[settingKey];
            return newValue === restrictiveValue && currentValue !== restrictiveValue;
        }
        
        return false;
    }

    /**
     * Validate security configuration for compliance
     */
    validateSecurityConfiguration(config) {
        const validated = { ...config };
        
        // Ensure minimum security standards
        if (validated.allowExternalGuests && !validated.enableWaitingRoom) {
            validated.enableWaitingRoom = true; // Force waiting room for external guests
        }
        
        if (validated.allowRecording && validated.allowExternalGuests) {
            // Recording with external guests requires additional security
            validated.requireAuthentication = true;
        }
        
        // Ensure reasonable participant limits
        if (validated.maxParticipants > 250) {
            validated.maxParticipants = 250; // Google Meet limit
        }
        
        if (validated.maxParticipants < 2) {
            validated.maxParticipants = 2; // Minimum for a meeting
        }
        
        return validated;
    }

    /**
     * Generate Google Meet conference creation request with security settings
     */
    generateConferenceRequest(securityConfig, appointmentId) {
        const conferenceRequest = {
            requestId: `pharmadoc-secure-${appointmentId}-${Date.now()}`,
            conferenceSolutionKey: {
                type: 'hangoutsMeet'
            },
            conferenceData: {
                entryPoints: [
                    {
                        entryPointType: 'video',
                        meetingCode: securityConfig.requireMeetingPassword ? 
                            this.generateMeetingPassword() : undefined
                    }
                ],
                conferenceSolution: {
                    key: {
                        type: 'hangoutsMeet'
                    },
                    name: 'Google Meet',
                    iconUri: 'https://fonts.gstatic.com/s/i/productlogos/meet_2020q4/v6/web-512dp/logo_meet_2020q4_color_2x_web_512dp.png'
                },
                conferenceId: `pharmadoc-${appointmentId}`,
                signature: this.generateConferenceSignature(appointmentId, securityConfig)
            }
        };

        // Add additional security metadata
        if (securityConfig.enableEndToEndEncryption) {
            conferenceRequest.conferenceData.parameters = {
                addOnParameters: {
                    parameters: {
                        'security.encryption': 'required',
                        'security.waitingRoom': securityConfig.enableWaitingRoom.toString(),
                        'security.maxParticipants': securityConfig.maxParticipants.toString(),
                        'security.externalGuests': securityConfig.allowExternalGuests.toString()
                    }
                }
            };
        }

        return conferenceRequest;
    }

    /**
     * Generate secure meeting password
     */
    generateMeetingPassword() {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * Generate conference signature for security validation
     */
    generateConferenceSignature(appointmentId, securityConfig) {
        const crypto = require('crypto');
        const payload = `${appointmentId}-${JSON.stringify(securityConfig)}-${process.env.CONFERENCE_SIGNATURE_SECRET}`;
        return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
    }

    /**
     * Validate meeting access permissions for a user
     */
    async validateMeetingAccess(meetingId, userId, appointmentId) {
        try {
            // Check if user is authorized for this appointment
            const { data: appointment } = await this.supabase
                .from('appointments')
                .select('doctor_id, pharma_rep_id, status, integration_data')
                .eq('id', appointmentId)
                .single();

            if (!appointment) {
                throw new Error('Appointment not found');
            }

            if (appointment.status === 'cancelled') {
                throw new Error('Meeting is cancelled');
            }

            // Check if user is a participant
            const isAuthorized = appointment.doctor_id === userId || 
                               appointment.pharma_rep_id === userId;

            if (!isAuthorized) {
                // Check for additional authorized users (e.g., assistants, supervisors)
                const additionalUsers = appointment.integration_data?.authorized_users || [];
                if (!additionalUsers.includes(userId)) {
                    throw new Error('User not authorized for this meeting');
                }
            }

            this.auditLogger.log('info', 'MEETING_ACCESS_VALIDATED', {
                meetingId,
                userId,
                appointmentId,
                authorized: true
            });

            return {
                authorized: true,
                role: appointment.doctor_id === userId ? 'doctor' : 'pharma_rep',
                permissions: await this.getUserMeetingPermissions(userId, appointment)
            };

        } catch (error) {
            this.auditLogger.log('warn', 'MEETING_ACCESS_DENIED', {
                meetingId,
                userId,
                appointmentId,
                reason: error.message
            });

            return {
                authorized: false,
                reason: error.message
            };
        }
    }

    /**
     * Get user's meeting permissions based on role
     */
    async getUserMeetingPermissions(userId, appointment) {
        const { data: user } = await this.supabase
            .from('users')
            .select('role, permissions')
            .eq('id', userId)
            .single();

        const basePermissions = {
            canStartMeeting: false,
            canEndMeeting: false,
            canMuteParticipants: false,
            canShareScreen: true,
            canRecord: false,
            canInviteOthers: false,
            canChangeSecurity: false
        };

        // Apply role-based permissions
        if (user?.role === 'doctor') {
            basePermissions.canStartMeeting = true;
            basePermissions.canEndMeeting = true;
            basePermissions.canMuteParticipants = true;
            basePermissions.canRecord = true;
            basePermissions.canInviteOthers = true;
        } else if (user?.role === 'pharma_rep') {
            basePermissions.canStartMeeting = true;
            basePermissions.canShareScreen = true;
        }

        // Apply custom permissions from user profile
        if (user?.permissions?.google_meet) {
            Object.assign(basePermissions, user.permissions.google_meet);
        }

        return basePermissions;
    }

    /**
     * Log security-related meeting events
     */
    async logSecurityEvent(eventType, details) {
        await this.auditLogger.log('security', `GOOGLE_MEET_${eventType}`, details);
        
        // Store in security events table for compliance tracking
        try {
            await this.supabase
                .from('security_events')
                .insert({
                    event_type: `google_meet_${eventType.toLowerCase()}`,
                    details,
                    created_at: new Date().toISOString()
                });
        } catch (error) {
            // Don't throw on security log failure, but log the error
            console.error('Failed to log security event:', error);
        }
    }

    /**
     * Generate security compliance report for meetings
     */
    async generateComplianceReport(startDate, endDate, organizationId = null) {
        const query = this.supabase
            .from('calendar_events')
            .select(`
                *,
                appointments (
                    id,
                    purpose,
                    doctor_id,
                    pharma_rep_id,
                    integration_data
                )
            `)
            .gte('start_time', startDate.toISOString())
            .lte('end_time', endDate.toISOString())
            .eq('sync_status', 'synced')
            .not('meeting_url', 'is', null);

        if (organizationId) {
            // Filter by organization if specified
            query.eq('appointments.organizations.id', organizationId);
        }

        const { data: meetings } = await query;

        const report = {
            reportPeriod: { startDate, endDate },
            totalMeetings: meetings?.length || 0,
            securityCompliance: {
                highSecurity: 0,
                businessSecurity: 0,
                publicSecurity: 0,
                nonCompliant: 0
            },
            securityFeatures: {
                withWaitingRoom: 0,
                withRecording: 0,
                withAuthentication: 0,
                withEncryption: 0
            },
            violations: []
        };

        // Analyze each meeting for compliance
        for (const meeting of meetings || []) {
            const securityConfig = meeting.appointments?.integration_data?.google_meet?.security;
            
            if (securityConfig) {
                // Categorize by security level
                if (securityConfig.enableEndToEndEncryption && securityConfig.requireAuthentication) {
                    report.securityCompliance.highSecurity++;
                } else if (securityConfig.requireAuthentication) {
                    report.securityCompliance.businessSecurity++;
                } else {
                    report.securityCompliance.publicSecurity++;
                }

                // Count security features
                if (securityConfig.enableWaitingRoom) report.securityFeatures.withWaitingRoom++;
                if (securityConfig.allowRecording) report.securityFeatures.withRecording++;
                if (securityConfig.requireAuthentication) report.securityFeatures.withAuthentication++;
                if (securityConfig.enableEndToEndEncryption) report.securityFeatures.withEncryption++;
            } else {
                report.securityCompliance.nonCompliant++;
                report.violations.push({
                    meetingId: meeting.id,
                    appointmentId: meeting.appointments?.id,
                    issue: 'No security configuration found'
                });
            }
        }

        return report;
    }
}

module.exports = GoogleMeetSecurityService; 