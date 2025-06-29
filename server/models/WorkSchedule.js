const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const workScheduleSchema = new Schema({
    clinicStaff: { // The staff member this schedule is for
        type: Schema.Types.ObjectId,
        ref: 'User', // User with role 'clinic_staff'
        required: true
    },
    doctor: { // The doctor who created/manages this schedule (or the clinic admin)
        type: Schema.Types.ObjectId,
        ref: 'User', // User with role 'doctor' or 'admin' associated with the clinic
        required: true
    },
    date: { // The specific date for this work schedule entry
        type: Date,
        required: true
    },
    startTime: { // E.g., "09:00"
        type: String, // Storing as string for simplicity, but could be Date object if time precision is critical
        required: true,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format']
    },
    endTime: { // E.g., "17:00"
        type: String,
        required: true,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format']
        // Add validation: endTime must be after startTime if on the same day
    },
    taskDescription: { // What the staff member is scheduled to do
        type: String,
        trim: true,
        maxlength: 500
    },
    shiftType: { // E.g., 'Morning', 'Evening', 'FullDay', 'OnCall'
        type: String,
        trim: true
    },
    isRecurring: { // Flag if this is part of a recurring schedule pattern
        type: Boolean,
        default: false
    },
    recurrenceRule: { // If isRecurring is true, define the pattern (e.g., RRULE string or custom object)
        type: String, // Could be an iCalendar RRULE string
        trim: true
    },
    notes: { // Any additional notes for this schedule entry
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

workScheduleSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

// Custom validator for endTime > startTime (basic check, assumes same day)
workScheduleSchema.path('endTime').validate(function(value) {
    if (this.startTime && value) {
        const [startHours, startMinutes] = this.startTime.split(':').map(Number);
        const [endHours, endMinutes] = value.split(':').map(Number);
        if (endHours < startHours) return false;
        if (endHours === startHours && endMinutes <= startMinutes) return false;
    }
    return true;
}, 'End time must be after start time for the same day.');

// Indexes for common queries
workScheduleSchema.index({ clinicStaff: 1, date: 1 });
workScheduleSchema.index({ doctor: 1, date: 1 });

const WorkSchedule = mongoose.model('WorkSchedule', workScheduleSchema);

module.exports = WorkSchedule;
