/**
 * GDPR Compliance & User Consent Management Service
 * 
 * Provides comprehensive GDPR compliance including:
 * - GDPR-compliant data handling for all integrations
 * - User consent management system with granular permissions
 * - Data retention policies and automatic deletion
 * - Data portability and export functionality
 * - User data deletion and anonymization processes
 * - Privacy settings and controls for users
 * - Consent tracking and audit trails
 * - Data processing agreements and documentation
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const fs = require('fs').promises;
const path = require('path');

class GDPRComplianceService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // GDPR compliance configuration
        this.config = {
            dataRetention: {
                userData: 1095,           // 3 years
                integrationData: 1095,    // 3 years
                consentRecords: 2555,     // 7 years (legal requirement)
                auditLogs: 2555,          // 7 years
                backups: 365              // 1 year
            },
            consentTypes: {
                functional: {
                    required: true,
                    description: 'Essential functionality for calendar integrations'
                },
                analytics: {
                    required: false,
                    description: 'Usage analytics to improve service quality'
                },
                marketing: {
                    required: false,
                    description: 'Product updates and promotional communications'
                },
                thirdParty: {
                    required: false,
                    description: 'Sharing data with integration providers'
                }
            },
            dataCategories: {
                personal: ['name', 'email', 'phone', 'address'],
                professional: ['job_title', 'company', 'department'],
                calendar: ['events', 'meetings', 'schedules', 'attendees'],
                technical: ['ip_address', 'device_info', 'browser_data'],
                usage: ['access_logs', 'feature_usage', 'preferences']
            },
            legalBasis: [
                'consent',
                'contract',
                'legal_obligation',
                'vital_interests',
                'public_task',
                'legitimate_interests'
            ]
        };

        // Initialize periodic tasks
        this.initializePeriodicTasks();
    }

    /**
     * Initialize periodic GDPR compliance tasks
     */
    initializePeriodicTasks() {
        // Daily consent validation
        setInterval(() => {
            this.validateConsents();
        }, 24 * 60 * 60 * 1000);

        // Weekly data retention cleanup
        setInterval(() => {
            this.enforceDataRetention();
        }, 7 * 24 * 60 * 60 * 1000);

        // Monthly compliance audit
        setInterval(() => {
            this.performComplianceAudit();
        }, 30 * 24 * 60 * 60 * 1000);

        console.log('GDPR compliance monitoring initialized');
    }

    /**
     * Record user consent with full audit trail
     */
    async recordConsent(userId, consentData) {
        try {
            const consentRecord = {
                consent_id: crypto.randomUUID(),
                user_id: userId,
                consent_version: consentData.version || '1.0',
                
                // Consent details
                consents: {
                    functional: consentData.functional ?? true,
                    analytics: consentData.analytics ?? false,
                    marketing: consentData.marketing ?? false,
                    thirdParty: consentData.thirdParty ?? false
                },
                
                // Legal context
                legal_basis: consentData.legalBasis || 'consent',
                processing_purposes: consentData.purposes || [],
                data_categories: consentData.dataCategories || [],
                
                // Consent metadata
                consent_method: consentData.method || 'web_form',
                ip_address: consentData.ipAddress,
                user_agent: consentData.userAgent,
                geo_location: consentData.geoLocation,
                
                // Timing
                given_at: new Date().toISOString(),
                expires_at: consentData.expiresAt,
                
                // Tracking
                consent_string: this.generateConsentString(consentData),
                checksum: this.calculateConsentChecksum(consentData),
                
                created_at: new Date().toISOString()
            };

            // Store consent record
            const { error } = await this.supabase
                .from('user_consents')
                .insert(consentRecord);

            if (error) {
                throw error;
            }

            // Update user's current consent status
            await this.updateUserConsentStatus(userId, consentRecord.consents);

            // Log compliance event
            await this.logComplianceEvent({
                type: 'consent_recorded',
                userId,
                data: {
                    consentId: consentRecord.consent_id,
                    consents: consentRecord.consents,
                    legalBasis: consentRecord.legal_basis
                }
            });

            return consentRecord.consent_id;
        } catch (error) {
            console.error('Consent recording failed:', error);
            throw error;
        }
    }

    /**
     * Withdraw user consent
     */
    async withdrawConsent(userId, consentTypes, reason = null) {
        try {
            const withdrawalRecord = {
                withdrawal_id: crypto.randomUUID(),
                user_id: userId,
                withdrawn_consents: consentTypes,
                withdrawal_reason: reason,
                withdrawn_at: new Date().toISOString(),
                ip_address: null, // Set from request context
                user_agent: null  // Set from request context
            };

            // Record withdrawal
            const { error } = await this.supabase
                .from('consent_withdrawals')
                .insert(withdrawalRecord);

            if (error) {
                throw error;
            }

            // Update current consent status
            const currentConsent = await this.getCurrentConsent(userId);
            const updatedConsent = { ...currentConsent };
            
            consentTypes.forEach(type => {
                updatedConsent[type] = false;
            });

            await this.updateUserConsentStatus(userId, updatedConsent);

            // Trigger data processing changes
            await this.processConsentWithdrawal(userId, consentTypes);

            // Log compliance event
            await this.logComplianceEvent({
                type: 'consent_withdrawn',
                userId,
                data: {
                    withdrawalId: withdrawalRecord.withdrawal_id,
                    withdrawnConsents: consentTypes,
                    reason
                }
            });

            return withdrawalRecord.withdrawal_id;
        } catch (error) {
            console.error('Consent withdrawal failed:', error);
            throw error;
        }
    }

    /**
     * Export user data for portability (GDPR Article 20)
     */
    async exportUserData(userId, format = 'json') {
        try {
            // Verify user consent for data export
            const hasConsent = await this.verifyDataExportConsent(userId);
            if (!hasConsent) {
                throw new Error('User has not consented to data export');
            }

            // Collect all user data
            const userData = await this.collectUserData(userId);

            // Generate export package
            const exportId = crypto.randomUUID();
            const exportPath = await this.generateDataExport(userData, format, exportId);

            // Log data export
            await this.logComplianceEvent({
                type: 'data_exported',
                userId,
                data: {
                    exportId,
                    format,
                    recordCount: this.countRecords(userData),
                    categories: Object.keys(userData)
                }
            });

            // Create secure download link
            const downloadLink = await this.createSecureDownloadLink(exportPath, exportId);

            return {
                exportId,
                downloadLink,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
                format,
                size: await this.getFileSize(exportPath)
            };
        } catch (error) {
            console.error('Data export failed:', error);
            throw error;
        }
    }

    /**
     * Delete user data (Right to Erasure - GDPR Article 17)
     */
    async deleteUserData(userId, categories = 'all', reason = 'user_request') {
        try {
            // Verify deletion eligibility
            const canDelete = await this.verifyDeletionEligibility(userId, reason);
            if (!canDelete.eligible) {
                throw new Error(`Data deletion not allowed: ${canDelete.reason}`);
            }

            const deletionId = crypto.randomUUID();
            const deletionPlan = await this.createDeletionPlan(userId, categories);

            // Execute deletion plan
            const deletionResults = await this.executeDeletionPlan(deletionPlan);

            // Create deletion record
            const deletionRecord = {
                deletion_id: deletionId,
                user_id: userId,
                deletion_type: categories === 'all' ? 'complete' : 'partial',
                categories_deleted: Array.isArray(categories) ? categories : ['all'],
                reason,
                deletion_plan: deletionPlan,
                deletion_results: deletionResults,
                deleted_at: new Date().toISOString(),
                verified_by: null // Set if manual verification required
            };

            // Store deletion record
            const { error } = await this.supabase
                .from('data_deletions')
                .insert(deletionRecord);

            if (error) {
                throw error;
            }

            // Log compliance event
            await this.logComplianceEvent({
                type: 'data_deleted',
                userId: categories === 'all' ? null : userId, // Anonymize if complete deletion
                data: {
                    deletionId,
                    type: deletionRecord.deletion_type,
                    categories: deletionRecord.categories_deleted,
                    reason
                }
            });

            return {
                deletionId,
                type: deletionRecord.deletion_type,
                deletedCategories: deletionRecord.categories_deleted,
                deletedRecords: deletionResults.totalDeleted,
                anonymizedRecords: deletionResults.totalAnonymized
            };
        } catch (error) {
            console.error('Data deletion failed:', error);
            throw error;
        }
    }

    /**
     * Anonymize user data while preserving analytics value
     */
    async anonymizeUserData(userId, preserveAnalytics = true) {
        try {
            const anonymizationId = crypto.randomUUID();
            const anonymizationPlan = await this.createAnonymizationPlan(userId, preserveAnalytics);

            // Execute anonymization
            const anonymizationResults = await this.executeAnonymizationPlan(anonymizationPlan);

            // Record anonymization
            const anonymizationRecord = {
                anonymization_id: anonymizationId,
                original_user_id: userId,
                anonymized_user_id: crypto.randomUUID(),
                anonymization_method: preserveAnalytics ? 'k_anonymity' : 'complete',
                anonymized_at: new Date().toISOString(),
                anonymization_results: anonymizationResults
            };

            const { error } = await this.supabase
                .from('data_anonymizations')
                .insert(anonymizationRecord);

            if (error) {
                throw error;
            }

            return anonymizationRecord;
        } catch (error) {
            console.error('Data anonymization failed:', error);
            throw error;
        }
    }

    /**
     * Validate current user consents
     */
    async validateConsents() {
        try {
            // Get all users with active consents
            const { data: users, error } = await this.supabase
                .from('users')
                .select('id, consent_status, consent_updated_at')
                .not('consent_status', 'is', null);

            if (error) {
                throw error;
            }

            for (const user of users) {
                await this.validateUserConsent(user.id);
            }

            console.log(`Validated consents for ${users.length} users`);
        } catch (error) {
            console.error('Consent validation failed:', error);
        }
    }

    /**
     * Validate individual user consent
     */
    async validateUserConsent(userId) {
        try {
            const currentConsent = await this.getCurrentConsent(userId);
            
            // Check if consent needs renewal
            const needsRenewal = await this.checkConsentRenewalNeeded(userId);
            if (needsRenewal) {
                await this.triggerConsentRenewal(userId);
            }

            // Validate consent against current processing
            const processingActivities = await this.getUserProcessingActivities(userId);
            const consentViolations = this.detectConsentViolations(currentConsent, processingActivities);
            
            if (consentViolations.length > 0) {
                await this.handleConsentViolations(userId, consentViolations);
            }

        } catch (error) {
            console.error(`Consent validation failed for user ${userId}:`, error);
        }
    }

    /**
     * Enforce data retention policies
     */
    async enforceDataRetention() {
        try {
            const retentionPolicies = this.config.dataRetention;
            const now = new Date();

            for (const [category, days] of Object.entries(retentionPolicies)) {
                const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
                await this.cleanupExpiredData(category, cutoffDate);
            }

            console.log('Data retention enforcement completed');
        } catch (error) {
            console.error('Data retention enforcement failed:', error);
        }
    }

    /**
     * Generate user privacy report
     */
    async generatePrivacyReport(userId) {
        try {
            const [
                consentHistory,
                dataProcessingLog,
                dataExports,
                deletionHistory,
                currentProcessing
            ] = await Promise.all([
                this.getConsentHistory(userId),
                this.getDataProcessingLog(userId),
                this.getDataExports(userId),
                this.getDeletionHistory(userId),
                this.getCurrentProcessingActivities(userId)
            ]);

            const privacyReport = {
                userId,
                reportId: crypto.randomUUID(),
                generatedAt: new Date().toISOString(),
                
                // Current privacy status
                currentStatus: {
                    consents: await this.getCurrentConsent(userId),
                    dataCategories: await this.getUserDataCategories(userId),
                    processingActivities: currentProcessing.length,
                    retentionStatus: await this.getRetentionStatus(userId)
                },
                
                // Historical data
                history: {
                    consentChanges: consentHistory.length,
                    dataExports: dataExports.length,
                    deletions: deletionHistory.length,
                    lastConsentUpdate: consentHistory[0]?.given_at
                },
                
                // Rights exercised
                rightsExercised: {
                    dataExports: dataExports.map(exp => ({
                        date: exp.created_at,
                        format: exp.format,
                        records: exp.record_count
                    })),
                    deletions: deletionHistory.map(del => ({
                        date: del.deleted_at,
                        type: del.deletion_type,
                        categories: del.categories_deleted
                    }))
                },
                
                // Compliance summary
                compliance: {
                    gdprCompliant: await this.checkGDPRCompliance(userId),
                    consentValid: await this.validateCurrentConsent(userId),
                    retentionCompliant: await this.checkRetentionCompliance(userId),
                    lastAudit: await this.getLastAuditDate(userId)
                }
            };

            return privacyReport;
        } catch (error) {
            console.error('Privacy report generation failed:', error);
            throw error;
        }
    }

    /**
     * Perform comprehensive compliance audit
     */
    async performComplianceAudit() {
        try {
            const auditId = crypto.randomUUID();
            const auditResults = {
                auditId,
                startedAt: new Date().toISOString(),
                
                // User consent compliance
                consentCompliance: await this.auditConsentCompliance(),
                
                // Data retention compliance
                retentionCompliance: await this.auditRetentionCompliance(),
                
                // Processing activities compliance
                processingCompliance: await this.auditProcessingActivities(),
                
                // Security compliance
                securityCompliance: await this.auditSecurityCompliance(),
                
                // Documentation compliance
                documentationCompliance: await this.auditDocumentationCompliance()
            };

            auditResults.completedAt = new Date().toISOString();
            auditResults.overallScore = this.calculateComplianceScore(auditResults);

            // Store audit results
            const { error } = await this.supabase
                .from('compliance_audits')
                .insert(auditResults);

            if (error) {
                throw error;
            }

            // Generate recommendations
            const recommendations = await this.generateComplianceRecommendations(auditResults);

            console.log(`Compliance audit completed. Score: ${auditResults.overallScore}%`);
            return { auditResults, recommendations };
        } catch (error) {
            console.error('Compliance audit failed:', error);
            throw error;
        }
    }

    /**
     * Helper methods for GDPR operations
     */
    generateConsentString(consentData) {
        const parts = [
            consentData.functional ? '1' : '0',
            consentData.analytics ? '1' : '0',
            consentData.marketing ? '1' : '0',
            consentData.thirdParty ? '1' : '0'
        ];
        return parts.join('');
    }

    calculateConsentChecksum(consentData) {
        const data = JSON.stringify(consentData, Object.keys(consentData).sort());
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    async getCurrentConsent(userId) {
        const { data, error } = await this.supabase
            .from('users')
            .select('consent_status')
            .eq('id', userId)
            .single();

        if (error) {
            throw error;
        }

        return data.consent_status || {};
    }

    async updateUserConsentStatus(userId, consents) {
        const { error } = await this.supabase
            .from('users')
            .update({
                consent_status: consents,
                consent_updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (error) {
            throw error;
        }
    }

    async logComplianceEvent(event) {
        try {
            const { error } = await this.supabase
                .from('compliance_events')
                .insert({
                    event_id: crypto.randomUUID(),
                    event_type: event.type,
                    user_id: event.userId,
                    event_data: event.data,
                    timestamp: new Date().toISOString()
                });

            if (error) {
                console.warn('Failed to log compliance event:', error);
            }
        } catch (error) {
            console.warn('Compliance event logging failed:', error);
        }
    }

    countRecords(data) {
        let count = 0;
        for (const category in data) {
            if (Array.isArray(data[category])) {
                count += data[category].length;
            } else if (typeof data[category] === 'object') {
                count += Object.keys(data[category]).length;
            }
        }
        return count;
    }

    // Additional helper methods would be implemented here
    // ... (collectUserData, createDeletionPlan, etc.)
}

module.exports = GDPRComplianceService; 