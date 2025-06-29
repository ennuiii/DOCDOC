const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const TimeSlot = require('../models/TimeSlot');
const Appointment = require('../models/Appointment'); // Needed for managing appointments later
const User = require('../models/User'); // For staff management later
const ClinicStaffProfile = require('../models/ClinicStaffProfile'); // For staff management
const WorkSchedule = require('../models/WorkSchedule'); // For work schedules
const ResearchDocument = require('../models/ResearchDocument'); // For viewing research

// Middleware to ensure only doctors can access these routes
router.use(protect); // All routes below require login
router.use(authorize(['doctor'])); // All routes below require 'doctor' role

// ------------------ TimeSlot Management ------------------

/**
 * @route   POST /api/doctors/timeslots
 * @desc    Create a new timeslot for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.post('/timeslots', async (req, res) => {
    const { startTime, endTime, notes } = req.body;

    if (!startTime || !endTime) {
        return res.status(400).json({ message: 'Start time and end time are required.' });
    }

    // Validate that startTime is before endTime
    if (new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ message: 'Start time must be before end time.' });
    }

    // Validate that startTime is in the future
    if (new Date(startTime) <= new Date()) {
        return res.status(400).json({ message: 'Timeslot start time must be in the future.' });
    }

    try {
        const newTimeSlot = new TimeSlot({
            doctor: req.user.id, // Logged-in doctor's ID from protect middleware
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            notes: notes || ''
        });

        const savedTimeSlot = await newTimeSlot.save();
        res.status(201).json(savedTimeSlot);
    } catch (error) {
        console.error('Error creating timeslot:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error while creating timeslot.' });
    }
});

/**
 * @route   GET /api/doctors/timeslots
 * @desc    Get all timeslots for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.get('/timeslots', async (req, res) => {
    try {
        // Optional query parameters for filtering, e.g., ?status=available&date=YYYY-MM-DD
        const query = { doctor: req.user.id };
        if (req.query.status) {
            query.status = req.query.status;
        }
        if (req.query.date) {
            // Filter by specific date (startTime should be within that day)
            const targetDate = new Date(req.query.date);
            const nextDay = new Date(targetDate);
            nextDay.setDate(targetDate.getDate() + 1);
            query.startTime = { $gte: targetDate, $lt: nextDay };
        }


        const timeSlots = await TimeSlot.find(query).sort({ startTime: 'asc' }); // Sort by start time
        res.json(timeSlots);
    } catch (error) {
        console.error('Error fetching timeslots:', error.message);
        res.status(500).json({ message: 'Server error while fetching timeslots.' });
    }
});

/**
 * @route   GET /api/doctors/timeslots/:timeslotId
 * @desc    Get a specific timeslot by ID for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.get('/timeslots/:timeslotId', async (req, res) => {
    try {
        const timeSlot = await TimeSlot.findOne({
            _id: req.params.timeslotId,
            doctor: req.user.id
        });

        if (!timeSlot) {
            return res.status(404).json({ message: 'Timeslot not found or not owned by this doctor.' });
        }
        res.json(timeSlot);
    } catch (error) {
        console.error('Error fetching specific timeslot:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Timeslot not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching timeslot.' });
    }
});


/**
 * @route   PUT /api/doctors/timeslots/:timeslotId
 * @desc    Update a timeslot for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.put('/timeslots/:timeslotId', async (req, res) => {
    const { startTime, endTime, status, notes } = req.body;

    try {
        let timeSlot = await TimeSlot.findOne({
            _id: req.params.timeslotId,
            doctor: req.user.id
        });

        if (!timeSlot) {
            return res.status(404).json({ message: 'Timeslot not found or not owned by this doctor.' });
        }

        // Doctors should generally not update timeslots that are already booked by pharma,
        // unless it's to cancel them (status: 'cancelled_by_doctor').
        // This logic can be refined.
        if (timeSlot.status === 'booked' && status !== 'cancelled_by_doctor' && status !== timeSlot.status) {
            // return res.status(400).json({ message: 'Booked timeslots cannot be modified directly, only cancelled by doctor.' });
        }

        // Update fields if provided
        if (startTime) timeSlot.startTime = new Date(startTime);
        if (endTime) timeSlot.endTime = new Date(endTime);
        if (status) timeSlot.status = status; // 'available', 'unavailable', 'cancelled_by_doctor'
        if (notes !== undefined) timeSlot.notes = notes;

        // Validate that startTime is before endTime if both are being updated
        if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
            return res.status(400).json({ message: 'Start time must be before end time.' });
        }
         // Validate that startTime is in the future if it's being updated
        if (startTime && new Date(startTime) <= new Date() && timeSlot.isModified('startTime')) {
             // Allow update if it's just changing status or notes of a past slot
            if ( (endTime && new Date(endTime) <= new Date()) && timeSlot.isModified('endTime') ) {
                // If both start and end are past, and they are modified, it's an issue
                // However, just updating notes/status of a past slot is fine.
                // This condition needs careful thought. For now, let's assume if startTime is updated, it must be future.
                 return res.status(400).json({ message: 'Timeslot start time must be in the future if being modified.' });
            }
        }


        const updatedTimeSlot = await timeSlot.save();
        res.json(updatedTimeSlot);
    } catch (error) {
        console.error('Error updating timeslot:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Timeslot not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while updating timeslot.' });
    }
});


/**
 * @route   DELETE /api/doctors/timeslots/:timeslotId
 * @desc    Delete a timeslot for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.delete('/timeslots/:timeslotId', async (req, res) => {
    try {
        const timeSlot = await TimeSlot.findOne({
            _id: req.params.timeslotId,
            doctor: req.user.id
        });

        if (!timeSlot) {
            return res.status(404).json({ message: 'Timeslot not found or not owned by this doctor.' });
        }

        // Business rule: Cannot delete a timeslot that is already booked.
        // It should be 'cancelled' instead.
        if (timeSlot.status === 'booked') {
            return res.status(400).json({ message: 'Booked timeslots cannot be deleted. Please cancel it instead.' });
        }

        // If there's an appointment associated with this timeslot (even if not 'booked' status, e.g. pending),
        // that appointment should probably be handled (e.g., rejected/cancelled).
        // For simplicity now, we just delete the timeslot.
        // Consider cascading effects on associated appointments if any.

        await timeSlot.deleteOne(); // or .remove() for older Mongoose
        res.json({ message: 'Timeslot deleted successfully.' });

    } catch (error) {
        console.error('Error deleting timeslot:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Timeslot not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deleting timeslot.' });
    }
});


// ------------------ Appointment Management (for Doctors) ------------------

/**
 * @route   GET /api/doctors/appointments
 * @desc    Get all appointments for the logged-in doctor, with optional status filter
 * @access  Private (Doctor only)
 * @query   status (e.g., 'pending_approval', 'approved', 'completed')
 * @query   date (YYYY-MM-DD, filters by appointmentDate)
 * @query   pharmaId (filter by a specific pharma concern User ID)
 */
router.get('/appointments', async (req, res) => {
    try {
        const query = { doctor: req.user.id };
        if (req.query.status) {
            query.status = req.query.status;
        }
        if (req.query.date) {
            const targetDate = new Date(req.query.date);
            const nextDay = new Date(targetDate);
            nextDay.setDate(targetDate.getDate() + 1);
            query.appointmentDate = { $gte: targetDate, $lt: nextDay };
        }
        if (req.query.pharmaId) {
            query.pharmaConcern = req.query.pharmaId;
        }

        const appointments = await Appointment.find(query)
            .populate('pharmaConcern', 'username email') // Populate pharma user details
            .populate('timeSlot', 'startTime endTime')   // Populate timeslot details
            .sort({ appointmentDate: 'asc' }); // Sort by appointment date

        res.json(appointments);
    } catch (error) {
        console.error('Error fetching doctor appointments:', error.message);
        res.status(500).json({ message: 'Server error while fetching appointments.' });
    }
});

/**
 * @route   GET /api/doctors/appointments/:appointmentId
 * @desc    Get a specific appointment by ID for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.get('/appointments/:appointmentId', async (req, res) => {
    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            doctor: req.user.id
        })
        .populate('pharmaConcern', 'username email companyName') // from PharmaProfile
        .populate({
            path: 'pharmaConcern',
            select: 'username email', // From User model
            populate: { path: 'pharmaProfile', select: 'companyName companyWebsite' } // Assuming pharmaProfile is a virtual or separate query
        })
        .populate('timeSlot');

        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found or not associated with this doctor.' });
        }
        res.json(appointment);
    } catch (error) {
        console.error('Error fetching specific appointment:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Appointment not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching appointment.' });
    }
});


/**
 * @route   PUT /api/doctors/appointments/:appointmentId/approve
 * @desc    Approve a pending appointment
 * @access  Private (Doctor only)
 */
router.put('/appointments/:appointmentId/approve', async (req, res) => {
    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            doctor: req.user.id,
            status: 'pending_approval' // Can only approve pending ones
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Pending appointment not found or not owned by this doctor.' });
        }

        appointment.status = 'approved';
        // Also update the corresponding timeslot status to 'booked'
        const timeSlot = await TimeSlot.findById(appointment.timeSlot);
        if (timeSlot && timeSlot.status === 'available') {
            timeSlot.status = 'booked';
            await timeSlot.save();
        } else if (timeSlot && timeSlot.status !== 'booked') {
            // Potentially the timeslot was already booked or cancelled by doctor. Handle this case.
            // For now, we'll proceed but this might indicate a race condition or stale data.
            console.warn(`Timeslot ${timeSlot._id} was not 'available' when approving appointment ${appointment._id}. Current status: ${timeSlot.status}`);
             timeSlot.status = 'booked'; // Ensure it's booked
            await timeSlot.save();
        }


        const updatedAppointment = await appointment.save();
        // TODO: Send notification to Pharma Concern
        res.json(updatedAppointment);
    } catch (error) {
        console.error('Error approving appointment:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Appointment not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while approving appointment.' });
    }
});

/**
 * @route   PUT /api/doctors/appointments/:appointmentId/reject
 * @desc    Reject a pending appointment
 * @access  Private (Doctor only)
 */
router.put('/appointments/:appointmentId/reject', async (req, res) => {
    const { rejectionReason } = req.body; // Optional reason

    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            doctor: req.user.id,
            status: 'pending_approval' // Can only reject pending ones
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Pending appointment not found or not owned by this doctor.' });
        }

        appointment.status = 'rejected_by_doctor';
        if (rejectionReason) {
            appointment.doctorNotes = `Rejection reason: ${rejectionReason}`; // Or a dedicated field
        }

        // The timeslot remains 'available' or whatever state it was in.
        // If the timeslot was specifically created for this, it might need cleanup or be made 'available'.
        // For now, assume timeslots are independent and can be reused.

        const updatedAppointment = await appointment.save();
        // TODO: Send notification to Pharma Concern
        res.json(updatedAppointment);
    } catch (error) {
        console.error('Error rejecting appointment:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Appointment not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while rejecting appointment.' });
    }
});

/**
 * @route   PUT /api/doctors/appointments/:appointmentId/cancel
 * @desc    Cancel an approved appointment by the doctor
 * @access  Private (Doctor only)
 */
router.put('/appointments/:appointmentId/cancel', async (req, res) => {
    const { cancellationReason } = req.body; // Optional

    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            doctor: req.user.id,
            status: { $in: ['approved', 'pending_approval'] } // Can cancel approved or even pending ones
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found, not owned by this doctor, or not in a cancellable state.' });
        }

        const previousStatus = appointment.status;
        appointment.status = 'cancelled_by_doctor';
        if (cancellationReason) {
            appointment.doctorNotes = (appointment.doctorNotes ? appointment.doctorNotes + '\n' : '') + `Cancellation reason: ${cancellationReason}`;
        }

        // If the appointment was 'approved' and linked to a 'booked' timeslot, make the timeslot 'available' again.
        if (previousStatus === 'approved') {
            const timeSlot = await TimeSlot.findById(appointment.timeSlot);
            if (timeSlot && timeSlot.status === 'booked') {
                timeSlot.status = 'available'; // Or 'cancelled_by_doctor' if we want to track that on timeslot
                await timeSlot.save();
            }
        }

        const updatedAppointment = await appointment.save();
        // TODO: Send notification to Pharma Concern
        res.json(updatedAppointment);
    } catch (error) {
        console.error('Error cancelling appointment by doctor:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Appointment not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while cancelling appointment.' });
    }
});


/**
 * @route   PUT /api/doctors/appointments/:appointmentId/complete
 * @desc    Mark an appointment as completed by the doctor
 * @access  Private (Doctor only)
 */
router.put('/appointments/:appointmentId/complete', async (req, res) => {
    const { doctorNotes } = req.body; // Optional notes after completion

    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            doctor: req.user.id,
            status: 'approved' // Can only complete approved appointments
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Approved appointment not found or not owned by this doctor.' });
        }

        // Ensure appointment time is in the past or very recent
        const appointmentTime = new Date(appointment.appointmentDate); // Assuming appointmentDate holds the start time
        if (appointmentTime > new Date()) {
            // return res.status(400).json({ message: 'Cannot mark a future appointment as completed.' });
            // Or allow it, depending on product requirements. For now, let's allow.
        }

        appointment.status = 'completed';
        if (doctorNotes) {
            appointment.doctorNotes = (appointment.doctorNotes ? appointment.doctorNotes + '\n' : '') + doctorNotes;
        }

        // The timeslot remains 'booked'. No change needed on timeslot status typically after completion.

        const updatedAppointment = await appointment.save();
        // TODO: Optionally, send notification/summary to Pharma Concern
        res.json(updatedAppointment);
    } catch (error) {
        console.error('Error completing appointment:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Appointment not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while completing appointment.' });
    }
});


// ------------------ Clinic Staff Management ------------------

/**
 * @route   POST /api/doctors/staff
 * @desc    Register a new staff member for the logged-in doctor's clinic
 * @access  Private (Doctor only)
 * @body    username, email, password, roleInClinic, contactPhoneNumber, permissions (array of strings)
 */
router.post('/staff', async (req, res) => {
    const { username, email, password, roleInClinic, contactPhoneNumber, permissions } = req.body;
    const doctorId = req.user.id; // Logged-in doctor

    if (!username || !email || !password || !roleInClinic) {
        return res.status(400).json({ message: 'Username, email, password, and role in clinic are required.' });
    }

    try {
        // Check if staff user already exists
        let existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email or username already exists.' });
        }

        // Create new User for the staff
        const newStaffUser = new User({
            username,
            email,
            password, // Will be hashed by pre-save hook
            role: 'clinic_staff',
            isActive: true // Staff active by default
        });
        await newStaffUser.save();

        // Create ClinicStaffProfile
        const staffProfile = new ClinicStaffProfile({
            user: newStaffUser._id,
            doctor: doctorId,
            roleInClinic,
            contactPhoneNumber: contactPhoneNumber || '',
            permissions: permissions || []
        });
        await staffProfile.save();

        // Exclude password from the returned user object
        const staffUserToReturn = newStaffUser.toObject();
        delete staffUserToReturn.password;

        res.status(201).json({
            message: 'Clinic staff registered successfully.',
            user: staffUserToReturn,
            profile: staffProfile
        });

    } catch (error) {
        console.error('Error registering clinic staff:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        // If user creation succeeded but profile failed, consider cleanup. For now, simple error.
        res.status(500).json({ message: 'Server error while registering clinic staff.' });
    }
});


/**
 * @route   GET /api/doctors/staff
 * @desc    Get all staff members for the logged-in doctor
 * @access  Private (Doctor only)
 */
router.get('/staff', async (req, res) => {
    try {
        const staffProfiles = await ClinicStaffProfile.find({ doctor: req.user.id })
            .populate('user', 'username email isActive createdAt'); // Populate user details, exclude password

        res.json(staffProfiles);
    } catch (error) {
        console.error('Error fetching clinic staff:', error.message);
        res.status(500).json({ message: 'Server error while fetching clinic staff.' });
    }
});

/**
 * @route   GET /api/doctors/staff/:staffUserId
 * @desc    Get details of a specific staff member by their User ID
 * @access  Private (Doctor only)
 */
router.get('/staff/:staffUserId', async (req, res) => {
    try {
        const staffProfile = await ClinicStaffProfile.findOne({
            user: req.params.staffUserId,
            doctor: req.user.id
        }).populate('user', 'username email isActive createdAt');

        if (!staffProfile) {
            return res.status(404).json({ message: 'Staff member not found or not associated with this doctor.' });
        }
        res.json(staffProfile);
    } catch (error) {
        console.error('Error fetching specific staff member:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Staff member not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching staff member.' });
    }
});

/**
 * @route   PUT /api/doctors/staff/:staffUserId
 * @desc    Update a staff member's profile details (role, permissions, phone) or activate/deactivate user
 * @access  Private (Doctor only)
 * @body    roleInClinic, contactPhoneNumber, permissions (array), isActive (boolean for User model)
 */
router.put('/staff/:staffUserId', async (req, res) => {
    const { roleInClinic, contactPhoneNumber, permissions, isActive } = req.body;
    const doctorId = req.user.id;
    const staffUserId = req.params.staffUserId;

    try {
        const staffProfile = await ClinicStaffProfile.findOne({ user: staffUserId, doctor: doctorId });
        if (!staffProfile) {
            return res.status(404).json({ message: 'Staff member profile not found or not associated with this doctor.' });
        }

        // Update profile fields if provided
        if (roleInClinic !== undefined) staffProfile.roleInClinic = roleInClinic;
        if (contactPhoneNumber !== undefined) staffProfile.contactPhoneNumber = contactPhoneNumber;
        if (permissions !== undefined) staffProfile.permissions = permissions;

        await staffProfile.save();

        // Update User model's isActive status if provided
        if (isActive !== undefined) {
            const staffUser = await User.findById(staffUserId);
            if (staffUser) {
                staffUser.isActive = isActive;
                await staffUser.save();
            } else {
                 // This case should ideally not happen if profile exists
                console.warn(`User not found for staff profile ${staffProfile._id} during update.`);
            }
        }

        const updatedStaffUser = await User.findById(staffUserId).select('-password');
        const updatedProfile = await ClinicStaffProfile.findById(staffProfile._id).populate('user', '-password');


        res.json({
            message: 'Staff member updated successfully.',
            user: updatedStaffUser,
            profile: updatedProfile
        });

    } catch (error) {
        console.error('Error updating staff member:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Staff member not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while updating staff member.' });
    }
});


/**
 * @route   DELETE /api/doctors/staff/:staffUserId
 * @desc    Deactivate a staff member's user account (soft delete by setting isActive=false)
 *          Actual deletion of user/profile is generally discouraged for audit/history.
 * @access  Private (Doctor only)
 */
router.delete('/staff/:staffUserId', async (req, res) => {
    try {
        // Ensure the staff member belongs to the doctor requesting the deletion
        const staffProfile = await ClinicStaffProfile.findOne({
            user: req.params.staffUserId,
            doctor: req.user.id
        });

        if (!staffProfile) {
            return res.status(404).json({ message: 'Staff member not found or not associated with this doctor.' });
        }

        const staffUser = await User.findById(req.params.staffUserId);
        if (!staffUser) {
            // Should not happen if profile exists, but good to check
            return res.status(404).json({ message: 'Staff user account not found.' });
        }

        if (!staffUser.isActive) {
            return res.status(400).json({ message: 'Staff member is already deactivated.' });
        }

        staffUser.isActive = false;
        await staffUser.save();

        // Optionally, you might want to clear their ClinicStaffProfile.permissions or add a 'deactivatedDate'
        // staffProfile.permissions = [];
        // await staffProfile.save();

        res.json({ message: 'Staff member deactivated successfully.' });

    } catch (error) {
        console.error('Error deactivating staff member:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Staff member not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deactivating staff member.' });
    }
});


// ------------------ Work Schedule Management ------------------

/**
 * @route   POST /api/doctors/staff/:staffUserId/schedules
 * @desc    Create a new work schedule entry for a specific staff member.
 *          The staff member must be associated with the logged-in doctor.
 * @access  Private (Doctor only)
 * @body    date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM), taskDescription, shiftType, notes
 */
router.post('/staff/:staffUserId/schedules', async (req, res) => {
    const { date, startTime, endTime, taskDescription, shiftType, notes, isRecurring, recurrenceRule } = req.body;
    const doctorId = req.user.id;
    const staffUserId = req.params.staffUserId;

    if (!date || !startTime || !endTime) {
        return res.status(400).json({ message: 'Date, start time, and end time are required for a schedule.' });
    }

    try {
        // Verify staff member belongs to the doctor
        const staffProfile = await ClinicStaffProfile.findOne({ user: staffUserId, doctor: doctorId });
        if (!staffProfile) {
            return res.status(404).json({ message: 'Staff member not found or not associated with this doctor.' });
        }

        const newSchedule = new WorkSchedule({
            clinicStaff: staffUserId,
            doctor: doctorId,
            date: new Date(date),
            startTime,
            endTime,
            taskDescription: taskDescription || '',
            shiftType: shiftType || '',
            notes: notes || '',
            isRecurring: isRecurring || false,
            recurrenceRule: recurrenceRule || ''
        });

        await newSchedule.save();
        res.status(201).json(newSchedule);

    } catch (error) {
        console.error('Error creating work schedule:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error while creating work schedule.' });
    }
});

/**
 * @route   GET /api/doctors/staff/:staffUserId/schedules
 * @desc    Get all work schedules for a specific staff member.
 *          Filters can be added, e.g., for a date range.
 * @access  Private (Doctor only)
 * @query   startDate, endDate (YYYY-MM-DD)
 */
router.get('/staff/:staffUserId/schedules', async (req, res) => {
    const doctorId = req.user.id;
    const staffUserId = req.params.staffUserId;
    const { startDate, endDate } = req.query;

    try {
        // Verify staff member belongs to the doctor
        const staffProfile = await ClinicStaffProfile.findOne({ user: staffUserId, doctor: doctorId });
        if (!staffProfile) {
            return res.status(404).json({ message: 'Staff member not found or not associated with this doctor.' });
        }

        const query = { clinicStaff: staffUserId, doctor: doctorId };
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }


        const schedules = await WorkSchedule.find(query)
            .populate('clinicStaff', 'username email') // Optional: populate staff details
            .sort({ date: 'asc', startTime: 'asc' });

        res.json(schedules);

    } catch (error) {
        console.error('Error fetching work schedules for staff:', error.message);
        res.status(500).json({ message: 'Server error while fetching work schedules.' });
    }
});

/**
 * @route   GET /api/doctors/schedules
 * @desc    Get all work schedules for all staff of the logged-in doctor.
 * @access  Private (Doctor only)
 * @query   startDate, endDate (YYYY-MM-DD), staffUserId (optional, to filter by one staff member)
 */
router.get('/schedules', async (req, res) => {
    const doctorId = req.user.id;
    const { startDate, endDate, staffUserId } = req.query;

    try {
        const query = { doctor: doctorId };
        if (staffUserId) {
            // Ensure this staffUserId belongs to the doctor if provided.
            const staffProfile = await ClinicStaffProfile.findOne({ user: staffUserId, doctor: doctorId });
            if (!staffProfile) return res.status(404).json({ message: "Specified staff member not found under this doctor."});
            query.clinicStaff = staffUserId;
        }
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        } else if (startDate) {
            query.date = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.date = { $lte: new Date(endDate) };
        }

        const schedules = await WorkSchedule.find(query)
            .populate('clinicStaff', 'username email')
            .sort({ date: 'asc', startTime: 'asc' });
        res.json(schedules);
    } catch (error) {
        console.error('Error fetching all work schedules for doctor:', error.message);
        res.status(500).json({ message: 'Server error fetching schedules.' });
    }
});


/**
 * @route   PUT /api/doctors/schedules/:scheduleId
 * @desc    Update a specific work schedule entry.
 *          The schedule must belong to a staff member of the logged-in doctor.
 * @access  Private (Doctor only)
 */
router.put('/schedules/:scheduleId', async (req, res) => {
    const { date, startTime, endTime, taskDescription, shiftType, notes, isRecurring, recurrenceRule } = req.body;
    const doctorId = req.user.id;
    const scheduleId = req.params.scheduleId;

    try {
        let schedule = await WorkSchedule.findById(scheduleId);
        if (!schedule) {
            return res.status(404).json({ message: 'Work schedule not found.' });
        }

        // Verify the schedule belongs to this doctor (indirectly via staff)
        if (schedule.doctor.toString() !== doctorId) {
            return res.status(403).json({ message: 'Not authorized to update this schedule.' });
        }

        // Update fields
        if (date) schedule.date = new Date(date);
        if (startTime) schedule.startTime = startTime;
        if (endTime) schedule.endTime = endTime;
        if (taskDescription !== undefined) schedule.taskDescription = taskDescription;
        if (shiftType !== undefined) schedule.shiftType = shiftType;
        if (notes !== undefined) schedule.notes = notes;
        if (isRecurring !== undefined) schedule.isRecurring = isRecurring;
        if (recurrenceRule !== undefined) schedule.recurrenceRule = recurrenceRule;


        await schedule.save();
        res.json(schedule);

    } catch (error) {
        console.error('Error updating work schedule:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Schedule not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while updating work schedule.' });
    }
});

/**
 * @route   DELETE /api/doctors/schedules/:scheduleId
 * @desc    Delete a specific work schedule entry.
 *          The schedule must belong to a staff member of the logged-in doctor.
 * @access  Private (Doctor only)
 */
router.delete('/schedules/:scheduleId', async (req, res) => {
    const doctorId = req.user.id;
    const scheduleId = req.params.scheduleId;

    try {
        const schedule = await WorkSchedule.findById(scheduleId);
        if (!schedule) {
            return res.status(404).json({ message: 'Work schedule not found.' });
        }

        if (schedule.doctor.toString() !== doctorId) {
            return res.status(403).json({ message: 'Not authorized to delete this schedule.' });
        }

        await schedule.deleteOne();
        res.json({ message: 'Work schedule deleted successfully.' });

    } catch (error) {
        console.error('Error deleting work schedule:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Schedule not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deleting work schedule.' });
    }
});


// ------------------ Research Document Viewing ------------------

/**
 * @route   GET /api/doctors/research
 * @desc    Get research documents shared with the logged-in doctor or public documents.
 * @access  Private (Doctor only)
 * @query   pharmaId (filter by a specific pharma concern User ID who uploaded)
 * @query   tag (filter by a specific tag)
 * @query   search (search term for title, description, tags) - basic text search
 */
router.get('/research', async (req, res) => {
    const doctorId = req.user.id;
    const { pharmaId, tag, search } = req.query;

    try {
        const query = {
            $or: [
                { "accessPermissions.doctorId": doctorId }, // Doctor has explicit access
                { isPublic: true } // Document is public
            ]
        };

        if (pharmaId) {
            query.pharmaConcern = pharmaId;
        }
        if (tag) {
            query.tags = { $in: [tag] }; // Case-sensitive tag matching, consider $regex for case-insensitive
        }
        if (search) {
            // Basic text search on indexed fields (title, description, tags)
            // Ensure you have a text index on ResearchDocument model:
            // researchDocumentSchema.index({ title: 'text', description: 'text', tags: 'text' });
            query.$text = { $search: search };
        }

        // Fields to select, excluding potentially large or sensitive ones by default if needed
        const documents = await ResearchDocument.find(query)
            .populate('pharmaConcern', 'username email') // Populate uploader details
            .select('-accessPermissions') // Optionally hide detailed access permissions list from doctor view
            .sort({ uploadDate: -1 }); // Show newest first

        res.json(documents);

    } catch (error) {
        console.error('Error fetching research documents for doctor:', error.message);
        res.status(500).json({ message: 'Server error while fetching research documents.' });
    }
});


module.exports = router;
