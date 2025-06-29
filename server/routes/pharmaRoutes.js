const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const TimeSlot = require('../models/TimeSlot');
const Appointment = require('../models/Appointment');
const ResearchDocument = require('../models/ResearchDocument');
const User = require('../models/User'); // To find doctors
const DoctorProfile = require('../models/DoctorProfile'); // To get doctor details

// Middleware to ensure only pharma_concern can access these routes
router.use(protect); // All routes below require login
router.use(authorize(['pharma_concern'])); // All routes below require 'pharma_concern' role

// ------------------ TimeSlot & Appointment Booking ------------------

/**
 * @route   GET /api/pharma/doctors
 * @desc    Get a list of all doctors with their profiles (for pharma to browse)
 * @access  Private (Pharma Concern only)
 * @query   specialty (filter by doctor's specialty)
 * @query   clinicName (filter by clinic name)
 */
router.get('/doctors', async (req, res) => {
    const { specialty, clinicName } = req.query;
    try {
        const profileQuery = {};
        if (specialty) {
            profileQuery.specialty = { $regex: specialty, $options: 'i' }; // Case-insensitive search
        }
        if (clinicName) {
            profileQuery.clinicName = { $regex: clinicName, $options: 'i' };
        }

        // Find profiles matching query
        const doctorProfiles = await DoctorProfile.find(profileQuery)
            .populate('user', 'username email _id'); // Populate basic user info

        // Could also filter Users by role: 'doctor' and then populate their profiles.
        // This approach starts from profiles.

        res.json(doctorProfiles);
    } catch (error) {
        console.error('Error fetching doctors for pharma:', error.message);
        res.status(500).json({ message: 'Server error while fetching doctors.' });
    }
});


/**
 * @route   GET /api/pharma/doctors/:doctorId/timeslots
 * @desc    Get available timeslots for a specific doctor
 * @access  Private (Pharma Concern only)
 * @param   doctorId (User ID of the doctor)
 * @query   startDate (YYYY-MM-DD, filter timeslots on or after this date)
 * @query   endDate (YYYY-MM-DD, filter timeslots on or before this date)
 */
router.get('/doctors/:doctorId/timeslots', async (req, res) => {
    const { doctorId } = req.params;
    const { startDate, endDate } = req.query;

    try {
        // Validate doctorId is a valid doctor
        const doctorUser = await User.findOne({ _id: doctorId, role: 'doctor' });
        if (!doctorUser) {
            return res.status(404).json({ message: 'Doctor not found.' });
        }

        const query = {
            doctor: doctorId,
            status: 'available', // Only show available timeslots
            startTime: { $gte: new Date() } // Only show future timeslots
        };

        if (startDate) {
            query.startTime.$gte = new Date(startDate);
        }
        if (endDate) {
            // If filtering by end date, include the whole day
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            if (!query.startTime.$lte || query.startTime.$lte > endOfDay) {
                 query.startTime.$lte = endOfDay;
            }
        }


        const timeSlots = await TimeSlot.find(query)
            .select('-doctor') // No need to return doctor ID again, it's in the path
            .sort({ startTime: 'asc' });

        res.json(timeSlots);
    } catch (error) {
        console.error('Error fetching doctor timeslots for pharma:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Doctor not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching timeslots.' });
    }
});


/**
 * @route   POST /api/pharma/appointments
 * @desc    Request an appointment with a doctor for a specific timeslot
 * @access  Private (Pharma Concern only)
 * @body    timeSlotId, purposeOfVisit, presentationMaterialsLink (optional)
 */
router.post('/appointments', async (req, res) => {
    const { timeSlotId, purposeOfVisit, presentationMaterialsLink } = req.body;
    const pharmaConcernId = req.user.id; // Logged-in pharma user

    if (!timeSlotId || !purposeOfVisit) {
        return res.status(400).json({ message: 'Time slot ID and purpose of visit are required.' });
    }

    try {
        const timeSlot = await TimeSlot.findById(timeSlotId);
        if (!timeSlot) {
            return res.status(404).json({ message: 'Time slot not found.' });
        }
        if (timeSlot.status !== 'available') {
            return res.status(400).json({ message: 'Selected time slot is no longer available.' });
        }
        // Ensure timeslot is in the future
        if (new Date(timeSlot.startTime) <= new Date()) {
            return res.status(400).json({ message: 'Cannot book a past time slot.' });
        }


        // Check if this pharma concern already has a pending/approved appointment for this timeslot
        const existingAppointment = await Appointment.findOne({
            timeSlot: timeSlotId,
            pharmaConcern: pharmaConcernId,
            status: { $in: ['pending_approval', 'approved'] }
        });
        if (existingAppointment) {
            return res.status(400).json({ message: 'You already have a pending or approved appointment for this time slot.' });
        }

        const newAppointment = new Appointment({
            timeSlot: timeSlotId,
            pharmaConcern: pharmaConcernId,
            doctor: timeSlot.doctor, // Get doctor from the timeslot
            purposeOfVisit,
            presentationMaterialsLink: presentationMaterialsLink || '',
            status: 'pending_approval', // Default status
            appointmentDate: timeSlot.startTime // Denormalize for easier querying
        });

        await newAppointment.save();

        // Optionally, update timeslot status to 'pending_confirmation' or similar if desired,
        // or leave it 'available' until doctor approves. Current model: remains 'available' until doctor 'approves'.
        // If doctor approves, then timeslot becomes 'booked'.

        // TODO: Send notification to the Doctor about the new appointment request

        res.status(201).json(newAppointment);

    } catch (error) {
        console.error('Error creating appointment request:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Invalid TimeSlot ID or Doctor ID.' });
        }
        res.status(500).json({ message: 'Server error while creating appointment request.' });
    }
});


/**
 * @route   GET /api/pharma/appointments
 * @desc    Get all appointments made by the logged-in pharma concern
 * @access  Private (Pharma Concern only)
 * @query   status (filter by appointment status)
 * @query   doctorId (filter by a specific doctor's User ID)
 */
router.get('/appointments', async (req, res) => {
    const pharmaConcernId = req.user.id;
    const { status, doctorId } = req.query;
    try {
        const query = { pharmaConcern: pharmaConcernId };
        if (status) {
            query.status = status;
        }
        if (doctorId) {
            query.doctor = doctorId;
        }

        const appointments = await Appointment.find(query)
            .populate('doctor', 'username email') // Populate doctor details
            .populate({
                path: 'doctor',
                select: 'username email',
                populate: { path: 'doctorProfile', select: 'clinicName specialty' }
            })
            .populate('timeSlot', 'startTime endTime')
            .sort({ appointmentDate: 'asc' });

        res.json(appointments);
    } catch (error) {
        console.error('Error fetching pharma appointments:', error.message);
        res.status(500).json({ message: 'Server error while fetching appointments.' });
    }
});

/**
 * @route   PUT /api/pharma/appointments/:appointmentId/cancel
 * @desc    Cancel a pending or approved appointment by the pharma concern
 * @access  Private (Pharma Concern only)
 */
router.put('/appointments/:appointmentId/cancel', async (req, res) => {
    const pharmaConcernId = req.user.id;
    const { appointmentId } = req.params;
    const { cancellationReason } = req.body; // Optional

    try {
        const appointment = await Appointment.findOne({
            _id: appointmentId,
            pharmaConcern: pharmaConcernId,
            status: { $in: ['pending_approval', 'approved'] } // Can only cancel these
        });

        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found, not owned by you, or not in a cancellable state.' });
        }

        const previousStatus = appointment.status;
        appointment.status = 'cancelled_by_pharma';
        if (cancellationReason) {
            appointment.pharmaNotes = (appointment.pharmaNotes ? appointment.pharmaNotes + '\n' : '') + `Cancellation reason: ${cancellationReason}`;
        }

        // If the appointment was 'approved' and linked to a 'booked' timeslot,
        // make the timeslot 'available' again.
        if (previousStatus === 'approved') {
            const timeSlot = await TimeSlot.findById(appointment.timeSlot);
            if (timeSlot && timeSlot.status === 'booked') {
                timeSlot.status = 'available'; // Make it available again
                await timeSlot.save();
            }
        }

        const updatedAppointment = await appointment.save();
        // TODO: Send notification to the Doctor about the cancellation
        res.json(updatedAppointment);

    } catch (error) {
        console.error('Error cancelling appointment by pharma:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Appointment not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while cancelling appointment.' });
    }
});


// ------------------ Research Document Management ------------------

/**
 * @route   POST /api/pharma/research
 * @desc    Upload metadata for a new research document.
 *          Actual file upload mechanism (e.g. to S3, local storage) is separate.
 *          This endpoint records the metadata and path/link to the file.
 * @access  Private (Pharma Concern only)
 * @body    title, description, filePath, fileName, fileType, fileSize (bytes), tags (array), isPublic (boolean)
 */
router.post('/research', async (req, res) => {
    const { title, description, filePath, fileName, fileType, fileSize, tags, isPublic } = req.body;
    const pharmaConcernId = req.user.id;

    if (!title || !filePath || !fileName) {
        return res.status(400).json({ message: 'Title, filePath, and fileName are required for research document.' });
    }

    try {
        const newDocument = new ResearchDocument({
            pharmaConcern: pharmaConcernId,
            title,
            description: description || '',
            filePath,
            fileName,
            fileType: fileType || '',
            fileSize: fileSize || 0,
            tags: tags || [],
            isPublic: isPublic || false,
            accessPermissions: [] // Initially shared with no one explicitly, unless isPublic is true
        });

        const savedDocument = await newDocument.save();
        res.status(201).json(savedDocument);
    } catch (error) {
        console.error('Error creating research document metadata:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Server error while creating research document.' });
    }
});

/**
 * @route   GET /api/pharma/research
 * @desc    Get all research documents uploaded by the logged-in pharma concern
 * @access  Private (Pharma Concern only)
 */
router.get('/research', async (req, res) => {
    try {
        const documents = await ResearchDocument.find({ pharmaConcern: req.user.id })
            .populate('accessPermissions.doctorId', 'username email') // Show who it's shared with
            .sort({ uploadDate: -1 });
        res.json(documents);
    } catch (error) {
        console.error('Error fetching pharma research documents:', error.message);
        res.status(500).json({ message: 'Server error while fetching research documents.' });
    }
});

/**
 * @route   GET /api/pharma/research/:documentId
 * @desc    Get a specific research document uploaded by the logged-in pharma concern
 * @access  Private (Pharma Concern only)
 */
router.get('/research/:documentId', async (req, res) => {
    try {
        const document = await ResearchDocument.findOne({
            _id: req.params.documentId,
            pharmaConcern: req.user.id
        }).populate('accessPermissions.doctorId', 'username email');

        if (!document) {
            return res.status(404).json({ message: 'Research document not found or not owned by this pharma concern.' });
        }
        res.json(document);
    } catch (error) {
        console.error('Error fetching specific research document:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Document not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while fetching research document.' });
    }
});

/**
 * @route   PUT /api/pharma/research/:documentId
 * @desc    Update metadata of a research document
 * @access  Private (Pharma Concern only)
 * @body    title, description, tags, isPublic
 */
router.put('/research/:documentId', async (req, res) => {
    const { title, description, tags, isPublic, version } = req.body;
    // filePath, fileName, fileType, fileSize are generally not updated post-upload via this route.
    // If a new version of the file is uploaded, it might be a new document or a more complex versioning system.

    try {
        let document = await ResearchDocument.findOne({
            _id: req.params.documentId,
            pharmaConcern: req.user.id
        });

        if (!document) {
            return res.status(404).json({ message: 'Research document not found or not owned by this pharma concern.' });
        }

        if (title !== undefined) document.title = title;
        if (description !== undefined) document.description = description;
        if (tags !== undefined) document.tags = tags;
        if (isPublic !== undefined) document.isPublic = isPublic;
        if (version !== undefined) document.version = version;

        const updatedDocument = await document.save();
        res.json(updatedDocument);
    } catch (error) {
        console.error('Error updating research document:', error.message);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Document not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while updating research document.' });
    }
});

/**
 * @route   DELETE /api/pharma/research/:documentId
 * @desc    Delete a research document (and its sharing permissions).
 *          Actual file deletion from storage (S3, etc.) needs separate handling.
 * @access  Private (Pharma Concern only)
 */
router.delete('/research/:documentId', async (req, res) => {
    try {
        const document = await ResearchDocument.findOne({
            _id: req.params.documentId,
            pharmaConcern: req.user.id
        });

        if (!document) {
            return res.status(404).json({ message: 'Research document not found or not owned by this pharma concern.' });
        }

        // TODO: Trigger actual file deletion from storage if applicable
        // For example: await deleteFileFromS3(document.filePath);

        await document.deleteOne();
        res.json({ message: 'Research document metadata deleted successfully.' });

    } catch (error) {
        console.error('Error deleting research document:', error.message);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: 'Document not found (invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while deleting research document.' });
    }
});


// TODO:
// POST /api/pharma/research/:documentId/share (share document with specific doctor/s)
// DELETE /api/pharma/research/:documentId/unshare (unshare document from specific doctor/s)
// GET /api/pharma/research/:documentId/access (view who has access to a document)


module.exports = router;
