import express from 'express';
import { authenticateSupabase } from '../middleware/supabaseAuth.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
} from '../controllers/notificationController.js';

const router = express.Router();

// All routes require Supabase authentication
router.use(authenticateSupabase);

// Get notifications
router.get('/', getNotifications);

// Get unread count
router.get('/unread-count', getUnreadCount);

// Mark all as read
router.put('/mark-all-read', markAllAsRead);

// Mark specific notification as read
router.put('/:id/read', markAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

export default router; 