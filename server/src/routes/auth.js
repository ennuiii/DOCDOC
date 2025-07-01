import express from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validation.js';
import { authenticateSupabase } from '../middleware/supabaseAuth.js';
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  requestPasswordReset,
  resetPassword
} from '../controllers/supabaseAuthController.js';

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .isIn(['doctor', 'pharma', 'staff', 'admin'])
    .withMessage('Invalid role'),
  body('firstName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  // Conditional validations for role-specific fields
  body('specialization')
    .if(body('role').equals('doctor'))
    .notEmpty()
    .withMessage('Specialization is required for doctors'),
  body('licenseNumber')
    .if(body('role').equals('doctor'))
    .notEmpty()
    .withMessage('License number is required for doctors'),
  body('clinicName')
    .if(body('role').equals('doctor'))
    .notEmpty()
    .withMessage('Clinic name is required for doctors'),
  body('companyName')
    .if(body('role').equals('pharma'))
    .notEmpty()
    .withMessage('Company name is required for pharma representatives'),
  body('companyRegistration')
    .if(body('role').equals('pharma'))
    .notEmpty()
    .withMessage('Company registration is required for pharma representatives'),
  body('assignedDoctorId')
    .if(body('role').equals('staff'))
    .isUUID()
    .withMessage('Valid assigned doctor ID is required for staff')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number')
];

const passwordResetValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
];

const resetPasswordValidation = [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('accessToken')
    .notEmpty()
    .withMessage('Access token is required')
];

// Routes
router.post('/register', registerValidation, validateRequest, register);
router.post('/login', loginValidation, validateRequest, login);
router.post('/logout', logout);
router.get('/profile', authenticateSupabase, getProfile);
router.put('/profile', authenticateSupabase, updateProfileValidation, validateRequest, updateProfile);
router.post('/request-password-reset', passwordResetValidation, validateRequest, requestPasswordReset);
router.post('/reset-password', resetPasswordValidation, validateRequest, resetPassword);

export default router; 