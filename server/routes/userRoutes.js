const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');
const PharmaProfile = require('../models/PharmaProfile');
const ClinicStaffProfile = require('../models/ClinicStaffProfile');

/**
 * @route   GET /api/users/me
 * @desc    Get current logged-in user's details (excluding password) and their profile
 * @access  Private (requires token)
 */
router.get('/me', protect, async (req, res) => {
    try {
        // req.user is populated by the 'protect' middleware from the JWT payload
        // It contains { id: userId, role: userRole, username: userName }
        if (!req.user || !req.user.id) {
            return res.status(400).json({ message: 'User information not found in token.' });
        }

        const user = await User.findById(req.user.id).select('-password'); // Exclude password
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        let profile = null;
        if (user.role === 'doctor') {
            profile = await DoctorProfile.findOne({ user: user._id }).populate('user', 'username email role');
        } else if (user.role === 'pharma_concern') {
            profile = await PharmaProfile.findOne({ user: user._id }).populate('user', 'username email role');
        } else if (user.role === 'clinic_staff') {
            profile = await ClinicStaffProfile.findOne({ user: user._id }).populate('user', 'username email role').populate('doctor', 'username email');
        }

        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            profile: profile // This will be null if no profile matches or for roles like 'admin'
        });
    } catch (error) {
        console.error('Error fetching /me:', error.message);
        res.status(500).json({ message: 'Server error while fetching user details.', error: error.message });
    }
});


// Example of a route only accessible by 'admin' (if we add admin role later)
// router.get('/admin-only', protect, authorize(['admin']), (req, res) => {
//     res.json({ message: 'Welcome Admin!' });
// });

// Example of a route accessible by 'doctor' or 'admin'
// router.get('/doctor-area', protect, authorize(['admin', 'doctor']), (req, res) => {
//     res.json({ message: 'Welcome to the Doctor/Admin Area!' });
// });


module.exports = router;
