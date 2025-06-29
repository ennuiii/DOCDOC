const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const doctorProfileSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Each user can only have one doctor profile
    },
    specialty: {
        type: String,
        trim: true
    },
    clinicName: {
        type: String,
        trim: true
    },
    clinicAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    // Professional details
    medicalLicenseNumber: {
        type: String,
        trim: true
    },
    yearsOfExperience: {
        type: Number,
        min: 0
    },
    // Consultation details (can be expanded)
    consultationFee: { // Example, may not be relevant if appointments are for pharma reps
        type: Number,
        min: 0
    },
    availabilityNotes: { // E.g., "Prefers morning appointments"
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

doctorProfileSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);

module.exports = DoctorProfile;
