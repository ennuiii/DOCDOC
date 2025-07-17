/**
 * Auto Sync Service
 * Handles automatic synchronization of calendar integrations when appointments change status
 */

import { supabaseAdmin } from '../config/supabase.js';
import GoogleCalendarSyncService from '../integrations/services/GoogleCalendarSyncService.js';
import CalDAVSyncService from '../integrations/services/CalDAVSyncService.js';

class AutoSyncService {
    constructor() {
        this.supabase = supabaseAdmin();
        this.googleSyncService = new GoogleCalendarSyncService();
        this.calDAVSyncService = new CalDAVSyncService();
    }

    /**
     * Trigger auto-sync for affected users when appointment status changes
     */
    async triggerAppointmentSync(appointmentId, action = 'updated') {
        try {
            console.log(`🔄 [AUTO_SYNC_DEBUG] Triggering auto-sync for appointment ${appointmentId}, action: ${action}`);
            
            // Get the appointment details
            const { data: appointment, error } = await this.supabase
                .from('appointments')
                .select(`
                    *,
                    doctor:doctor_id(id, email, first_name, last_name),
                    pharma_rep:pharma_rep_id(id, email, first_name, last_name),
                    timeslot:timeslot_id(start_time, end_time)
                `)
                .eq('id', appointmentId)
                .single();

            if (error || !appointment) {
                console.error(`❌ [AUTO_SYNC_DEBUG] Failed to get appointment ${appointmentId}:`, error);
                return { success: false, error: 'Appointment not found' };
            }

            console.log(`📋 [AUTO_SYNC_DEBUG] Appointment details:`, {
                id: appointment.id,
                status: appointment.status,
                purpose: appointment.purpose,
                doctor: appointment.doctor_id,
                pharmaRep: appointment.pharma_rep_id,
                videoProvider: appointment.video_provider,
                meetingLink: appointment.meeting_link ? 'YES' : 'NO'
            });

            // Get users to sync (both doctor and pharma rep)
            const userIds = [appointment.doctor_id, appointment.pharma_rep_id].filter(Boolean);
            console.log(`👥 [AUTO_SYNC_DEBUG] Users to sync: ${userIds.join(', ')}`);

            const syncResults = [];

            // Trigger sync for each user
            for (const userId of userIds) {
                try {
                    console.log(`🔄 [AUTO_SYNC_DEBUG] Auto-sync triggered for user ${userId}, appointment ${appointmentId}, action: ${action}`);

                    // Get user's integrations that have auto-sync enabled
                    const { data: integrations, error: integrationError } = await this.supabase
                        .from('user_integrations')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('status', 'connected')
                        .eq('auto_sync', true);

                    if (integrationError) {
                        console.error(`❌ [AUTO_SYNC_DEBUG] Error getting integrations for user ${userId}:`, integrationError);
                        continue;
                    }

                    console.log(`🔗 [AUTO_SYNC_DEBUG] Found ${integrations?.length || 0} auto-sync integrations for user ${userId}`);

                    // Sync each integration
                    for (const integration of integrations || []) {
                        try {
                            console.log(`🔄 [AUTO_SYNC_DEBUG] Auto-syncing ${integration.provider} integration ${integration.id} due to ${action}`);

                            let syncResult;
                            if (integration.provider === 'google') {
                                // Trigger Google Calendar sync
                                syncResult = await this.googleSyncService.performIncrementalSync(
                                    userId, 
                                    integration.id, 
                                    { reason: 'auto_sync', triggerType: 'appointment_change' }
                                );
                                
                                console.log(`✅ [AUTO_SYNC_DEBUG] Google auto-sync completed for integration ${integration.id}:`, syncResult);
                            } else if (integration.provider === 'caldav') {
                                // Trigger CalDAV sync
                                syncResult = await this.calDAVSyncService.performSync(
                                    userId, 
                                    integration.id
                                );
                                
                                console.log(`✅ [AUTO_SYNC_DEBUG] CalDAV auto-sync completed for integration ${integration.id}:`, syncResult);
                            }

                            syncResults.push({
                                userId,
                                integrationId: integration.id,
                                provider: integration.provider,
                                success: true,
                                result: syncResult
                            });

                            console.log(`✅ [AUTO_SYNC_DEBUG] Auto-sync completed for user ${userId}`);

                        } catch (error) {
                            console.error(`❌ [AUTO_SYNC_DEBUG] Auto-sync failed for integration ${integration.id}:`, error);
                            syncResults.push({
                                userId,
                                integrationId: integration.id,
                                provider: integration.provider,
                                success: false,
                                error: error.message
                            });
                        }
                    }

                } catch (error) {
                    console.error(`❌ [AUTO_SYNC_DEBUG] Auto-sync failed for user ${userId}:`, error);
                    syncResults.push({
                        userId,
                        success: false,
                        error: error.message
                    });
                }
            }

            console.log(`📊 [AUTO_SYNC_DEBUG] Auto-sync summary for appointment ${appointmentId}:`, {
                action,
                usersProcessed: userIds.length,
                totalSyncs: syncResults.length,
                successful: syncResults.filter(r => r.success).length,
                failed: syncResults.filter(r => !r.success).length
            });

            return {
                success: true,
                appointmentId,
                action,
                results: syncResults
            };

        } catch (error) {
            console.error(`❌ [AUTO_SYNC_DEBUG] Critical error in auto-sync for appointment ${appointmentId}:`, error);
            return {
                success: false,
                appointmentId,
                action,
                error: error.message
            };
        }
    }

    /**
     * Manual sync trigger for testing
     */
    async manualSync(userId, provider = 'google') {
        try {
            console.log(`🔧 [AUTO_SYNC_DEBUG] Manual sync triggered for user ${userId}, provider: ${provider}`);
            
            const { data: integrations, error } = await this.supabase
                .from('user_integrations')
                .select('*')
                .eq('user_id', userId)
                .eq('provider', provider)
                .eq('status', 'connected');

            if (error || !integrations || integrations.length === 0) {
                console.error(`❌ [AUTO_SYNC_DEBUG] No connected ${provider} integrations found for user ${userId}`);
                return { success: false, error: 'No connected integrations found' };
            }

            const results = [];
            for (const integration of integrations) {
                console.log(`🔄 [AUTO_SYNC_DEBUG] Manual sync for integration ${integration.id}`);
                
                let syncResult;
                if (provider === 'google') {
                    syncResult = await this.googleSyncService.performIncrementalSync(
                        userId, 
                        integration.id, 
                        { reason: 'manual_sync', forceFull: false }
                    );
                } else if (provider === 'caldav') {
                    syncResult = await this.calDAVSyncService.performSync(
                        userId, 
                        integration.id
                    );
                }

                results.push({
                    integrationId: integration.id,
                    success: true,
                    result: syncResult
                });
            }

            console.log(`✅ [AUTO_SYNC_DEBUG] Manual sync completed for user ${userId}:`, results);
            return { success: true, results };

        } catch (error) {
            console.error(`❌ [AUTO_SYNC_DEBUG] Manual sync failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Enable or disable auto-sync for a user's integration
     * @param {string} integrationId - Integration ID
     * @param {boolean} enabled - Whether to enable auto-sync
     */
    async setAutoSync(integrationId, enabled) {
        try {
            const { error } = await this.supabase
                .from('user_integrations')
                .update({
                    auto_sync: enabled,
                    updated_at: new Date().toISOString()
                })
                .eq('id', integrationId);

            if (error) {
                throw error;
            }

            console.log(`Auto-sync ${enabled ? 'enabled' : 'disabled'} for integration ${integrationId}`);
            
        } catch (error) {
            console.error('Failed to update auto-sync setting:', error);
            throw error;
        }
    }

    /**
     * Get auto-sync settings for a user
     * @param {string} userId - User ID
     */
    async getAutoSyncSettings(userId) {
        try {
            const { data: integrations, error } = await this.supabase
                .from('user_integrations')
                .select('id, provider, auto_sync, status')
                .eq('user_id', userId);

            if (error) {
                throw error;
            }

            return integrations || [];

        } catch (error) {
            console.error('Failed to get auto-sync settings:', error);
            throw error;
        }
    }
}

// Export the class instead of an instance to avoid early initialization
export default AutoSyncService; 