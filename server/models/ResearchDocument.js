const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const researchDocumentSchema = new Schema({
    pharmaConcern: { // The pharma user/company who uploaded the document
        type: Schema.Types.ObjectId,
        ref: 'User', // User with role 'pharma_concern'
        required: true
    },
    title: {
        type: String,
        required: [true, 'Document title is required.'],
        trim: true,
        maxlength: 255
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    filePath: { // Path to the stored document (e.g., on a cloud storage or local server)
        type: String,
        required: [true, 'File path is required.'],
        trim: true
    },
    fileName: { // Original name of the file
        type: String,
        required: [true, 'File name is required.'],
        trim: true
    },
    fileType: { // MIME type of the file, e.g., 'application/pdf'
        type: String,
        trim: true
    },
    fileSize: { // Size of the file in bytes
        type: Number
    },
    tags: [{ // Keywords or tags for easier searching
        type: String,
        trim: true
    }],
    version: {
        type: String,
        trim: true,
        default: '1.0'
    },
    uploadDate: {
        type: Date,
        default: Date.now
    },
    lastAccessed: { // Could be useful for analytics
        type: Date
    },
    accessPermissions: [{ // Defines which doctors or groups of doctors can access this document
        doctorId: {
            type: Schema.Types.ObjectId,
            ref: 'User' // User with role 'doctor'
        },
        // groupName: String, // For future: share with a group of doctors
        accessGrantedDate: {
            type: Date,
            default: Date.now
        },
        // canDownload: { type: Boolean, default: true },
        // canShare: { type: Boolean, default: false }
    }],
    isPublic: { // If true, any doctor on the platform can view it (consider implications)
        type: Boolean,
        default: false
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

researchDocumentSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

// Indexes for common queries
researchDocumentSchema.index({ pharmaConcern: 1, uploadDate: -1 });
researchDocumentSchema.index({ title: 'text', description: 'text', tags: 'text' }); // For text search
researchDocumentSchema.index({ "accessPermissions.doctorId": 1 });


const ResearchDocument = mongoose.model('ResearchDocument', researchDocumentSchema);

module.exports = ResearchDocument;
