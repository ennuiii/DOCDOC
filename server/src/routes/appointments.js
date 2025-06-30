import express from 'express';
import { authenticate, authorize, checkPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
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
  getAppointmentsValidator,
  createAppointmentValidator,
  updateAppointmentValidator,
  cancelAppointmentValidator,
  addFeedbackValidator,
  getAvailableTimeslotsValidator,
  idParamValidator
} from '../validators/appointmentValidators.js';

const router = express.Router();

// Get dashboard statistics
router.get(
  '/stats',
  authenticate,
  checkPermission('appointment:read'),
  getDashboardStats
);

// Get available timeslots for booking (pharma view)
router.get(
  '/available-timeslots',
  authenticate,
  checkPermission('appointment:create'),
  getAvailableTimeslotsValidator,
  validate,
  getAvailableTimeslots
);

// Get appointments
router.get(
  '/', 
  authenticate, 
  checkPermission('appointment:read'),
  getAppointmentsValidator,
  validate,
  getAppointments
);

// Get single appointment
router.get(
  '/:id',
  authenticate,
  checkPermission('appointment:read'),
  idParamValidator,
  validate,
  getAppointment
);

// Book appointment (pharma only)
router.post(
  '/', 
  authenticate, 
  checkPermission('appointment:create'),
  createAppointmentValidator,
  validate,
  createAppointment
);

// Update appointment
router.put(
  '/:id', 
  authenticate, 
  checkPermission('appointment:update'),
  updateAppointmentValidator,
  validate,
  updateAppointment
);

// Cancel appointment
router.delete(
  '/:id', 
  authenticate, 
  checkPermission('appointment:delete'),
  cancelAppointmentValidator,
  validate,
  cancelAppointment
);

// Confirm appointment (doctors only)
router.post(
  '/:id/confirm',
  authenticate,
  authorize(['doctor']),
  idParamValidator,
  validate,
  confirmAppointment
);

// Complete appointment
router.post(
  '/:id/complete',
  authenticate,
  checkPermission('appointment:update'),
  idParamValidator,
  validate,
  completeAppointment
);

// Add feedback
router.post(
  '/:id/feedback',
  authenticate,
  checkPermission('appointment:update'),
  addFeedbackValidator,
  validate,
  addFeedback
);

export default router; 