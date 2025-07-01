import express from 'express';
import { authenticateSupabase, requireRole } from '../middleware/supabaseAuth.js';
import { validateRequest } from '../middleware/validation.js';
import {
  getTimeslots,
  getTimeslot,
  createTimeslot,
  updateTimeslot,
  deleteTimeslot,
  bulkCreateTimeslots
} from '../controllers/timeslotController.js';
import {
  getTimeslotsValidator,
  createTimeslotValidator,
  updateTimeslotValidator,
  bulkCreateTimeslotsValidator,
  idParamValidator
} from '../validators/timeslotValidators.js';

const router = express.Router();

// Get available timeslots (all authenticated users can view)
router.get(
  '/', 
  authenticateSupabase,
  getTimeslotsValidator,
  validateRequest,
  getTimeslots
);

// Get single timeslot (all authenticated users can view)
router.get(
  '/:id',
  authenticateSupabase,
  idParamValidator,
  validateRequest,
  getTimeslot
);

// Create timeslot (doctors only)
router.post(
  '/', 
  authenticateSupabase, 
  requireRole(['doctor']),
  createTimeslotValidator,
  validateRequest,
  createTimeslot
);

// Bulk create timeslots (doctors only)
router.post(
  '/bulk',
  authenticateSupabase,
  requireRole(['doctor']),
  bulkCreateTimeslotsValidator,
  validateRequest,
  bulkCreateTimeslots
);

// Update timeslot (doctors only)
router.put(
  '/:id', 
  authenticateSupabase, 
  requireRole(['doctor']),
  updateTimeslotValidator,
  validateRequest,
  updateTimeslot
);

// Delete timeslot (doctors only)
router.delete(
  '/:id', 
  authenticateSupabase, 
  requireRole(['doctor']),
  idParamValidator,
  validateRequest,
  deleteTimeslot
);

export default router; 