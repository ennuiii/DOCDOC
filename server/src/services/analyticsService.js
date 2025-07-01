/**
 * Analytics Service
 * 
 * Provides analytics tracking functionality with hooks for future
 * dashboard and reporting features.
 */

const { supabase } = require('../config/supabase');
const { ANALYTICS_CONFIG } = require('../config/futureEnhancements');

class AnalyticsService {
  /**
   * Track user event for analytics
   * @param {string} userId - User ID
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event metadata
   * @param {Object} context - Request context (IP, user agent, etc.)
   */
  static async trackEvent(userId, eventType, eventData = {}, context = {}) {
    if (!ANALYTICS_CONFIG.enabled) {
      return;
    }

    try {
      const analyticsData = {
        user_id: userId,
        event_type: eventType,
        event_data: eventData,
        session_id: context.sessionId,
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
        page_url: context.pageUrl,
        referrer: context.referrer
      };

      const { error } = await supabase
        .from('user_analytics')
        .insert([analyticsData]);

      if (error) {
        console.error('Analytics tracking error:', error);
      }

      // Hook for future third-party analytics providers
      await this._sendToThirdPartyProviders(userId, eventType, eventData, context);
    } catch (error) {
      console.error('Analytics service error:', error);
    }
  }

  /**
   * Track appointment analytics
   * @param {string} appointmentId - Appointment ID
   * @param {string} eventType - Event type (booked, completed, etc.)
   * @param {Object} metrics - Appointment metrics
   */
  static async trackAppointmentEvent(appointmentId, eventType, metrics = {}) {
    if (!ANALYTICS_CONFIG.enabled) {
      return;
    }

    try {
      const analyticsData = {
        appointment_id: appointmentId,
        doctor_id: metrics.doctorId,
        pharma_id: metrics.pharmaId,
        event_type: eventType,
        duration_minutes: metrics.durationMinutes,
        completion_rating: metrics.completionRating,
        products_discussed: metrics.productsDiscussed || 0,
        research_shared: metrics.researchShared || 0,
        follow_up_scheduled: metrics.followUpScheduled || false,
        revenue_generated: metrics.revenueGenerated
      };

      const { error } = await supabase
        .from('appointment_analytics')
        .insert([analyticsData]);

      if (error) {
        console.error('Appointment analytics error:', error);
      }
    } catch (error) {
      console.error('Appointment analytics service error:', error);
    }
  }

  /**
   * Track research document analytics
   * @param {string} researchId - Research document ID
   * @param {string} userId - User ID
   * @param {string} actionType - Action type (viewed, downloaded, etc.)
   * @param {Object} metrics - Research metrics
   */
  static async trackResearchEvent(researchId, userId, actionType, metrics = {}) {
    if (!ANALYTICS_CONFIG.enabled) {
      return;
    }

    try {
      const analyticsData = {
        research_id: researchId,
        user_id: userId,
        action_type: actionType,
        view_duration_seconds: metrics.viewDurationSeconds,
        download_count: metrics.downloadCount || 0,
        share_count: metrics.shareCount || 0,
        engagement_score: metrics.engagementScore
      };

      const { error } = await supabase
        .from('research_analytics')
        .insert([analyticsData]);

      if (error) {
        console.error('Research analytics error:', error);
      }
    } catch (error) {
      console.error('Research analytics service error:', error);
    }
  }

  /**
   * Get user engagement metrics (for future dashboard)
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date for metrics
   * @param {Date} endDate - End date for metrics
   */
  static async getUserEngagement(userId, startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('user_engagement_summary')
        .select('*')
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return data[0] || null;
    } catch (error) {
      console.error('Get user engagement error:', error);
      return null;
    }
  }

  /**
   * Get appointment metrics (for future dashboard)
   * @param {Object} filters - Filter criteria
   */
  static async getAppointmentMetrics(filters = {}) {
    try {
      let query = supabase
        .from('monthly_appointment_metrics')
        .select('*');

      if (filters.startDate) {
        query = query.gte('month', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('month', filters.endDate);
      }

      const { data, error } = await query.order('month', { ascending: false });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get appointment metrics error:', error);
      return [];
    }
  }

  /**
   * Get research analytics (for future dashboard)
   * @param {Object} filters - Filter criteria
   */
  static async getResearchMetrics(filters = {}) {
    try {
      let query = supabase
        .from('research_analytics')
        .select(`
          *,
          research_documents(title, category),
          users(email, role)
        `);

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters.limit || 100);

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Get research metrics error:', error);
      return [];
    }
  }

  /**
   * Send analytics to third-party providers (placeholder for future)
   * @private
   */
  static async _sendToThirdPartyProviders(userId, eventType, eventData, context) {
    // Google Analytics 4 integration (future)
    if (ANALYTICS_CONFIG.providers.googleAnalytics.enabled) {
      // TODO: Implement GA4 tracking
    }

    // Mixpanel integration (future)
    if (ANALYTICS_CONFIG.providers.mixpanel.enabled) {
      // TODO: Implement Mixpanel tracking
    }
  }

  /**
   * Cleanup old analytics data (for data retention compliance)
   * @param {number} retentionDays - Number of days to retain data
   */
  static async cleanupOldData(retentionDays = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Clean up user analytics
      await supabase
        .from('user_analytics')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      // Clean up appointment analytics (keep longer for business insights)
      const appointmentCutoff = new Date();
      appointmentCutoff.setDate(appointmentCutoff.getDate() - (retentionDays * 2));
      
      await supabase
        .from('appointment_analytics')
        .delete()
        .lt('created_at', appointmentCutoff.toISOString());

      console.log('Analytics data cleanup completed');
    } catch (error) {
      console.error('Analytics cleanup error:', error);
    }
  }
}

module.exports = AnalyticsService; 