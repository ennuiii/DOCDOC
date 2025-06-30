import { body, query, param } from 'express-validator';

// Validate time format (HH:MM)
const timeFormatValidator = (field) => 
  body(field)
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage(`${field} must be in HH:MM format`);

// Create timeslot validator
export const createTimeslotValidator = [
  body('date')
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required'),
  timeFormatValidator('startTime'),
  timeFormatValidator('endTime'),
  body('type')
    .optional()
    .isIn(['pharma', 'patient', 'general'])
    .withMessage('Invalid timeslot type'),
  body('maxBookings')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max bookings must be between 1 and 10'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('recurringRule.type')
    .optional()
    .isIn(['none', 'daily', 'weekly', 'monthly'])
    .withMessage('Invalid recurrence type'),
  body('recurringRule.endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid end date is required for recurring timeslots'),
  body('recurringRule.daysOfWeek')
    .optional()
    .isArray()
    .withMessage('Days of week must be an array'),
  body('recurringRule.daysOfWeek.*')
    .optional()
    .isInt({ min: 0, max: 6 })
    .withMessage('Day of week must be between 0 (Sunday) and 6 (Saturday)'),
  body('recurringRule.dayOfMonth')
    .optional()
    .isInt({ min: 1, max: 31 })
    .withMessage('Day of month must be between 1 and 31')
];

// Update timeslot validator
export const updateTimeslotValidator = [
  param('id')
    .isMongoId()
    .withMessage('Valid timeslot ID is required'),
  body('date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required'),
  body('startTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('type')
    .optional()
    .isIn(['pharma', 'patient', 'general'])
    .withMessage('Invalid timeslot type'),
  body('maxBookings')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max bookings must be between 1 and 10'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('status')
    .optional()
    .isIn(['available', 'booked', 'blocked', 'cancelled'])
    .withMessage('Invalid status')
];

// Get timeslots query validator
export const getTimeslotsValidator = [
  query('doctorId')
    .optional()
    .isMongoId()
    .withMessage('Valid doctor ID is required'),
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
  query('status')
    .optional()
    .isIn(['available', 'booked', 'blocked', 'cancelled'])
    .withMessage('Invalid status'),
  query('type')
    .optional()
    .isIn(['pharma', 'patient', 'general'])
    .withMessage('Invalid timeslot type'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Bulk create validator
export const bulkCreateTimeslotsValidator = [
  body('timeslots')
    .isArray({ min: 1, max: 50 })
    .withMessage('Timeslots must be an array with 1-50 items'),
  body('timeslots.*.date')
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required for each timeslot'),
  body('timeslots.*.startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('timeslots.*.endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('timeslots.*.type')
    .optional()
    .isIn(['pharma', 'patient', 'general'])
    .withMessage('Invalid timeslot type'),
  body('timeslots.*.maxBookings')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max bookings must be between 1 and 10'),
  body('timeslots.*.notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// ID parameter validator
export const idParamValidator = [
  param('id')
    .isMongoId()
    .withMessage('Valid timeslot ID is required')
]; 