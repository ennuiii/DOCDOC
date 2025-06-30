import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Avatar,
  Checkbox,
  LinearProgress,
  Alert,
  Autocomplete,
  Divider,
  FormControlLabel,
  Switch,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as DocumentIcon,
  Share as ShareIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Public as PublicIcon,
  Lock as PrivateIcon,
  Search as SearchIcon,
  Category as CategoryIcon,
  Business as CompanyIcon,
  CalendarToday as DateIcon,
  GetApp as DownloadFileIcon,
  Person as PersonIcon,
  RemoveCircle as RemoveCircleIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSnackbar } from 'notistack';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import dayjs from 'dayjs';

// Audit logging function
const logAuditEvent = async (action, resourceType, resourceId, details = {}) => {
  try {
    await supabase
      .from('audit_logs')
      .insert({
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details,
        created_at: new Date().toISOString(),
      });
  } catch (error) {
    console.warn('Failed to log audit event:', error);
  }
};

const Research = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const fileInputRef = useRef();

  const [activeTab, setActiveTab] = useState(() => {
    if (user?.role === 'pharma') {
      return 0; // "My Uploads"
    } else if (user?.role === 'doctor') {
      return 0; // "Shared with Me"
    }
    return 0;
  });
  
  const [uploadDialog, setUploadDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [unshareDialog, setUnshareDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedDoctors, setSelectedDoctors] = useState([]);
  const [unshareData, setUnshareData] = useState(null); // { shareId, doctorName, documentTitle }
  const [filters, setFilters] = useState({
    category: '',
    search: '',
  });

  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    category: 'other',
    tags: '',
    isPublic: false,
    file: null,
  });

  // Fetch research documents
  const { data: documents = [], isLoading, error: documentsError } = useQuery(
    ['research', activeTab, filters],
    async () => {
      console.log('🔍 Fetching research documents...');
      console.log('🔍 User:', { id: user?.id, role: user?.role, email: user?.email });
      console.log('🔍 Active tab:', activeTab);
      console.log('🔍 Filters:', filters);

      let query = supabase
        .from('research_documents')
        .select(`
          *,
          uploadedBy:users!uploaded_by_id(
            id,
            first_name,
            last_name,
            email,
            company_name
          ),
          research_shares(
            id,
            access_level,
            shared_at,
            doctor:users!doctor_id(
              id,
              first_name,
              last_name,
              email,
              specialization
            )
          )
        `)
        .order('created_at', { ascending: false });

      // Filter by role and visibility
      if (user?.role === 'pharma') {
        // Pharma users see only their uploads
        query = query.eq('uploaded_by_id', user.id);
        console.log('🔍 Pharma user: filtering by uploaded_by_id =', user.id);
      } else if (user?.role === 'doctor') {
        // For doctors, we'll get all documents and filter client-side
        // This avoids the PostgREST limitation with nested relations in or clauses
        console.log('🔍 Doctor user: getting all documents for client-side filtering');
        
        // Simplified query to avoid recursion - get documents and shares separately
        const [documentsResult, sharesResult] = await Promise.all([
          // Get all documents with basic info
          supabase
            .from('research_documents')
            .select(`
              *,
              uploadedBy:users!uploaded_by_id(
                id,
                first_name,
                last_name,
                email,
                company_name
              )
            `)
            .order('created_at', { ascending: false }),
          
          // Get shares separately to avoid recursion
          supabase
            .from('research_shares')
            .select(`
              *,
              doctor:users!doctor_id(
                id,
                first_name,
                last_name,
                email,
                specialization
              )
            `)
        ]);

        if (documentsResult.error) {
          throw documentsResult.error;
        }
        
        if (sharesResult.error) {
          console.warn('⚠️ Shares query failed, continuing without shares:', sharesResult.error);
        }

        // Manually attach shares to documents
        const documents = documentsResult.data || [];
        const shares = sharesResult.data || [];
        
        documents.forEach(doc => {
          doc.research_shares = shares.filter(share => share.research_id === doc.id);
        });
        
        console.log('📋 Total documents fetched:', documents.length);
        console.log('📋 Total shares fetched:', shares.length);
        
        // Add computed full_name for display
        let documentsWithFullName = documents.map(doc => ({
          ...doc,
          uploadedBy: doc.uploadedBy ? {
            ...doc.uploadedBy,
            full_name: `${doc.uploadedBy.first_name || ''} ${doc.uploadedBy.last_name || ''}`.trim() || doc.uploadedBy.email
          } : null,
          research_shares: (doc.research_shares || []).map(share => ({
            ...share,
            doctor: share.doctor ? {
              ...share.doctor,
              full_name: `${share.doctor.first_name || ''} ${share.doctor.last_name || ''}`.trim() || share.doctor.email
            } : null
          }))
        }));

        // Filter documents for doctors (client-side filtering)
        console.log('🔍 Doctor filtering documents. User ID:', user.id);
        console.log('🔍 Total documents before filtering:', documentsWithFullName.length);
        
        // Filter based on active tab
        if (activeTab === 0) {
          // Tab 0: "Shared with Me" - only documents shared with this doctor
          const beforeFilter = documentsWithFullName.length;
          documentsWithFullName = documentsWithFullName.filter(doc => {
            const isSharedWithDoctor = doc.research_shares.some(share => 
              share.doctor_id === user.id
            );
            console.log(`🔍 Document "${doc.title}" shared with doctor (${user.id}):`, isSharedWithDoctor);
            return isSharedWithDoctor;
          });
          console.log(`🔍 Filtered shared documents: ${beforeFilter} → ${documentsWithFullName.length}`);
        } else if (activeTab === 1) {
          // Tab 1: "Public Library" - only public documents
          const beforeFilter = documentsWithFullName.length;
          documentsWithFullName = documentsWithFullName.filter(doc => {
            console.log(`🔍 Document "${doc.title}" is public:`, doc.is_public);
            return doc.is_public;
          });
          console.log(`🔍 Filtered public documents: ${beforeFilter} → ${documentsWithFullName.length}`);
        }
        
        console.log('🔍 Final documents after filtering:', documentsWithFullName.length);
        
        // Log audit event and return early for doctors
        if (documentsWithFullName && documentsWithFullName.length > 0) {
          await logAuditEvent('view_list', 'research_documents', null, {
            accessed_by: user.id,
            document_count: documentsWithFullName.length,
            filters: filters,
            active_tab: activeTab,
          });
        }
        
        return documentsWithFullName;
      }

      // Apply additional filters
      if (filters.category) {
        query = query.eq('category', filters.category);
        console.log('🔍 Applying category filter:', filters.category);
      }
      if (filters.search) {
        query = query.textSearch('title,description', filters.search);
        console.log('🔍 Applying search filter:', filters.search);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Research documents query error:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('✅ Raw query result:', {
        count: data?.length || 0,
        documents: data?.map(d => ({
          id: d.id,
          title: d.title,
          is_public: d.is_public,
          uploaded_by_id: d.uploaded_by_id,
          shares_count: d.research_shares?.length || 0,
          shares: d.research_shares?.map(s => ({
            doctor_id: s.doctor_id,
            doctor_name: s.doctor?.first_name + ' ' + s.doctor?.last_name
          }))
        }))
      });

      // Add computed full_name for display
      let documentsWithFullName = (data || []).map(doc => ({
        ...doc,
        uploadedBy: doc.uploadedBy ? {
          ...doc.uploadedBy,
          full_name: `${doc.uploadedBy.first_name || ''} ${doc.uploadedBy.last_name || ''}`.trim() || doc.uploadedBy.email
        } : null,
        research_shares: (doc.research_shares || []).map(share => ({
          ...share,
          doctor: share.doctor ? {
            ...share.doctor,
            full_name: `${share.doctor.first_name || ''} ${share.doctor.last_name || ''}`.trim() || share.doctor.email
          } : null
        }))
      }));

      // Log audit event for document access/view
      if (documentsWithFullName && documentsWithFullName.length > 0) {
        await logAuditEvent('view_list', 'research_documents', null, {
          accessed_by: user.id,
          document_count: documentsWithFullName.length,
          filters: filters,
          active_tab: activeTab,
        });
      }

      return documentsWithFullName;
    },
    {
      retry: 1,
      onError: (error) => {
        console.error('Documents query failed:', error);
        enqueueSnackbar('Failed to load research documents. Please try again.', { variant: 'error' });
      }
    }
  );

  // Fetch available doctors for sharing
  const { data: availableDoctors = [] } = useQuery(
    'available-doctors',
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, specialization, clinic_name')
        .eq('role', 'doctor');
      
      if (error) {
        console.error('Available doctors query error:', error);
        throw error;
      }
      
      // Add computed full_name for display
      const doctorsWithFullName = (data || []).map(doctor => ({
        ...doctor,
        full_name: `${doctor.first_name || ''} ${doctor.last_name || ''}`.trim() || doctor.email
      }));
      
      return doctorsWithFullName;
    },
    {
      enabled: user?.role === 'pharma',
      retry: 1,
      onError: (error) => {
        console.error('Failed to load available doctors:', error);
      }
    }
  );

  // Upload mutation
  const uploadMutation = useMutation(
    async (formData) => {
      const file = formData.file;
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      
      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('research-documents')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      // Get public URL for the file
      const { data: { publicUrl } } = supabase.storage
        .from('research-documents')
        .getPublicUrl(fileName);
      
      // Insert document record into database
      const { data, error } = await supabase
        .from('research_documents')
        .insert({
          title: formData.title,
          description: formData.description,
          uploaded_by_id: user.id,
          company_name: user.company_name || 'Unknown Company',
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          category: formData.category,
          tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
          is_public: formData.isPublic,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Log audit event for document upload
      await logAuditEvent('upload', 'research_document', data.id, {
        title: formData.title,
        category: formData.category,
        file_size: file.size,
        file_type: file.type,
        is_public: formData.isPublic,
        uploaded_by: user.id,
      });
      
      return data;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Research document uploaded successfully', { variant: 'success', autoHideDuration: 2000 });
        setUploadDialog(false);
        setUploadForm({
          title: '',
          description: '',
          category: 'other',
          tags: '',
          isPublic: false,
          file: null,
        });
        queryClient.invalidateQueries('research');
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to upload document', { variant: 'error' });
      },
    }
  );

  // Share mutation
  const shareMutation = useMutation(
    async ({ documentId, doctorIds, accessLevel }) => {
      // Get document details for notifications
      const { data: document, error: docError } = await supabase
        .from('research_documents')
        .select('title, description, category')
        .eq('id', documentId)
        .single();
      
      if (docError) throw docError;

      const shares = doctorIds.map(doctorId => ({
        research_id: documentId,
        doctor_id: doctorId,
        access_level: accessLevel,
      }));
      
      const { data, error } = await supabase
        .from('research_shares')
        .insert(shares)
        .select();
      
      if (error) throw error;

      // Create notifications for each doctor
      const notifications = doctorIds.map(doctorId => ({
        recipient_id: doctorId,
        type: 'research-shared',
        title: 'Research Document Shared',
        message: `${user.first_name} ${user.last_name} from ${user.company_name} has shared a research document "${document.title}" with you.`,
        data: {
          document_id: documentId,
          document_title: document.title,
          category: document.category,
          shared_by: user.id,
          shared_by_name: `${user.first_name} ${user.last_name}`,
          company_name: user.company_name,
          access_level: accessLevel,
          link: '/research'
        },
        priority: 'medium'
      }));

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notificationError) {
        console.error('Failed to create notifications:', notificationError);
      }
      
      // Log audit event for document sharing
      await logAuditEvent('share', 'research_document', documentId, {
        shared_with: doctorIds,
        access_level: accessLevel,
        shared_by: user.id,
        share_count: doctorIds.length,
      });
      
      return data;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Document shared successfully', { variant: 'success', autoHideDuration: 2000 });
        setShareDialog(false);
        setSelectedDoctors([]);
        queryClient.invalidateQueries('research');
        queryClient.invalidateQueries('notifications'); // Refresh notifications
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to share document', { variant: 'error' });
      },
    }
  );

  // Unshare mutation
  const unshareMutation = useMutation(
    async ({ documentId, doctorId, shareId }) => {
      // Get document details for notification
      const { data: document, error: docError } = await supabase
        .from('research_documents')
        .select('title, description, category')
        .eq('id', documentId)
        .single();
      
      if (docError) throw docError;

      const { error } = await supabase
        .from('research_shares')
        .delete()
        .eq('id', shareId);
      
      if (error) throw error;

      // Create notification for the doctor whose access was removed
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: doctorId,
          type: 'research-unshared',
          title: 'Research Access Removed',
          message: `Your access to the research document "${document.title}" has been removed by ${user.first_name} ${user.last_name} from ${user.company_name}.`,
          data: {
            document_id: documentId,
            document_title: document.title,
            category: document.category,
            removed_by: user.id,
            removed_by_name: `${user.first_name} ${user.last_name}`,
            company_name: user.company_name,
            link: '/research'
          },
          priority: 'medium'
        });

      if (notificationError) {
        console.error('Failed to create notification:', notificationError);
      }
      
      // Log audit event for document unsharing
      await logAuditEvent('unshare', 'research_document', documentId, {
        unshared_with: doctorId,
        unshared_by: user.id,
      });
      
      return { shareId, doctorId, documentId };
    },
    {
      onSuccess: (data) => {
        enqueueSnackbar('Document access revoked successfully', { variant: 'success', autoHideDuration: 2000 });
        queryClient.invalidateQueries('research');
        queryClient.invalidateQueries('notifications'); // Refresh notifications
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to revoke document access', { variant: 'error' });
      },
    }
  );

  // Update mutation
  const updateMutation = useMutation(
    async ({ id, ...data }) => {
      const { data: updatedData, error } = await supabase
        .from('research_documents')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Log audit event for document update
      await logAuditEvent('update', 'research_document', id, {
        updated_fields: Object.keys(data),
        updated_by: user.id,
        changes: data,
      });
      
      return updatedData;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Document updated successfully', { variant: 'success', autoHideDuration: 2000 });
        setEditDialog(false);
        queryClient.invalidateQueries('research');
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to update document', { variant: 'error' });
      },
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    async (id) => {
      // First, get the document to find the file URL
      const { data: document, error: fetchError } = await supabase
        .from('research_documents')
        .select('file_url')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Extract file path from URL for storage deletion
      const fileUrl = document.file_url;
      const fileName = fileUrl.split('/').pop(); // Get filename from URL
      const filePath = `${user.id}/${fileName}`;
      
      // Delete the file from storage
      const { error: storageError } = await supabase.storage
        .from('research-documents')
        .remove([filePath]);
      
      if (storageError) console.warn('Failed to delete file from storage:', storageError);
      
      // Delete the database record
      const { error } = await supabase
        .from('research_documents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Log audit event for document deletion
      await logAuditEvent('delete', 'research_document', id, {
        file_name: document.file_name,
        file_size: document.file_size,
        deleted_by: user.id,
        storage_path: filePath,
      });
      
      return { id };
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Document deleted successfully', { variant: 'success', autoHideDuration: 2000 });
        queryClient.invalidateQueries('research');
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to delete document', { variant: 'error' });
      },
    }
  );

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadForm({ ...uploadForm, file });
    }
  };

  const handleUpload = () => {
    uploadMutation.mutate(uploadForm);
  };

  const handleShare = () => {
    shareMutation.mutate({
      documentId: selectedDocument.id,
      doctorIds: selectedDoctors.map(doc => doc.id),
      accessLevel: 'view',
    });
  };

  const handleUnshareConfirm = () => {
    if (unshareData) {
      unshareMutation.mutate({
        documentId: selectedDocument.id,
        doctorId: unshareData.doctorId,
        shareId: unshareData.shareId
      });
      setUnshareDialog(false);
      setUnshareData(null);
    }
  };

  const handleDownload = async (document) => {
    try {
      // Increment download count
      await supabase
        .from('research_documents')
        .update({ downloads: (document.downloads || 0) + 1 })
        .eq('id', document.id);
      
      // Log audit event for document download
      await logAuditEvent('download', 'research_document', document.id, {
        title: document.title,
        file_name: document.file_name,
        file_size: document.file_size,
        downloaded_by: user.id,
        download_count: (document.downloads || 0) + 1,
      });
      
      window.open(document.file_url, '_blank');
      enqueueSnackbar('Download started', { variant: 'info' });
      
      // Refresh the documents list to show updated download count
      queryClient.invalidateQueries('research');
    } catch (error) {
      enqueueSnackbar('Failed to download document', { variant: 'error' });
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getCategoryColor = (category) => {
    const colors = {
      'clinical-trial': 'primary',
      'product-info': 'secondary',
      'safety-data': 'error',
      'efficacy-study': 'warning',
      'market-research': 'info',
      'other': 'default',
    };
    return colors[category] || 'default';
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Research Library</Typography>
        {user?.role === 'pharma' && (
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialog(true)}
          >
            Upload Research
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search documents..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={filters.category}
                label="Category"
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              >
                <MenuItem value="">All Categories</MenuItem>
                <MenuItem value="clinical-trial">Clinical Trial</MenuItem>
                <MenuItem value="product-info">Product Info</MenuItem>
                <MenuItem value="safety-data">Safety Data</MenuItem>
                <MenuItem value="efficacy-study">Efficacy Study</MenuItem>
                <MenuItem value="market-research">Market Research</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      {user?.role === 'pharma' && (
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="My Uploads" />
          <Tab label="Public Library" />
        </Tabs>
      )}
      
      {user?.role === 'doctor' && (
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
          <Tab label="Shared with Me" />
          <Tab label="Public Library" />
        </Tabs>
      )}

      {/* Document Grid */}
      {isLoading ? (
        <LinearProgress />
      ) : documents?.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DocumentIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No research documents found
          </Typography>
          {user?.role === 'pharma' && activeTab === 0 && (
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialog(true)}
              sx={{ mt: 2 }}
            >
              Upload Your First Document
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {documents.map((doc) => (
            <Grid item xs={12} md={6} lg={4} key={doc.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="start" justifyContent="space-between" mb={1}>
                    <Avatar sx={{ bgcolor: 'primary.light' }}>
                      <DocumentIcon />
                    </Avatar>
                    {doc.is_public ? (
                      <Chip icon={<PublicIcon />} label="Public" size="small" color="primary" />
                    ) : (
                      <Chip icon={<PrivateIcon />} label="Private" size="small" />
                    )}
                  </Box>
                  
                  <Typography variant="h6" gutterBottom noWrap>
                    {doc.title}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, height: 40, overflow: 'hidden' }}>
                    {doc.description}
                  </Typography>

                  <Box mb={1}>
                    <Chip
                      label={doc.category}
                      size="small"
                      color={getCategoryColor(doc.category)}
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(doc.file_size)}
                    </Typography>
                  </Box>

                  {doc.tags?.length > 0 && (
                    <Box mb={1}>
                      {doc.tags.slice(0, 3).map((tag, index) => (
                        <Chip key={index} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                      ))}
                    </Box>
                  )}

                  <Box display="flex" alignItems="center" gap={2} mt={2}>
                    <Typography variant="caption" color="text.secondary">
                      <CompanyIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                      {doc.company_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      <DateIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                      {dayjs(doc.created_at).format('MMM D, YYYY')}
                    </Typography>
                  </Box>

                  {doc.research_shares?.length > 0 && user?.role === 'pharma' && (
                    <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block' }}>
                      Shared with {doc.research_shares.length} doctor{doc.research_shares.length !== 1 ? 's' : ''}
                    </Typography>
                  )}
                </CardContent>

                <CardActions>
                  <Tooltip title="Download">
                    <IconButton size="small" onClick={() => handleDownload(doc)}>
                      <DownloadFileIcon />
                    </IconButton>
                  </Tooltip>
                  
                  {user?.id === doc.uploaded_by_id && (
                    <>
                      <Tooltip title="Share">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedDocument(doc);
                            setShareDialog(true);
                          }}
                        >
                          <ShareIcon />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedDocument(doc);
                            setEditDialog(true);
                          }}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this document?')) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  
                  <Box sx={{ flexGrow: 1 }} />
                  
                  <Box display="flex" alignItems="center" gap={1}>
                    <ViewIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {doc.views}
                    </Typography>
                    <DownloadIcon sx={{ fontSize: 16, color: 'text.secondary', ml: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      {doc.downloads}
                    </Typography>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Research Document</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf"
            />
            
            <Button
              fullWidth
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current.click()}
              sx={{ mb: 3, py: 2 }}
            >
              {uploadForm.file ? uploadForm.file.name : 'Select File'}
            </Button>

            <TextField
              fullWidth
              label="Title"
              value={uploadForm.title}
              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              value={uploadForm.description}
              onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
              sx={{ mb: 2 }}
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={uploadForm.category}
                label="Category"
                onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
              >
                <MenuItem value="clinical-trial">Clinical Trial</MenuItem>
                <MenuItem value="product-info">Product Info</MenuItem>
                <MenuItem value="safety-data">Safety Data</MenuItem>
                <MenuItem value="efficacy-study">Efficacy Study</MenuItem>
                <MenuItem value="market-research">Market Research</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Tags (comma separated)"
              value={uploadForm.tags}
              onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
              placeholder="e.g., cardiology, hypertension, phase-3"
              sx={{ mb: 2 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={uploadForm.isPublic}
                  onChange={(e) => setUploadForm({ ...uploadForm, isPublic: e.target.checked })}
                />
              }
              label="Make this document public (visible to all doctors)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!uploadForm.file || !uploadForm.title || !uploadForm.description || uploadMutation.isLoading}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialog} onClose={() => setShareDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Share Document</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select doctors to share "{selectedDocument?.title}" with:
            </Typography>

            <Autocomplete
              multiple
              options={availableDoctors || []}
              value={selectedDoctors}
              onChange={(e, value) => setSelectedDoctors(value)}
              getOptionLabel={(option) => `Dr. ${option.full_name} - ${option.specialization}`}
              renderInput={(params) => (
                <TextField {...params} label="Select Doctors" placeholder="Search doctors..." />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <ListItemText
                    primary={`Dr. ${option.full_name}`}
                    secondary={`${option.specialization} - ${option.clinic_name}`}
                  />
                </Box>
              )}
            />

            {selectedDocument?.research_shares?.length > 0 && (
              <Box mt={3}>
                <Typography variant="subtitle2" gutterBottom>
                  Currently Shared With:
                </Typography>
                <List dense>
                  {selectedDocument.research_shares.map((share) => (
                    <ListItem key={share.id} sx={{ px: 0 }}>
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.light', width: 32, height: 32 }}>
                          <PersonIcon fontSize="small" />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={`Dr. ${share.doctor.full_name}`}
                        secondary={`${share.doctor.specialization} • Shared on ${dayjs(share.shared_at).format('MMM D, YYYY')}`}
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title="Revoke Access">
                          <IconButton
                            edge="end"
                            size="small"
                            color="error"
                            onClick={() => {
                              setUnshareData({
                                shareId: share.id,
                                doctorId: share.doctor_id,
                                doctorName: share.doctor.full_name,
                                documentTitle: selectedDocument.title
                              });
                              setUnshareDialog(true);
                            }}
                            disabled={unshareMutation.isLoading}
                          >
                            <RemoveCircleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleShare}
            disabled={selectedDoctors.length === 0 || shareMutation.isLoading}
          >
            Share
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Document</DialogTitle>
        <DialogContent>
          {selectedDocument && (
            <Box sx={{ pt: 2 }}>
              <TextField
                fullWidth
                label="Title"
                defaultValue={selectedDocument.title}
                onChange={(e) => setSelectedDocument({ ...selectedDocument, title: e.target.value })}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                defaultValue={selectedDocument.description}
                onChange={(e) => setSelectedDocument({ ...selectedDocument, description: e.target.value })}
                sx={{ mb: 2 }}
              />

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Category</InputLabel>
                <Select
                  value={selectedDocument.category}
                  label="Category"
                  onChange={(e) => setSelectedDocument({ ...selectedDocument, category: e.target.value })}
                >
                  <MenuItem value="clinical-trial">Clinical Trial</MenuItem>
                  <MenuItem value="product-info">Product Info</MenuItem>
                  <MenuItem value="safety-data">Safety Data</MenuItem>
                  <MenuItem value="efficacy-study">Efficacy Study</MenuItem>
                  <MenuItem value="market-research">Market Research</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Tags (comma separated)"
                defaultValue={selectedDocument.tags?.join(', ')}
                onChange={(e) => setSelectedDocument({ ...selectedDocument, tags: e.target.value })}
                sx={{ mb: 2 }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={selectedDocument.is_public}
                    onChange={(e) => setSelectedDocument({ ...selectedDocument, is_public: e.target.checked })}
                  />
                }
                label="Make this document public"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              updateMutation.mutate({
                id: selectedDocument.id,
                title: selectedDocument.title,
                description: selectedDocument.description,
                category: selectedDocument.category,
                tags: selectedDocument.tags.split(',').map(tag => tag.trim()),
                is_public: selectedDocument.is_public,
              });
            }}
            disabled={updateMutation.isLoading}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unshare Confirmation Dialog */}
      <Dialog open={unshareDialog} onClose={() => setUnshareDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RemoveCircleIcon color="error" />
          Revoke Access
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to revoke access to <strong>"{unshareData?.documentTitle}"</strong> for <strong>Dr. {unshareData?.doctorName}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            They will no longer be able to view or download this document.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnshareDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleUnshareConfirm}
            disabled={unshareMutation.isLoading}
            startIcon={<RemoveCircleIcon />}
          >
            Revoke Access
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Research; 