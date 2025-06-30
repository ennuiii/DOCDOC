import mongoose from 'mongoose';

const researchSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  companyName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  fileType: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['clinical-trial', 'product-info', 'safety-data', 'efficacy-study', 'market-research', 'other'],
    default: 'other',
  },
  tags: [{
    type: String,
    trim: true,
  }],
  sharedWith: [{
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    sharedAt: {
      type: Date,
      default: Date.now,
    },
    accessLevel: {
      type: String,
      enum: ['view', 'download'],
      default: 'view',
    },
  }],
  isPublic: {
    type: Boolean,
    default: false,
  },
  views: {
    type: Number,
    default: 0,
  },
  downloads: {
    type: Number,
    default: 0,
  },
  metadata: {
    pages: Number,
    language: String,
    publicationDate: Date,
    authors: [String],
    doi: String,
  },
}, { timestamps: true });

// Indexes
researchSchema.index({ uploadedBy: 1, createdAt: -1 });
researchSchema.index({ 'sharedWith.doctor': 1 });
researchSchema.index({ category: 1 });
researchSchema.index({ tags: 1 });
researchSchema.index({ title: 'text', description: 'text' });

// Virtual for checking if user has access
researchSchema.methods.hasAccess = function(userId) {
  // Owner always has access
  if (this.uploadedBy.toString() === userId.toString()) {
    return true;
  }
  
  // Public documents are accessible to all
  if (this.isPublic) {
    return true;
  }
  
  // Check if specifically shared with user
  return this.sharedWith.some(share => 
    share.doctor.toString() === userId.toString()
  );
};

// Get access level for a user
researchSchema.methods.getAccessLevel = function(userId) {
  // Owner has full access
  if (this.uploadedBy.toString() === userId.toString()) {
    return 'owner';
  }
  
  // Check shared access
  const share = this.sharedWith.find(s => 
    s.doctor.toString() === userId.toString()
  );
  
  if (share) {
    return share.accessLevel;
  }
  
  // Public documents have view access
  if (this.isPublic) {
    return 'view';
  }
  
  return null;
};

// Increment view count
researchSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Increment download count
researchSchema.methods.incrementDownloads = async function() {
  this.downloads += 1;
  await this.save();
};

const Research = mongoose.model('Research', researchSchema);

export default Research; 