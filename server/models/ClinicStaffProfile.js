const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const clinicStaffProfileSchema = new Schema({
    user: { // The user account for this staff member
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Each user can only have one clinic staff profile
    },
    doctor: { // The primary doctor this staff member is associated with/works for
        type: Schema.Types.ObjectId,
        ref: 'User', // Referencing the User model, assuming doctor's main ID is there
        required: true
    },
    roleInClinic: { // E.g., 'Receptionist', 'Nurse', 'Practice Manager'
        type: String,
        trim: true,
        required: true
    },
    permissions: [{ // Specific permissions granted by the doctor
        type: String,
        // Example permissions: 'manage_appointments', 'edit_schedules', 'view_patient_records' (if applicable in future)
    }],
    employeeId: { // Optional internal employee ID
        type: String,
        trim: true,
        unique: true,
        sparse: true // Allows multiple nulls, but unique if value exists
    },
    startDate: {
        type: Date
    },
    contactPhoneNumber: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

clinicStaffProfileSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

// Index to allow efficient querying for staff by doctor
clinicStaffProfileSchema.index({ doctor: 1 });

const ClinicStaffProfile = mongoose.model('ClinicStaffProfile', clinicStaffProfileSchema);

module.exports = ClinicStaffProfile;
