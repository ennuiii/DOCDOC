const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const timeSlotSchema = new Schema({
    doctor: { // The doctor offering this time slot
        type: Schema.Types.ObjectId,
        ref: 'User', // Assuming the User model with role 'doctor'
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['available', 'booked', 'cancelled_by_doctor', 'unavailable'], // 'unavailable' if doc blocks it off post-creation
        default: 'available'
    },
    // Optional: if a recurring slot, this could link to a recurrence rule ID
    // recurrenceRuleId: { type: Schema.Types.ObjectId, ref: 'RecurrenceRule' },
    notes: { // E.g., "For urgent meetings only"
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

timeSlotSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

// Index for efficient querying of time slots by doctor and start time
timeSlotSchema.index({ doctor: 1, startTime: 1 });

// Validate that endTime is after startTime
timeSlotSchema.path('endTime').validate(function(value) {
    return this.startTime < value;
}, 'End time must be after start time.');

const TimeSlot = mongoose.model('TimeSlot', timeSlotSchema);

module.exports = TimeSlot;
