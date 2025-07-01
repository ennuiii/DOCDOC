/**
 * Audit Service
 * 
 * Provides comprehensive audit logging for compliance requirements
 * including HIPAA and GDPR data access tracking.
 */

const { supabase } = require('../config/supabase');
const { COMPLIANCE_CONFIG } = require('../config/futureEnhancements');

class AuditService {
  /**
   * Log user action for audit trail
   * @param {string} userId - User performing the action
   * @param {string} action - Action performed
   * @param {string} resourceType - Type of resource (user, appointment, etc.)
   * @param {string} resourceId - ID of the resource
   * @param {Object} oldValues - Previous values (for updates)
   * @param {Object} newValues - New values (for updates)
   * @param {Object} context - Request context
   */
  static async logAction(userId, action, resourceType, resourceId, oldValues = null, newValues = null, context = {}) {
    if (!COMPLIANCE_CONFIG.hipaa.features.auditLogging) {
      return;
    }

    try {
      const auditData = {
        user_id: userId,
        action: action,
        resource_type: resourceType,
        resource_id: resourceId,
        old_values: oldValues,
        new_values: newValues,
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
        session_id: context.sessionId
      };

      const { error } = await supabase
        .from('audit_logs')
        .insert([auditData]);

      if (error) {
        console.error('Audit logging error:', error);
      }
    } catch (error) {
      console.error('Audit service error:', error);
    }
  }

  /**
   * Log data access for HIPAA compliance
   * @param {string} userId - User accessing the data
   * @param {string} accessedUserId - User whose data is being accessed
   * @param {string} accessType - Type of access (view, edit, delete, export)
   * @param {string} dataType - Type of data accessed
   * @param {string} purpose - Purpose of access
   * @param {Object} context - Request context
   */
  static async logDataAccess(userId, accessedUserId, accessType, dataType, purpose = '', context = {}) {
    if (!COMPLIANCE_CONFIG.hipaa.features.auditLogging) {
      return;
    }

    try {
      const accessData = {
        user_id: userId,
        accessed_user_id: accessedUserId,
        access_type: accessType,
        data_type: dataType,
        purpose: purpose,
        ip_address: context.ipAddress
      };

      const { error } = await supabase
        .from('data_access_logs')
        .insert([accessData]);

      if (error) {
        console.error('Data access logging error:', error);
      }
    } catch (error) {
      console.error('Data access audit error:', error);
    }
  }

  /**
   * Get audit logs for a specific resource (admin only)
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - ID of resource
   * @param {Object} filters - Additional filters
   */
  static async getResourceAuditLogs(resourceType, resourceId, filters = {}) {
    try {
      let query = supabase
        .from('audit_logs')
        .select(`
          *,
          users(email, role)
        `)
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId);

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters.limit || 100);

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get audit logs error:', error);
      return [];
    }
  }

  /**
   * Get data access logs for a user (for HIPAA compliance reporting)
   * @param {string} userId - User ID whose data access to track
   * @param {Object} filters - Additional filters
   */
  static async getUserDataAccessLogs(userId, filters = {}) {
    try {
      let query = supabase
        .from('data_access_logs')
        .select(`
          *,
          users!data_access_logs_user_id_fkey(email, role)
        `)
        .eq('accessed_user_id', userId);

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters.accessType) {
        query = query.eq('access_type', filters.accessType);
      }

      if (filters.dataType) {
        query = query.eq('data_type', filters.dataType);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters.limit || 100);

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get user data access logs error:', error);
      return [];
    }
  }

  /**
   * Generate compliance audit report
   * @param {Date} startDate - Start date for report
   * @param {Date} endDate - End date for report
   * @param {string} reportType - Type of report (hipaa, gdpr, general)
   */
  static async generateComplianceReport(startDate, endDate, reportType = 'general') {
    try {
      const report = {
        reportType,
        period: { start: startDate, end: endDate },
        generatedAt: new Date(),
        auditSummary: {},
        dataAccessSummary: {},
        complianceMetrics: {}
      };

      // Get audit logs summary
      const { data: auditSummary, error: auditError } = await supabase
        .from('audit_logs')
        .select('action, resource_type')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (auditError) {
        throw auditError;
      }

      // Group audit logs by action and resource type
      report.auditSummary = auditSummary.reduce((acc, log) => {
        const key = `${log.resource_type}_${log.action}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      // Get data access summary
      const { data: accessSummary, error: accessError } = await supabase
        .from('data_access_logs')
        .select('access_type, data_type, user_id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (accessError) {
        throw accessError;
      }

      // Group data access by type
      report.dataAccessSummary = accessSummary.reduce((acc, access) => {
        const key = `${access.data_type}_${access.access_type}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      // Calculate compliance metrics
      report.complianceMetrics = {
        totalAuditEvents: auditSummary.length,
        totalDataAccessEvents: accessSummary.length,
        uniqueUsersWithDataAccess: [...new Set(accessSummary.map(a => a.user_id))].length,
        dataExportEvents: accessSummary.filter(a => a.access_type === 'export').length,
        dataDeleteEvents: auditSummary.filter(a => a.action === 'delete').length
      };

      return report;
    } catch (error) {
      console.error('Generate compliance report error:', error);
      return null;
    }
  }

  /**
   * Export user data for GDPR compliance
   * @param {string} userId - User ID to export data for
   */
  static async exportUserData(userId) {
    try {
      // Log the data export action
      await this.logDataAccess(
        userId, 
        userId, 
        'export', 
        'full_profile', 
        'GDPR data export request',
        {}
      );

      // Get user profile data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) {
        throw userError;
      }

      // Get user appointments
      const { data: appointments, error: appointmentError } = await supabase
        .from('appointments')
        .select('*')
        .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`);

      if (appointmentError) {
        throw appointmentError;
      }

      // Get user research documents
      const { data: research, error: researchError } = await supabase
        .from('research_documents')
        .select('*')
        .eq('created_by', userId);

      if (researchError) {
        throw researchError;
      }

      // Get user timeslots (if doctor)
      const { data: timeslots, error: timeslotError } = await supabase
        .from('timeslots')
        .select('*')
        .eq('doctor_id', userId);

      if (timeslotError) {
        throw timeslotError;
      }

      // Get user notifications
      const { data: notifications, error: notificationError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId);

      if (notificationError) {
        throw notificationError;
      }

      const exportData = {
        exportDate: new Date(),
        userId: userId,
        userProfile: userData,
        appointments: appointments || [],
        researchDocuments: research || [],
        timeslots: timeslots || [],
        notifications: notifications || [],
        metadata: {
          exportReason: 'GDPR data portability request',
          dataRetentionPolicy: '7 years for medical data, 3 years for analytics'
        }
      };

      return exportData;
    } catch (error) {
      console.error('Export user data error:', error);
      return null;
    }
  }

  /**
   * Implement "Right to be Forgotten" - anonymize user data
   * @param {string} userId - User ID to anonymize
   * @param {string} requestorId - User making the request
   * @param {string} reason - Reason for data deletion
   */
  static async anonymizeUserData(userId, requestorId, reason = 'GDPR right to be forgotten') {
    try {
      // Log the data deletion action
      await this.logAction(
        requestorId,
        'anonymize_user_data',
        'user',
        userId,
        null,
        { reason: reason },
        {}
      );

      // Instead of deleting, anonymize the data to preserve referential integrity
      const anonymizedData = {
        email: `anonymized_${userId}@deleted.user`,
        first_name: 'Deleted',
        last_name: 'User',
        phone: null,
        company: null,
        license_number: null,
        specialization: null,
        bio: null,
        anonymized_at: new Date().toISOString(),
        anonymized_reason: reason
      };

      const { error: userError } = await supabase
        .from('users')
        .update(anonymizedData)
        .eq('id', userId);

      if (userError) {
        throw userError;
      }

      // Anonymize related appointment data
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({
          notes: 'Notes removed for privacy',
          feedback: null
        })
        .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`);

      if (appointmentError) {
        console.error('Error anonymizing appointments:', appointmentError);
      }

      // Remove research documents (but keep metadata for analytics)
      const { error: researchError } = await supabase
        .from('research_documents')
        .update({
          title: 'Removed for privacy',
          description: 'Document removed for privacy',
          tags: [],
          file_url: null,
          anonymized_at: new Date().toISOString()
        })
        .eq('created_by', userId);

      if (researchError) {
        console.error('Error anonymizing research:', researchError);
      }

      return { success: true, userId, anonymizedAt: new Date() };
    } catch (error) {
      console.error('Anonymize user data error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get audit statistics for compliance dashboard
   */
  static async getAuditStatistics() {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get counts for last 30 days
      const { count: auditCount30 } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last30Days.toISOString());

      const { count: accessCount30 } = await supabase
        .from('data_access_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last30Days.toISOString());

      // Get counts for last 7 days
      const { count: auditCount7 } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last7Days.toISOString());

      const { count: accessCount7 } = await supabase
        .from('data_access_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', last7Days.toISOString());

      return {
        last30Days: {
          auditEvents: auditCount30 || 0,
          dataAccessEvents: accessCount30 || 0
        },
        last7Days: {
          auditEvents: auditCount7 || 0,
          dataAccessEvents: accessCount7 || 0
        },
        complianceStatus: {
          hipaaCompliant: COMPLIANCE_CONFIG.hipaa.enabled,
          gdprCompliant: COMPLIANCE_CONFIG.gdpr.enabled,
          auditingEnabled: COMPLIANCE_CONFIG.hipaa.features.auditLogging
        }
      };
    } catch (error) {
      console.error('Get audit statistics error:', error);
      return null;
    }
  }
}

module.exports = AuditService; 