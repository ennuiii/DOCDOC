import Research from '../models/Research.js';
import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/research';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow only specific file types
  const allowedTypes = /pdf|doc|docx|ppt|pptx|xls|xlsx|txt|rtf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname || mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, and RTF files are allowed'));
  }
};

export const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: fileFilter
});

// Upload research document
export const uploadResearch = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const { title, description, category, tags, isPublic } = req.body;

    const research = new Research({
      title,
      description,
      uploadedBy: req.user._id,
      companyName: req.user.profile.companyName,
      fileUrl: `/uploads/research/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      category: category || 'other',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      isPublic: isPublic === 'true',
    });

    await research.save();

    res.status(201).json({
      success: true,
      message: 'Research document uploaded successfully',
      research: await research.populate('uploadedBy', 'email profile'),
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    next(error);
  }
};

// Get research documents (with filtering)
export const getResearchDocuments = async (req, res, next) => {
  try {
    const {
      category,
      tags,
      search,
      shared,
      public: isPublic,
      page = 1,
      limit = 10,
    } = req.query;

    const query = {};

    // Filter by role
    if (req.user.role === 'pharma') {
      // Pharma users see only their uploads
      query.uploadedBy = req.user._id;
    } else if (req.user.role === 'doctor') {
      // Doctors see public docs and docs shared with them
      query.$or = [
        { isPublic: true },
        { 'sharedWith.doctor': req.user._id },
      ];
    }

    // Additional filters
    if (category) query.category = category;
    if (tags) query.tags = { $in: tags.split(',') };
    if (isPublic !== undefined) query.isPublic = isPublic === 'true';
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      Research.find(query)
        .populate('uploadedBy', 'email profile')
        .populate('sharedWith.doctor', 'email profile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Research.countDocuments(query),
    ]);

    res.json({
      success: true,
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single research document
export const getResearchDocument = async (req, res, next) => {
  try {
    const document = await Research.findById(req.params.id)
      .populate('uploadedBy', 'email profile')
      .populate('sharedWith.doctor', 'email profile');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Check access
    if (!document.hasAccess(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Increment view count
    if (req.user._id.toString() !== document.uploadedBy._id.toString()) {
      await document.incrementViews();
    }

    res.json({
      success: true,
      document,
      accessLevel: document.getAccessLevel(req.user._id),
    });
  } catch (error) {
    next(error);
  }
};

// Share research document
export const shareResearch = async (req, res, next) => {
  try {
    const { doctorIds, accessLevel = 'view' } = req.body;

    const document = await Research.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can share
    if (document.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can share this document',
      });
    }

    // Validate doctor IDs
    const doctors = await User.find({
      _id: { $in: doctorIds },
      role: 'doctor',
    });

    if (doctors.length !== doctorIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some doctor IDs are invalid',
      });
    }

    // Add or update shares
    for (const doctorId of doctorIds) {
      const existingShare = document.sharedWith.find(
        share => share.doctor.toString() === doctorId
      );

      if (existingShare) {
        existingShare.accessLevel = accessLevel;
        existingShare.sharedAt = new Date();
      } else {
        document.sharedWith.push({
          doctor: doctorId,
          accessLevel,
        });
      }
    }

    await document.save();

    res.json({
      success: true,
      message: 'Document shared successfully',
      document: await document.populate('sharedWith.doctor', 'email profile'),
    });
  } catch (error) {
    next(error);
  }
};

// Remove share
export const removeShare = async (req, res, next) => {
  try {
    const { doctorId } = req.params;

    const document = await Research.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can remove shares
    if (document.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can manage shares',
      });
    }

    document.sharedWith = document.sharedWith.filter(
      share => share.doctor.toString() !== doctorId
    );

    await document.save();

    res.json({
      success: true,
      message: 'Share removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Update research document
export const updateResearch = async (req, res, next) => {
  try {
    const { title, description, category, tags, isPublic } = req.body;

    const document = await Research.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can update
    if (document.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can update this document',
      });
    }

    // Update fields
    if (title) document.title = title;
    if (description) document.description = description;
    if (category) document.category = category;
    if (tags) document.tags = tags.split(',').map(tag => tag.trim());
    if (isPublic !== undefined) document.isPublic = isPublic === 'true';

    await document.save();

    res.json({
      success: true,
      message: 'Document updated successfully',
      document,
    });
  } catch (error) {
    next(error);
  }
};

// Delete research document
export const deleteResearch = async (req, res, next) => {
  try {
    const document = await Research.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can delete
    if (document.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can delete this document',
      });
    }

    // Delete file
    try {
      await fs.unlink(`.${document.fileUrl}`);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    await document.deleteOne();

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Download research document
export const downloadResearch = async (req, res, next) => {
  try {
    const document = await Research.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Check access
    const accessLevel = document.getAccessLevel(req.user._id);
    if (!accessLevel || (accessLevel === 'view' && req.user._id.toString() !== document.uploadedBy.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Download access denied',
      });
    }

    // Increment download count
    if (req.user._id.toString() !== document.uploadedBy.toString()) {
      await document.incrementDownloads();
    }

    // Send file
    const filePath = `.${document.fileUrl}`;
    res.download(filePath, document.fileName);
  } catch (error) {
    next(error);
  }
};

// Get available doctors for sharing
export const getAvailableDoctors = async (req, res, next) => {
  try {
    const { search, specialization } = req.query;

    const query = { role: 'doctor' };
    
    if (search) {
      query.$or = [
        { 'profile.firstName': new RegExp(search, 'i') },
        { 'profile.lastName': new RegExp(search, 'i') },
        { 'profile.clinicName': new RegExp(search, 'i') },
      ];
    }

    if (specialization) {
      query['profile.specialization'] = specialization;
    }

    const doctors = await User.find(query)
      .select('email profile')
      .sort('profile.lastName');

    res.json({
      success: true,
      doctors,
    });
  } catch (error) {
    next(error);
  }
}; 