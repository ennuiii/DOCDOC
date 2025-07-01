import { supabaseAdmin } from '../config/supabase.js';
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

// Helper function to create notifications
const createNotification = async (recipientId, type, title, message, data = {}) => {
  try {
    const { error } = await supabaseAdmin()
      .from('notifications')
      .insert([{
        recipient_id: recipientId,
        type,
        title,
        message,
        data,
        priority: 'medium',
        is_read: false
      }]);

    if (error) {
      console.error('Error creating notification:', error);
    }
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

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

    // Get user's company name
    const { data: userData, error: userError } = await supabaseAdmin()
      .from('users')
      .select('company_name')
      .eq('id', req.user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return res.status(500).json({
        success: false,
        message: 'Error fetching user data'
      });
    }

    const researchData = {
      title,
      description,
      uploaded_by_id: req.user.id,
      company_name: userData.company_name,
      file_url: `/uploads/research/${req.file.filename}`,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      category: category || 'other',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      is_public: isPublic === 'true',
      views: 0,
      downloads: 0
    };

    const { data: research, error } = await supabaseAdmin()
      .from('research_documents')
      .insert([researchData])
      .select(`
        *,
        uploaded_by:users!uploaded_by_id(id, email, first_name, last_name, company_name)
      `)
      .single();

    if (error) {
      console.error('Error creating research document:', error);
      // Clean up uploaded file on error
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
      return res.status(500).json({
        success: false,
        message: 'Error creating research document'
      });
    }

    // Transform to match frontend expectations
    const transformedResearch = {
      id: research.id,
      title: research.title,
      description: research.description,
      uploadedBy: {
        id: research.uploaded_by.id,
        email: research.uploaded_by.email,
        profile: {
          firstName: research.uploaded_by.first_name,
          lastName: research.uploaded_by.last_name,
          companyName: research.uploaded_by.company_name
        }
      },
      companyName: research.company_name,
      fileUrl: research.file_url,
      fileName: research.file_name,
      fileSize: research.file_size,
      fileType: research.file_type,
      category: research.category,
      tags: research.tags,
      isPublic: research.is_public,
      views: research.views,
      downloads: research.downloads,
      createdAt: research.created_at,
      updatedAt: research.updated_at
    };

    res.status(201).json({
      success: true,
      message: 'Research document uploaded successfully',
      research: transformedResearch,
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

    let query = supabaseAdmin()
      .from('research_documents')
      .select(`
        *,
        uploaded_by:users!uploaded_by_id(id, email, first_name, last_name, company_name),
        research_shares!inner(doctor_id, shared_at, access_level)
      `);

    // Filter by role
    if (req.user.role === 'pharma') {
      // Pharma users see only their uploads
      query = query.eq('uploaded_by_id', req.user.id);
    } else if (req.user.role === 'doctor') {
      // Doctors see public docs and docs shared with them
      query = supabaseAdmin()
        .from('research_documents')
        .select(`
          *,
          uploaded_by:users!uploaded_by_id(id, email, first_name, last_name, company_name),
          research_shares(doctor_id, shared_at, access_level)
        `)
        .or(`is_public.eq.true,research_shares.doctor_id.eq.${req.user.id}`);
    }

    // Additional filters
    if (category) query = query.eq('category', category);
    if (tags) {
      const tagList = tags.split(',');
      query = query.overlaps('tags', tagList);
    }
    if (isPublic !== undefined) query = query.eq('is_public', isPublic === 'true');
    if (search) {
      query = query.textSearch('title_description_search', search);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data: documents, error, count } = await query;

    if (error) {
      console.error('Error fetching research documents:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching research documents'
      });
    }

    // Transform data to match frontend expectations
    const transformedDocuments = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      uploadedBy: {
        id: doc.uploaded_by.id,
        email: doc.uploaded_by.email,
        profile: {
          firstName: doc.uploaded_by.first_name,
          lastName: doc.uploaded_by.last_name,
          companyName: doc.uploaded_by.company_name
        }
      },
      companyName: doc.company_name,
      fileUrl: doc.file_url,
      fileName: doc.file_name,
      fileSize: doc.file_size,
      fileType: doc.file_type,
      category: doc.category,
      tags: doc.tags,
      isPublic: doc.is_public,
      views: doc.views,
      downloads: doc.downloads,
      sharedWith: doc.research_shares || [],
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    }));

    res.json({
      success: true,
      documents: transformedDocuments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single research document
export const getResearchDocument = async (req, res, next) => {
  try {
    const { data: document, error } = await supabaseAdmin()
      .from('research_documents')
      .select(`
        *,
        uploaded_by:users!uploaded_by_id(id, email, first_name, last_name, company_name),
        research_shares(
          doctor_id,
          shared_at,
          access_level,
          doctor:users!doctor_id(id, email, first_name, last_name, specialization, clinic_name)
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (error) {
      console.error('Error fetching research document:', error);
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Check access
    const hasAccess = document.uploaded_by_id === req.user.id ||
                     document.is_public ||
                     document.research_shares.some(share => share.doctor_id === req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Increment view count if not owner
    if (req.user.id !== document.uploaded_by_id) {
      await supabaseAdmin()
        .from('research_documents')
        .update({ views: document.views + 1 })
        .eq('id', req.params.id);
    }

    // Determine access level
    let accessLevel = 'view';
    if (document.uploaded_by_id === req.user.id) {
      accessLevel = 'owner';
    } else {
      const share = document.research_shares.find(s => s.doctor_id === req.user.id);
      if (share) {
        accessLevel = share.access_level;
      }
    }

    // Transform data
    const transformedDocument = {
      id: document.id,
      title: document.title,
      description: document.description,
      uploadedBy: {
        id: document.uploaded_by.id,
        email: document.uploaded_by.email,
        profile: {
          firstName: document.uploaded_by.first_name,
          lastName: document.uploaded_by.last_name,
          companyName: document.uploaded_by.company_name
        }
      },
      companyName: document.company_name,
      fileUrl: document.file_url,
      fileName: document.file_name,
      fileSize: document.file_size,
      fileType: document.file_type,
      category: document.category,
      tags: document.tags,
      isPublic: document.is_public,
      views: document.views + (req.user.id !== document.uploaded_by_id ? 1 : 0),
      downloads: document.downloads,
      sharedWith: document.research_shares.map(share => ({
        doctor: {
          id: share.doctor.id,
          email: share.doctor.email,
          profile: {
            firstName: share.doctor.first_name,
            lastName: share.doctor.last_name,
            specialization: share.doctor.specialization,
            clinicName: share.doctor.clinic_name
          }
        },
        sharedAt: share.shared_at,
        accessLevel: share.access_level
      })),
      createdAt: document.created_at,
      updatedAt: document.updated_at
    };

    res.json({
      success: true,
      document: transformedDocument,
      accessLevel,
    });
  } catch (error) {
    next(error);
  }
};

// Share research document
export const shareResearch = async (req, res, next) => {
  try {
    const { doctorIds, accessLevel = 'view' } = req.body;

    // Check if document exists and user is owner
    const { data: document, error: docError } = await supabaseAdmin()
      .from('research_documents')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can share
    if (document.uploaded_by_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can share this document',
      });
    }

    // Validate doctor IDs
    const { data: doctors, error: doctorsError } = await supabaseAdmin()
      .from('users')
      .select('id, email, first_name, last_name')
      .in('id', doctorIds)
      .eq('role', 'doctor');

    if (doctorsError || doctors.length !== doctorIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some doctor IDs are invalid',
      });
    }

    // Add or update shares
    const sharePromises = doctorIds.map(async (doctorId) => {
      const { data: existingShare } = await supabaseAdmin()
        .from('research_shares')
        .select('*')
        .eq('research_id', req.params.id)
        .eq('doctor_id', doctorId)
        .single();

      if (existingShare) {
        // Update existing share
        await supabaseAdmin()
          .from('research_shares')
          .update({
            access_level: accessLevel,
            shared_at: new Date().toISOString()
          })
          .eq('research_id', req.params.id)
          .eq('doctor_id', doctorId);
      } else {
        // Create new share
        await supabaseAdmin()
          .from('research_shares')
          .insert([{
            research_id: req.params.id,
            doctor_id: doctorId,
            access_level: accessLevel
          }]);

        // Create notification for new share
        await createNotification(
          doctorId,
          'research-shared',
          'New Research Document Shared',
          `${document.company_name} has shared a research document: "${document.title}" with you`,
          {
            researchId: req.params.id,
            link: '/research'
          }
        );
      }
    });

    await Promise.all(sharePromises);

    // Get updated document with shares
    const { data: updatedDocument } = await supabaseAdmin()
      .from('research_documents')
      .select(`
        *,
        research_shares(
          doctor_id,
          shared_at,
          access_level,
          doctor:users!doctor_id(id, email, first_name, last_name, specialization, clinic_name)
        )
      `)
      .eq('id', req.params.id)
      .single();

    res.json({
      success: true,
      message: 'Document shared successfully',
      document: updatedDocument,
    });
  } catch (error) {
    next(error);
  }
};

// Remove share
export const removeShare = async (req, res, next) => {
  try {
    const { doctorId } = req.params;

    // Check if document exists and user is owner
    const { data: document, error: docError } = await supabaseAdmin()
      .from('research_documents')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can remove shares
    if (document.uploaded_by_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can manage shares',
      });
    }

    // Remove share
    const { error: removeError } = await supabaseAdmin()
      .from('research_shares')
      .delete()
      .eq('research_id', req.params.id)
      .eq('doctor_id', doctorId);

    if (removeError) {
      console.error('Error removing share:', removeError);
      return res.status(500).json({
        success: false,
        message: 'Error removing share'
      });
    }

    // Create notification for removed share
    await createNotification(
      doctorId,
      'research-unshared',
      'Research Access Removed',
      `${document.company_name} has removed your access to research document: "${document.title}"`,
      {
        researchId: req.params.id,
        link: '/research'
      }
    );

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

    // Check if document exists and user is owner
    const { data: document, error: docError } = await supabaseAdmin()
      .from('research_documents')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can update
    if (document.uploaded_by_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can update this document',
      });
    }

    // Build update object
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (tags) updateData.tags = tags.split(',').map(tag => tag.trim());
    if (isPublic !== undefined) updateData.is_public = isPublic === 'true';
    updateData.updated_at = new Date().toISOString();

    const { data: updatedDocument, error: updateError } = await supabaseAdmin()
      .from('research_documents')
      .update(updateData)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating research document:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Error updating document'
      });
    }

    res.json({
      success: true,
      message: 'Document updated successfully',
      document: updatedDocument,
    });
  } catch (error) {
    next(error);
  }
};

// Delete research document
export const deleteResearch = async (req, res, next) => {
  try {
    // Check if document exists and user is owner
    const { data: document, error: docError } = await supabaseAdmin()
      .from('research_documents')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Only owner can delete
    if (document.uploaded_by_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the owner can delete this document',
      });
    }

    // Delete file
    try {
      await fs.unlink(`.${document.file_url}`);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Delete from database (cascade will remove shares)
    const { error: deleteError } = await supabaseAdmin()
      .from('research_documents')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) {
      console.error('Error deleting research document:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Error deleting document'
      });
    }

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
    const { data: document, error } = await supabaseAdmin()
      .from('research_documents')
      .select(`
        *,
        research_shares(doctor_id, access_level)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !document) {
      return res.status(404).json({
        success: false,
        message: 'Research document not found',
      });
    }

    // Check access
    const hasAccess = document.uploaded_by_id === req.user.id ||
                     document.is_public ||
                     document.research_shares.some(share => share.doctor_id === req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Check download permission
    const share = document.research_shares.find(s => s.doctor_id === req.user.id);
    if (share && share.access_level === 'view' && document.uploaded_by_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Download access denied',
      });
    }

    // Increment download count if not owner
    if (req.user.id !== document.uploaded_by_id) {
      await supabaseAdmin()
        .from('research_documents')
        .update({ downloads: document.downloads + 1 })
        .eq('id', req.params.id);
    }

    // Send file
    const filePath = `.${document.file_url}`;
    res.download(filePath, document.file_name);
  } catch (error) {
    next(error);
  }
};

// Get available doctors for sharing
export const getAvailableDoctors = async (req, res, next) => {
  try {
    const { search, specialization } = req.query;

    let query = supabaseAdmin()
      .from('users')
      .select('id, email, first_name, last_name, specialization, clinic_name')
      .eq('role', 'doctor');
    
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,clinic_name.ilike.%${search}%`);
    }

    if (specialization) {
      query = query.eq('specialization', specialization);
    }

    const { data: doctors, error } = await query
      .order('last_name', { ascending: true });

    if (error) {
      console.error('Error fetching doctors:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching doctors'
      });
    }

    // Transform data to match frontend expectations
    const transformedDoctors = doctors.map(doctor => ({
      id: doctor.id,
      email: doctor.email,
      profile: {
        firstName: doctor.first_name,
        lastName: doctor.last_name,
        specialization: doctor.specialization,
        clinicName: doctor.clinic_name
      }
    }));

    res.json({
      success: true,
      doctors: transformedDoctors,
    });
  } catch (error) {
    next(error);
  }
}; 