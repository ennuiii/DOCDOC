import { body, query, param } from 'express-validator';

// Create appointment validator
export const createAppointmentValidator = [
  body('timeslotId')
    .isMongoId()
    .withMessage('Valid timeslot ID is required'),
  body('purpose')
    .notEmpty()
    .withMessage('Purpose is required')
    .isLength({ max: 200 })
    .withMessage('Purpose cannot exceed 200 characters'),
  body('products')
    .optional()
    .isArray()
    .withMessage('Products must be an array'),
  body('products.*.name')
    .notEmpty()
    .withMessage('Product name is required'),
  body('products.*.category')
    .optional()
    .isIn(['prescription', 'otc', 'vaccine', 'medical-device', 'other'])
    .withMessage('Invalid product category'),
  body('products.*.description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Product description cannot exceed 500 characters'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  body('meetingType')
    .optional()
    .isIn(['in-person', 'virtual', 'phone'])
    .withMessage('Invalid meeting type')
];

// Update appointment validator
export const updateAppointmentValidator = [
  param('id')
    .isMongoId()
    .withMessage('Valid appointment ID is required'),
  body('purpose')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Purpose cannot exceed 200 characters'),
  body('products')
    .optional()
    .isArray()
    .withMessage('Products must be an array'),
  body('products.*.name')
    .optional()
    .notEmpty()
    .withMessage('Product name is required'),
  body('products.*.category')
    .optional()
    .isIn(['prescription', 'otc', 'vaccine', 'medical-device', 'other'])
    .withMessage('Invalid product category'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  body('meetingType')
    .optional()
    .isIn(['in-person', 'virtual', 'phone'])
    .withMessage('Invalid meeting type'),
  body('meetingLink')
    .optional()
    .isURL()
    .withMessage('Meeting link must be a valid URL')
];

// Get appointments query validator
export const getAppointmentsValidator = [
  query('status')
    .optional()
    .isIn(['scheduled', 'confirmed', 'completed', 'cancelled', 'no-show'])
    .withMessage('Invalid status'),
  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid start date is required'),
  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid end date is required'),
  query('doctorId')
    .optional()
    .isMongoId()
    .withMessage('Valid doctor ID is required'),
  query('pharmaRepId')
    .optional()
    .isMongoId()
    .withMessage('Valid pharma rep ID is required'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Get available timeslots validator
export const getAvailableTimeslotsValidator = [
  query('doctorId')
    .optional()
    .isMongoId()
    .withMessage('Valid doctor ID is required'),
  query('specialization')
    .optional()
    .notEmpty()
    .withMessage('Specialization cannot be empty'),
  query('date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required'),
  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid start date is required'),
  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid end date is required'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Cancel appointment validator
export const cancelAppointmentValidator = [
  param('id')
    .isMongoId()
    .withMessage('Valid appointment ID is required'),
  body('reason')
    .notEmpty()
    .withMessage('Cancellation reason is required')
    .isLength({ max: 500 })
    .withMessage('Cancellation reason cannot exceed 500 characters')
];

// Add feedback validator
export const addFeedbackValidator = [
  param('id')
    .isMongoId()
    .withMessage('Valid appointment ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters')
];

// ID parameter validator
export const idParamValidator = [
  param('id')
    .isMongoId()
    .withMessage('Valid appointment ID is required')
]; 