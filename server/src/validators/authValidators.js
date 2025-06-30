import { body } from 'express-validator';
import { authConfig } from '../config/auth.js';

export const registerValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('role')
    .isIn(Object.values(authConfig.roles))
    .withMessage('Invalid role specified'),
  body('profile.firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('profile.lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('profile.phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  // Doctor-specific validations
  body('profile.specialization')
    .if(body('role').equals('doctor'))
    .notEmpty()
    .withMessage('Specialization is required for doctors'),
  body('profile.licenseNumber')
    .if(body('role').equals('doctor'))
    .notEmpty()
    .withMessage('License number is required for doctors'),
  body('profile.clinicName')
    .if(body('role').equals('doctor'))
    .notEmpty()
    .withMessage('Clinic name is required for doctors'),
  
  // Pharma-specific validations
  body('profile.companyName')
    .if(body('role').equals('pharma'))
    .notEmpty()
    .withMessage('Company name is required for pharma users'),
  body('profile.companyRegistration')
    .if(body('role').equals('pharma'))
    .notEmpty()
    .withMessage('Company registration is required for pharma users'),
  
  // Staff-specific validations
  body('profile.assignedDoctor')
    .if(body('role').equals('staff'))
    .isMongoId()
    .withMessage('Valid doctor ID is required for staff members')
];

export const loginValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

export const refreshTokenValidator = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
]; 