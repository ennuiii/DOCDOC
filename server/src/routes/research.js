import express from 'express';
import { authenticateSupabase, requireRole } from '../middleware/supabaseAuth.js';
import { validateRequest } from '../middleware/validation.js';
import {
  uploadResearch,
  getResearchDocuments,
  getResearchDocument,
  shareResearch,
  removeShare,
  updateResearch,
  deleteResearch,
  downloadResearch,
  getAvailableDoctors,
  upload
} from '../controllers/researchController.js';
import {
  uploadResearchValidator,
  shareResearchValidator,
  updateResearchValidator,
  idParamValidator
} from '../validators/researchValidators.js';

const router = express.Router();

// Get available doctors for sharing (pharma users)
router.get('/doctors', authenticateSupabase, requireRole(['pharma']), getAvailableDoctors);

// Get research documents (role-based filtering applied in controller)
router.get('/', authenticateSupabase, getResearchDocuments);

// Get single research document
router.get('/:id', authenticateSupabase, idParamValidator, validateRequest, getResearchDocument);

// Download research document
router.get('/:id/download', authenticateSupabase, idParamValidator, validateRequest, downloadResearch);

// Upload research document (pharma users only)
router.post(
  '/',
  authenticateSupabase,
  requireRole(['pharma']),
  upload.single('file'),
  uploadResearchValidator,
  validateRequest,
  uploadResearch
);

// Share research document (pharma users only)
router.post(
  '/:id/share',
  authenticateSupabase,
  requireRole(['pharma']),
  shareResearchValidator,
  validateRequest,
  shareResearch
);

// Update research document (pharma users only)
router.put(
  '/:id',
  authenticateSupabase,
  requireRole(['pharma']),
  updateResearchValidator,
  validateRequest,
  updateResearch
);

// Remove share (pharma users only)
router.delete(
  '/:id/share/:doctorId',
  authenticateSupabase,
  requireRole(['pharma']),
  idParamValidator,
  validateRequest,
  removeShare
);

// Delete research document (pharma users only)
router.delete(
  '/:id',
  authenticateSupabase,
  requireRole(['pharma']),
  idParamValidator,
  validateRequest,
  deleteResearch
);

export default router; 