import express from 'express';
import { authenticate, authorize, checkPermission } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
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

// Get available timeslots
router.get(
  '/', 
  authenticate, 
  checkPermission('timeslot:read'),
  getTimeslotsValidator,
  validate,
  getTimeslots
);

// Get single timeslot
router.get(
  '/:id',
  authenticate,
  checkPermission('timeslot:read'),
  idParamValidator,
  validate,
  getTimeslot
);

// Create timeslot (doctors only)
router.post(
  '/', 
  authenticate, 
  checkPermission('timeslot:create'),
  createTimeslotValidator,
  validate,
  createTimeslot
);

// Bulk create timeslots (doctors only)
router.post(
  '/bulk',
  authenticate,
  checkPermission('timeslot:create'),
  bulkCreateTimeslotsValidator,
  validate,
  bulkCreateTimeslots
);

// Update timeslot
router.put(
  '/:id', 
  authenticate, 
  checkPermission('timeslot:update'),
  updateTimeslotValidator,
  validate,
  updateTimeslot
);

// Delete timeslot
router.delete(
  '/:id', 
  authenticate, 
  checkPermission('timeslot:delete'),
  idParamValidator,
  validate,
  deleteTimeslot
);

export default router; 