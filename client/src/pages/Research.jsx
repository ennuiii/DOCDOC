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
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSnackbar } from 'notistack';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import dayjs from 'dayjs';

const Research = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const fileInputRef = useRef();

  const [activeTab, setActiveTab] = useState(user?.role === 'pharma' ? 0 : 1);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedDoctors, setSelectedDoctors] = useState([]);
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
  const { data: documents, isLoading } = useQuery(
    ['research', activeTab, filters],
    async () => {
      const params = {
        ...filters,
        ...(activeTab === 0 && user?.role === 'pharma' ? {} : { public: true }),
      };
      const response = await api.get('/research', { params });
      return response.data.documents;
    }
  );

  // Fetch available doctors for sharing
  const { data: availableDoctors } = useQuery(
    'available-doctors',
    async () => {
      const response = await api.get('/research/doctors');
      return response.data.doctors;
    },
    {
      enabled: user?.role === 'pharma',
    }
  );

  // Upload mutation
  const uploadMutation = useMutation(
    async (formData) => {
      const response = await api.post('/research', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Research document uploaded successfully', { variant: 'success' });
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
        enqueueSnackbar(error.response?.data?.message || 'Failed to upload document', { variant: 'error' });
      },
    }
  );

  // Share mutation
  const shareMutation = useMutation(
    async ({ documentId, doctorIds, accessLevel }) => {
      const response = await api.post(`/research/${documentId}/share`, {
        doctorIds,
        accessLevel,
      });
      return response.data;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Document shared successfully', { variant: 'success' });
        setShareDialog(false);
        setSelectedDoctors([]);
        queryClient.invalidateQueries('research');
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.message || 'Failed to share document', { variant: 'error' });
      },
    }
  );

  // Update mutation
  const updateMutation = useMutation(
    async ({ id, ...data }) => {
      const response = await api.put(`/research/${id}`, data);
      return response.data;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Document updated successfully', { variant: 'success' });
        setEditDialog(false);
        queryClient.invalidateQueries('research');
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.message || 'Failed to update document', { variant: 'error' });
      },
    }
  );

  // Delete mutation
  const deleteMutation = useMutation(
    async (id) => {
      const response = await api.delete(`/research/${id}`);
      return response.data;
    },
    {
      onSuccess: () => {
        enqueueSnackbar('Document deleted successfully', { variant: 'success' });
        queryClient.invalidateQueries('research');
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.message || 'Failed to delete document', { variant: 'error' });
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
    const formData = new FormData();
    formData.append('file', uploadForm.file);
    formData.append('title', uploadForm.title);
    formData.append('description', uploadForm.description);
    formData.append('category', uploadForm.category);
    formData.append('tags', uploadForm.tags);
    formData.append('isPublic', uploadForm.isPublic);

    uploadMutation.mutate(formData);
  };

  const handleShare = () => {
    shareMutation.mutate({
      documentId: selectedDocument._id,
      doctorIds: selectedDoctors.map(doc => doc._id),
      accessLevel: 'view',
    });
  };

  const handleDownload = async (document) => {
    try {
      window.open(`${api.defaults.baseURL}/research/${document._id}/download`, '_blank');
      enqueueSnackbar('Download started', { variant: 'info' });
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
            <Grid item xs={12} md={6} lg={4} key={doc._id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="start" justifyContent="space-between" mb={1}>
                    <Avatar sx={{ bgcolor: 'primary.light' }}>
                      <DocumentIcon />
                    </Avatar>
                    {doc.isPublic ? (
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
                      label={doc.category.replace('-', ' ')}
                      size="small"
                      color={getCategoryColor(doc.category)}
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(doc.fileSize)}
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
                      {doc.companyName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      <DateIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                      {dayjs(doc.createdAt).format('MMM D, YYYY')}
                    </Typography>
                  </Box>

                  {doc.sharedWith?.length > 0 && user?.role === 'pharma' && (
                    <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block' }}>
                      Shared with {doc.sharedWith.length} doctor{doc.sharedWith.length !== 1 ? 's' : ''}
                    </Typography>
                  )}
                </CardContent>

                <CardActions>
                  <Tooltip title="Download">
                    <IconButton size="small" onClick={() => handleDownload(doc)}>
                      <DownloadFileIcon />
                    </IconButton>
                  </Tooltip>
                  
                  {user?._id === doc.uploadedBy._id && (
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
                              deleteMutation.mutate(doc._id);
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
              getOptionLabel={(option) => `Dr. ${option.profile.firstName} ${option.profile.lastName} - ${option.profile.specialization}`}
              renderInput={(params) => (
                <TextField {...params} label="Select Doctors" placeholder="Search doctors..." />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <ListItemText
                    primary={`Dr. ${option.profile.firstName} ${option.profile.lastName}`}
                    secondary={`${option.profile.specialization} - ${option.profile.clinicName}`}
                  />
                </Box>
              )}
            />

            {selectedDocument?.sharedWith?.length > 0 && (
              <Box mt={3}>
                <Typography variant="subtitle2" gutterBottom>
                  Currently Shared With:
                </Typography>
                <List dense>
                  {selectedDocument.sharedWith.map((share) => (
                    <ListItem key={share.doctor._id}>
                      <ListItemText
                        primary={`Dr. ${share.doctor.profile.firstName} ${share.doctor.profile.lastName}`}
                        secondary={`Shared on ${dayjs(share.sharedAt).format('MMM D, YYYY')}`}
                      />
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
                    checked={selectedDocument.isPublic}
                    onChange={(e) => setSelectedDocument({ ...selectedDocument, isPublic: e.target.checked })}
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
                id: selectedDocument._id,
                title: selectedDocument.title,
                description: selectedDocument.description,
                category: selectedDocument.category,
                tags: selectedDocument.tags,
                isPublic: selectedDocument.isPublic.toString(),
              });
            }}
            disabled={updateMutation.isLoading}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Research; 