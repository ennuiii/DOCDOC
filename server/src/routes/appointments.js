import express from 'express';
import { authenticateSupabase, requireRole } from '../middleware/supabaseAuth.js';
import { validateRequest } from '../middleware/validation.js';
import {
  getAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  confirmAppointment,
  completeAppointment,
  getAvailableTimeslots,
  addFeedback,
  getDashboardStats
} from '../controllers/appointmentController.js';
import {
  createAppointmentValidator,
  updateAppointmentValidator,
  cancelAppointmentValidator,
  addFeedbackValidator,
  idParamValidator
} from '../validators/appointmentValidators.js';

const router = express.Router();

// Get dashboard statistics (all authenticated users)
router.get('/dashboard-stats', authenticateSupabase, getDashboardStats);

// Get available timeslots for booking (pharma users mainly)
router.get('/available-timeslots', authenticateSupabase, getAvailableTimeslots);

// Get all appointments (role-based filtering applied in controller)
router.get('/', authenticateSupabase, getAppointments);

// Get single appointment
router.get('/:id', authenticateSupabase, idParamValidator, validateRequest, getAppointment);

// Create appointment (pharma users only)
router.post(
  '/',
  authenticateSupabase,
  requireRole(['pharma']),
  createAppointmentValidator,
  validateRequest,
  createAppointment
);

// Update appointment (doctors and pharma users) - PUT and PATCH both supported
router.put(
  '/:id',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  updateAppointmentValidator,
  validateRequest,
  updateAppointment
);

router.patch(
  '/:id',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  updateAppointmentValidator,
  validateRequest,
  updateAppointment
);

// Update appointment status (doctors and pharma users)
router.patch(
  '/:id/status',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  idParamValidator,
  validateRequest,
  updateAppointment
);

// Confirm appointment (doctors only) - PUT and PATCH both supported
router.put(
  '/:id/confirm',
  authenticateSupabase,
  requireRole(['doctor']),
  idParamValidator,
  validateRequest,
  confirmAppointment
);

router.patch(
  '/:id/confirm',
  authenticateSupabase,
  requireRole(['doctor']),
  idParamValidator,
  validateRequest,
  confirmAppointment
);

// Cancel appointment (doctors and pharma users) - PUT and PATCH both supported
router.put(
  '/:id/cancel',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  cancelAppointmentValidator,
  validateRequest,
  cancelAppointment
);

router.patch(
  '/:id/cancel',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  cancelAppointmentValidator,
  validateRequest,
  cancelAppointment
);

// Complete appointment (doctors and pharma users)
router.put(
  '/:id/complete',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  idParamValidator,
  validateRequest,
  completeAppointment
);

// Add feedback to appointment (doctors and pharma users)
router.post(
  '/:id/feedback',
  authenticateSupabase,
  requireRole(['doctor', 'pharma']),
  addFeedbackValidator,
  validateRequest,
  addFeedback
);

export default router; 