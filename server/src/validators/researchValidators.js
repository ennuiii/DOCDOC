import { body, param, query } from 'express-validator';

export const uploadResearchValidator = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be less than 200 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('category')
    .optional()
    .isIn(['clinical-trial', 'product-info', 'safety-data', 'efficacy-study', 'market-research', 'other'])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isString().withMessage('Tags must be a string'),
  body('isPublic')
    .optional()
    .isIn(['true', 'false']).withMessage('isPublic must be true or false'),
];

export const getResearchDocumentsValidator = [
  query('category')
    .optional()
    .isIn(['clinical-trial', 'product-info', 'safety-data', 'efficacy-study', 'market-research', 'other'])
    .withMessage('Invalid category'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

export const shareResearchValidator = [
  param('id')
    .isMongoId().withMessage('Invalid document ID'),
  body('doctorIds')
    .isArray({ min: 1 }).withMessage('doctorIds must be a non-empty array')
    .custom((value) => {
      return value.every(id => /^[0-9a-fA-F]{24}$/.test(id));
    }).withMessage('All doctor IDs must be valid MongoDB ObjectIds'),
  body('accessLevel')
    .optional()
    .isIn(['view', 'download']).withMessage('Access level must be view or download'),
];

export const updateResearchValidator = [
  param('id')
    .isMongoId().withMessage('Invalid document ID'),
  body('title')
    .optional()
    .trim()
    .notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 200 }).withMessage('Title must be less than 200 characters'),
  body('description')
    .optional()
    .trim()
    .notEmpty().withMessage('Description cannot be empty')
    .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('category')
    .optional()
    .isIn(['clinical-trial', 'product-info', 'safety-data', 'efficacy-study', 'market-research', 'other'])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isString().withMessage('Tags must be a string'),
  body('isPublic')
    .optional()
    .isIn(['true', 'false']).withMessage('isPublic must be true or false'),
];

export const idParamValidator = [
  param('id')
    .isMongoId().withMessage('Invalid document ID'),
];

export const removeShareValidator = [
  param('id')
    .isMongoId().withMessage('Invalid document ID'),
  param('doctorId')
    .isMongoId().withMessage('Invalid doctor ID'),
];

export const getAvailableDoctorsValidator = [
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1 }).withMessage('Search query must not be empty'),
  query('specialization')
    .optional()
    .isIn(['general-practice', 'cardiology', 'dermatology', 'endocrinology', 'gastroenterology', 'neurology', 'oncology', 'pediatrics', 'psychiatry', 'other'])
    .withMessage('Invalid specialization'),
]; 