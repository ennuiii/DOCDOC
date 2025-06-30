import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Update user profile
router.put('/profile', authenticate, (req, res) => {
  res.json({ message: 'Profile update endpoint - to be implemented' });
});

// Admin routes
router.get('/', authenticate, authorize('admin'), (req, res) => {
  res.json({ message: 'List users endpoint - to be implemented' });
});

export default router; 