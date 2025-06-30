import express from 'express';
import { 
  register, 
  login, 
  refreshToken, 
  logout, 
  getMe,
  verifyEmail 
} from '../controllers/authController.js';
import { 
  registerValidator, 
  loginValidator, 
  refreshTokenValidator 
} from '../validators/authValidators.js';
import { validate } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', registerValidator, validate, register);
router.post('/login', loginValidator, validate, login);
router.post('/refresh-token', refreshTokenValidator, validate, refreshToken);
router.get('/verify-email/:token', verifyEmail);

// Protected routes
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

export default router; 