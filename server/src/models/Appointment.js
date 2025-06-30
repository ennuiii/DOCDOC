import mongoose from 'mongoose';
import NotificationService from '../services/notificationService.js';

const appointmentSchema = new mongoose.Schema({
  timeslot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timeslot',
    required: true,
    index: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  pharmaRep: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled',
    index: true
  },
  purpose: {
    type: String,
    required: true,
    maxlength: 200
  },
  products: [{
    name: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ['prescription', 'otc', 'vaccine', 'medical-device', 'other'],
      default: 'prescription'
    },
    description: String
  }],
  notes: {
    type: String,
    maxlength: 1000
  },
  meetingLink: {
    type: String,
    default: null
  },
  meetingType: {
    type: String,
    enum: ['in-person', 'virtual', 'phone'],
    default: 'in-person'
  },
  duration: {
    type: Number,
    default: 30 // minutes
  },
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    submittedAt: Date
  },
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  confirmedAt: Date,
  completedAt: Date,
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'in-app'],
      default: 'email'
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending'
    }
  }],
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
appointmentSchema.index({ doctor: 1, status: 1, createdAt: -1 });
appointmentSchema.index({ pharmaRep: 1, status: 1, createdAt: -1 });
appointmentSchema.index({ timeslot: 1, status: 1 });

// Virtual for appointment date/time from timeslot
appointmentSchema.virtual('appointmentDateTime').get(function() {
  if (this.timeslot && this.timeslot.date && this.timeslot.startTime) {
    const date = new Date(this.timeslot.date);
    const [hours, minutes] = this.timeslot.startTime.split(':');
    date.setHours(parseInt(hours), parseInt(minutes));
    return date;
  }
  return null;
});

// Check if appointment can be cancelled
appointmentSchema.methods.canBeCancelled = function() {
  return ['scheduled', 'confirmed'].includes(this.status) && 
         this.appointmentDateTime > new Date();
};

// Check if appointment can be confirmed
appointmentSchema.methods.canBeConfirmed = function() {
  return this.status === 'scheduled' && 
         this.appointmentDateTime > new Date();
};

// Cancel appointment
appointmentSchema.methods.cancel = async function(userId, reason) {
  if (!this.canBeCancelled()) {
    throw new Error('Appointment cannot be cancelled');
  }
  
  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  
  // Update timeslot to available
  const Timeslot = mongoose.model('Timeslot');
  await Timeslot.findByIdAndUpdate(this.timeslot, {
    status: 'available',
    appointment: null,
    currentBookings: 0
  });
  
  return this.save();
};

// Confirm appointment
appointmentSchema.methods.confirm = function() {
  if (!this.canBeConfirmed()) {
    throw new Error('Appointment cannot be confirmed');
  }
  
  this.status = 'confirmed';
  this.confirmedAt = new Date();
  return this.save();
};

// Complete appointment
appointmentSchema.methods.complete = function() {
  if (this.status !== 'confirmed') {
    throw new Error('Only confirmed appointments can be completed');
  }
  
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Mark as no-show
appointmentSchema.methods.markNoShow = function() {
  if (this.status !== 'confirmed') {
    throw new Error('Only confirmed appointments can be marked as no-show');
  }
  
  this.status = 'no-show';
  return this.save();
};

// Pre-save middleware to update timeslot
appointmentSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Update timeslot when creating appointment
    const Timeslot = mongoose.model('Timeslot');
    const timeslot = await Timeslot.findById(this.timeslot);
    
    if (!timeslot) {
      return next(new Error('Timeslot not found'));
    }
    
    if (timeslot.status !== 'available') {
      return next(new Error('Timeslot is not available'));
    }
    
    // Update timeslot
    timeslot.status = 'booked';
    timeslot.appointment = this._id;
    timeslot.currentBookings = 1;
    await timeslot.save();
  }
  
  next();
});

// Static method to find appointments by date range
appointmentSchema.statics.findByDateRange = function(startDate, endDate, filters = {}) {
  return this.find({
    ...filters,
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('timeslot doctor pharmaRep');
};

// Static method to get upcoming appointments
appointmentSchema.statics.getUpcoming = function(userId, role) {
  const query = role === 'doctor' ? { doctor: userId } : { pharmaRep: userId };
  
  return this.find({
    ...query,
    status: { $in: ['scheduled', 'confirmed'] }
  })
  .populate('timeslot doctor pharmaRep')
  .sort('timeslot.date timeslot.startTime');
};

const Appointment = mongoose.model('Appointment', appointmentSchema);

export default Appointment; 