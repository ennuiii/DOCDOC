import { supabaseAdmin } from '../config/supabase.js';

// Get notifications for the current user
export const getNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unread,
      type,
    } = req.query;

    const supabase = supabaseAdmin();
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', req.user.id);

    // Filter by read status
    if (unread !== undefined) {
      query = query.eq('read', unread === 'true' ? false : true);
    }

    // Filter by type
    if (type) {
      query = query.eq('type', type);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Execute query
    const { data: notifications, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Get notifications error:', error);
      throw error;
    }

    // Get unread count
    const { count: unreadCount, error: unreadError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', req.user.id)
      .eq('read', false);

    if (unreadError) {
      console.error('Get unread count error:', unreadError);
    }

    res.json({
      success: true,
      notifications: notifications || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
      unreadCount: unreadCount || 0,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      details: error.message
    });
  }
};

// Mark single notification as read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = supabaseAdmin();

    // Check if notification belongs to user
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .eq('recipient_id', req.user.id)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Mark as read
    const { error: updateError } = await supabase
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      details: error.message
    });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const supabase = supabaseAdmin();

    const { error } = await supabase
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('recipient_id', req.user.id)
      .eq('read', false);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      details: error.message
    });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = supabaseAdmin();

    // Check if notification belongs to user
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .eq('recipient_id', req.user.id)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Delete notification
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      details: error.message
    });
  }
};

// Get notification statistics
export const getNotificationStats = async (req, res) => {
  try {
    const supabase = supabaseAdmin();

    // Get counts by type and read status
    const { data: stats, error } = await supabase
      .from('notifications')
      .select('type, read')
      .eq('recipient_id', req.user.id);

    if (error) {
      throw error;
    }

    // Calculate statistics
    const notificationStats = {
      total: stats.length,
      unread: stats.filter(n => !n.read).length,
      read: stats.filter(n => n.read).length,
      byType: {}
    };

    // Group by type
    stats.forEach(notification => {
      if (!notificationStats.byType[notification.type]) {
        notificationStats.byType[notification.type] = {
          total: 0,
          unread: 0,
          read: 0
        };
      }
      
      notificationStats.byType[notification.type].total++;
      
      if (notification.read) {
        notificationStats.byType[notification.type].read++;
      } else {
        notificationStats.byType[notification.type].unread++;
      }
    });

    res.json({
      success: true,
      stats: notificationStats
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification statistics',
      details: error.message
    });
  }
};

// Get unread count only
export const getUnreadCount = async (req, res) => {
  try {
    const supabase = supabaseAdmin();

    // Get unread count
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', req.user.id)
      .eq('read', false);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      unreadCount: count || 0
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
      details: error.message
    });
  }
};

// Create notification (internal use by notification service)
export const createNotification = async (req, res) => {
  try {
    const {
      recipientId,
      type,
      title,
      message,
      data,
      priority = 'medium'
    } = req.body;

    const supabase = supabaseAdmin();

    // Create notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        recipient_id: recipientId,
        type,
        title,
        message,
        data: data || {},
        priority,
        read: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create notification',
      details: error.message
    });
  }
};

// Clear old notifications (cleanup endpoint)
export const clearOldNotifications = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const supabase = supabaseAdmin();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('recipient_id', req.user.id)
      .eq('read', true)
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: `Cleared read notifications older than ${days} days`
    });
  } catch (error) {
    console.error('Clear old notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear old notifications',
      details: error.message
    });
  }
}; 