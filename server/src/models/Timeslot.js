import mongoose from 'mongoose';

const timeslotSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  startTime: {
    type: String,
    required: true,
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide time in HH:MM format']
  },
  endTime: {
    type: String,
    required: true,
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please provide time in HH:MM format']
  },
  duration: {
    type: Number,
    default: 30, // Duration in minutes
    min: [15, 'Minimum duration is 15 minutes'],
    max: [120, 'Maximum duration is 120 minutes']
  },
  status: {
    type: String,
    enum: ['available', 'booked', 'blocked', 'cancelled'],
    default: 'available',
    index: true
  },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  },
  type: {
    type: String,
    enum: ['pharma', 'patient', 'general'],
    default: 'pharma'
  },
  maxBookings: {
    type: Number,
    default: 1,
    min: 1
  },
  currentBookings: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    maxlength: 500
  },
  recurringRule: {
    type: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none'
    },
    endDate: Date,
    daysOfWeek: [Number], // 0-6 for weekly recurrence
    dayOfMonth: Number // 1-31 for monthly recurrence
  },
  parentTimeslot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timeslot',
    default: null
  },
  isRecurringInstance: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
timeslotSchema.index({ doctor: 1, date: 1, startTime: 1 });
timeslotSchema.index({ status: 1, date: 1 });
timeslotSchema.index({ doctor: 1, status: 1 });

// Virtual for formatted date
timeslotSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Virtual for time slot display
timeslotSchema.virtual('timeSlot').get(function() {
  return `${this.startTime} - ${this.endTime}`;
});

// Check if timeslot is in the past
timeslotSchema.methods.isPast = function() {
  const now = new Date();
  const slotDateTime = new Date(this.date);
  const [hours, minutes] = this.endTime.split(':');
  slotDateTime.setHours(parseInt(hours), parseInt(minutes));
  return slotDateTime < now;
};

// Check if timeslot can be booked
timeslotSchema.methods.canBeBooked = function() {
  return this.status === 'available' && 
         !this.isPast() && 
         this.currentBookings < this.maxBookings;
};

// Validate time range
timeslotSchema.pre('save', function(next) {
  const start = this.startTime.split(':').map(Number);
  const end = this.endTime.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  
  if (startMinutes >= endMinutes) {
    next(new Error('End time must be after start time'));
  } else {
    // Calculate duration
    this.duration = endMinutes - startMinutes;
    next();
  }
});

// Check for overlapping timeslots
timeslotSchema.statics.checkOverlap = async function(doctorId, date, startTime, endTime, excludeId = null) {
  const query = {
    doctor: doctorId,
    date: date,
    status: { $ne: 'cancelled' }
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const timeslots = await this.find(query);
  
  const newStart = startTime.split(':').map(Number);
  const newEnd = endTime.split(':').map(Number);
  const newStartMin = newStart[0] * 60 + newStart[1];
  const newEndMin = newEnd[0] * 60 + newEnd[1];
  
  for (const slot of timeslots) {
    const slotStart = slot.startTime.split(':').map(Number);
    const slotEnd = slot.endTime.split(':').map(Number);
    const slotStartMin = slotStart[0] * 60 + slotStart[1];
    const slotEndMin = slotEnd[0] * 60 + slotEnd[1];
    
    // Check for overlap
    if ((newStartMin < slotEndMin && newEndMin > slotStartMin)) {
      return true; // Overlap found
    }
  }
  
  return false; // No overlap
};

// Generate recurring timeslots
timeslotSchema.methods.generateRecurring = async function(endDate) {
  if (this.recurringRule.type === 'none') return [];
  
  const timeslots = [];
  const currentDate = new Date(this.date);
  currentDate.setDate(currentDate.getDate() + 1); // Start from next occurrence
  
  while (currentDate <= endDate) {
    let shouldCreate = false;
    
    switch (this.recurringRule.type) {
      case 'daily':
        shouldCreate = true;
        break;
      case 'weekly':
        shouldCreate = this.recurringRule.daysOfWeek.includes(currentDate.getDay());
        break;
      case 'monthly':
        shouldCreate = currentDate.getDate() === this.recurringRule.dayOfMonth;
        break;
    }
    
    if (shouldCreate) {
      const newSlot = {
        doctor: this.doctor,
        date: new Date(currentDate),
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.duration,
        type: this.type,
        maxBookings: this.maxBookings,
        notes: this.notes,
        parentTimeslot: this._id,
        isRecurringInstance: true,
        recurringRule: { type: 'none' }
      };
      
      // Check for overlap before creating
      const hasOverlap = await this.constructor.checkOverlap(
        newSlot.doctor,
        newSlot.date,
        newSlot.startTime,
        newSlot.endTime
      );
      
      if (!hasOverlap) {
        timeslots.push(newSlot);
      }
    }
    
    // Increment date based on recurrence type
    switch (this.recurringRule.type) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
    }
  }
  
  return timeslots;
};

const Timeslot = mongoose.model('Timeslot', timeslotSchema);

export default Timeslot; 