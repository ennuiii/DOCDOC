import express from 'express';
import { authenticateSupabase, requireRole } from '../middleware/supabaseAuth.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateSupabase, (req, res) => {
  res.json({ user: req.user });
});

// Update user profile
router.put('/profile', authenticateSupabase, (req, res) => {
  res.json({ message: 'Profile update endpoint - to be implemented' });
});

// Admin routes
router.get('/', authenticateSupabase, requireRole(['admin']), (req, res) => {
  res.json({ message: 'List users endpoint - to be implemented' });
});

export default router; 