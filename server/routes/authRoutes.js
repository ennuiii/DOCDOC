const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');
const PharmaProfile = require('../models/PharmaProfile');
const ClinicStaffProfile = require('../models/ClinicStaffProfile');

// Load environment variables
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'yourDefaultJwtSecretFallBackOnlyForDev';
if (JWT_SECRET === 'yourDefaultJwtSecretFallBackOnlyForDev' && process.env.NODE_ENV === 'production') {
    console.error('FATAL ERROR: JWT_SECRET is not set in production environment.');
    process.exit(1);
}


/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (doctor, pharma_concern, clinic_staff)
 * @access  Public
 */
router.post('/register', async (req, res) => {
    const { username, email, password, role, /* profile specific fields */ } = req.body;

    // Basic validation
    if (!username || !email || !password || !role) {
        return res.status(400).json({ message: 'Please enter all required fields (username, email, password, role).' });
    }

    // Validate role
    const allowedRoles = ['doctor', 'pharma_concern', 'clinic_staff'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid user role specified.' });
    }

    // TODO: Add more specific validation for email format, password strength etc.

    try {
        // Check if user already exists
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            return res.status(400).json({ message: 'User with this email or username already exists.' });
        }

        // Create new user instance (password will be hashed before saving)
        user = new User({
            username,
            email,
            password, // Raw password, will be hashed by pre-save hook in User model or here
            role
        });

        // Password will be hashed by the pre-save hook in User.js model
        await user.save();

        // Create profile based on role
        if (role === 'doctor') {
            const { specialty, clinicName, clinicAddress, phoneNumber, medicalLicenseNumber, yearsOfExperience } = req.body;
            const doctorProfile = new DoctorProfile({
                user: user._id,
                specialty,
                clinicName,
                clinicAddress, // Assuming clinicAddress is an object { street, city, state, zipCode, country }
                phoneNumber,
                medicalLicenseNumber,
                yearsOfExperience
            });
            await doctorProfile.save();
        } else if (role === 'pharma_concern') {
            const { companyName, companyWebsite, companyAddress, contactPhoneNumber, jobTitle, therapeuticAreas } = req.body;
            const pharmaProfile = new PharmaProfile({
                user: user._id,
                companyName,
                companyWebsite,
                companyAddress, // Assuming companyAddress is an object
                contactPhoneNumber,
                jobTitle,
                therapeuticAreas // Assuming therapeuticAreas is an array of strings
            });
            await pharmaProfile.save();
        } else if (role === 'clinic_staff') {
            // For clinic staff, 'doctor' field (ID of the employing doctor) is crucial.
            // This needs to be provided during registration, or assigned later by an admin/doctor.
            // For simplicity, let's assume 'employingDoctorId' is passed in req.body for now.
            const { employingDoctorId, roleInClinic, contactPhoneNumber } = req.body;
            if (!employingDoctorId) {
                // Clean up created user if profile creation fails
                await User.findByIdAndDelete(user._id);
                return res.status(400).json({ message: 'Employing doctor ID is required for clinic staff.' });
            }
            // You might want to validate if employingDoctorId is a valid doctor user.
            const clinicStaffProfile = new ClinicStaffProfile({
                user: user._id,
                doctor: employingDoctorId,
                roleInClinic,
                contactPhoneNumber
            });
            await clinicStaffProfile.save();
        }

        // Optionally, generate JWT token upon successful registration and send it back for auto-login
        const payload = { user: { id: user.id, role: user.role, username: user.username } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); // Adjust expiration as needed

        res.status(201).json({
            message: 'User registered successfully!',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(500).json({ message: 'Server error during registration.', error: error.message });
    }
});


/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT
 * @access  Public
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please enter both email and password.' });
    }

    try {
        // Check for user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' }); // Generic message for security
        }

        // Compare password using the method from User model
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' }); // Generic message
        }

        // If password matches (and user is active)
        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is deactivated. Please contact support.' });
        }

        // Generate JWT token
        const payload = { user: { id: user.id, role: user.role, username: user.username } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }); // Adjust expiration as needed

        res.status(200).json({
            message: 'Login successful!',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    }
});


module.exports = router;
