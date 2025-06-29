const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const appointmentSchema = new Schema({
    timeSlot: { // The specific time slot this appointment is for
        type: Schema.Types.ObjectId,
        ref: 'TimeSlot',
        required: true,
        // It might be good to ensure this timeslot is 'available' before an appointment can be made for it,
        // or handle this logic in the service layer.
    },
    pharmaConcern: { // The pharma user/company who booked the appointment
        type: Schema.Types.ObjectId,
        ref: 'User', // User with role 'pharma_concern'
        required: true
    },
    doctor: { // The doctor with whom the appointment is scheduled
        type: Schema.Types.ObjectId,
        ref: 'User', // User with role 'doctor'
        required: true
    },
    purposeOfVisit: { // What the pharma rep wants to discuss/present
        type: String,
        required: [true, 'Purpose of visit is required.'],
        trim: true,
        maxlength: 500
    },
    presentationMaterialsLink: { // Optional: A link to online presentation materials (e.g., Google Slides, Dropbox)
        type: String,
        trim: true
    },
    // We might add a field for actual file uploads later if needed:
    // attachedDocumentPath: { type: String, trim: true },
    status: {
        type: String,
        required: true,
        enum: [
            'pending_approval',   // Pharma requested, Doctor needs to approve
            'approved',           // Doctor approved
            'rejected_by_doctor', // Doctor rejected
            'cancelled_by_pharma',// Pharma cancelled after approval
            'cancelled_by_doctor',// Doctor cancelled after approval
            'completed',          // Appointment took place
            'no_show_pharma',     // Pharma rep did not attend
            'no_show_doctor'      // Doctor did not attend (less likely, but possible)
        ],
        default: 'pending_approval'
    },
    doctorNotes: { // Notes doctor might add after the meeting
        type: String,
        trim: true
    },
    pharmaNotes: { // Notes pharma rep might add after the meeting
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
    },
    appointmentDate: { // Denormalized for easier querying, taken from TimeSlot.startTime
        type: Date,
        required: true
    }
});

appointmentSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    // If timeslot is populated and appointmentDate is not set, set it.
    if (this.timeSlot && this.timeSlot.startTime && !this.appointmentDate) {
        this.appointmentDate = this.timeSlot.startTime;
    }
    next();
});

// Indexes for common queries
appointmentSchema.index({ doctor: 1, appointmentDate: 1 });
appointmentSchema.index({ pharmaConcern: 1, appointmentDate: 1 });
appointmentSchema.index({ timeSlot: 1 }, { unique: true, sparse: true }); // An appointment should uniquely use a timeslot, unless timeslot can be re-used after cancellation. If so, this unique index needs adjustment or to be handled at application level.

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
