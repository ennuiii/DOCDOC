import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'appointment-scheduled',
      'appointment-confirmed',
      'appointment-cancelled',
      'appointment-completed',
      'appointment-reminder',
      'research-shared',
      'research-uploaded',
      'timeslot-available',
      'system',
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  data: {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    researchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Research',
    },
    timeslotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timeslot',
    },
    link: String,
  },
  read: {
    type: Boolean,
    default: false,
  },
  readAt: Date,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
}, { timestamps: true });

// Indexes
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ type: 1 });

// Mark as read
notificationSchema.methods.markAsRead = async function() {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    await this.save();
  }
};

// Static method to create notification
notificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  await notification.save();
  
  // Here we could emit a real-time event if using Socket.io
  // io.to(data.recipient.toString()).emit('new-notification', notification);
  
  return notification;
};

// Get unread count for user
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification; 