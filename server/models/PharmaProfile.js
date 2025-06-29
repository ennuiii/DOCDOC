const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const pharmaProfileSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // Each user can only have one pharma profile
    },
    companyName: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true
    },
    companyWebsite: {
        type: String,
        trim: true
    },
    companyAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    contactPhoneNumber: { // Specific contact for this pharma rep
        type: String,
        trim: true
    },
    jobTitle: { // e.g., "Medical Science Liaison", "Sales Representative"
        type: String,
        trim: true
    },
    therapeuticAreas: [{ // Areas of focus, e.g., "Cardiology", "Oncology"
        type: String,
        trim: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

pharmaProfileSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

const PharmaProfile = mongoose.model('PharmaProfile', pharmaProfileSchema);

module.exports = PharmaProfile;
