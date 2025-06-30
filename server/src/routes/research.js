import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  upload,
  uploadResearch,
  getResearchDocuments,
  getResearchDocument,
  shareResearch,
  removeShare,
  updateResearch,
  deleteResearch,
  downloadResearch,
  getAvailableDoctors,
} from '../controllers/researchController.js';
import {
  uploadResearchValidator,
  getResearchDocumentsValidator,
  shareResearchValidator,
  updateResearchValidator,
  idParamValidator,
  removeShareValidator,
  getAvailableDoctorsValidator,
} from '../validators/researchValidators.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get available doctors for sharing (pharma only)
router.get(
  '/doctors',
  checkPermission('research:upload'),
  getAvailableDoctorsValidator,
  validate,
  getAvailableDoctors
);

// Get research documents
router.get(
  '/',
  checkPermission('research:read'),
  getResearchDocumentsValidator,
  validate,
  getResearchDocuments
);

// Upload research document (pharma only)
router.post(
  '/',
  checkPermission('research:upload'),
  upload.single('file'),
  uploadResearchValidator,
  validate,
  uploadResearch
);

// Get single research document
router.get(
  '/:id',
  checkPermission('research:read'),
  idParamValidator,
  validate,
  getResearchDocument
);

// Update research document (owner only)
router.put(
  '/:id',
  checkPermission('research:upload'),
  updateResearchValidator,
  validate,
  updateResearch
);

// Delete research document (owner only)
router.delete(
  '/:id',
  checkPermission('research:upload'),
  idParamValidator,
  validate,
  deleteResearch
);

// Share research document (owner only)
router.post(
  '/:id/share',
  checkPermission('research:share'),
  shareResearchValidator,
  validate,
  shareResearch
);

// Remove share (owner only)
router.delete(
  '/:id/share/:doctorId',
  checkPermission('research:share'),
  removeShareValidator,
  validate,
  removeShare
);

// Download research document
router.get(
  '/:id/download',
  checkPermission('research:read'),
  idParamValidator,
  validate,
  downloadResearch
);

export default router; 