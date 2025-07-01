import { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  TextField,
  Button,
  Avatar,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Person as PersonIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  MedicalServices as MedicalIcon,
  Badge as BadgeIcon,
  Security as SecurityIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useSnackbar } from 'notistack';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    specialization: '',
    address: '',
    title: '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Load user profile data
  useEffect(() => {
    if (user) {
      setProfileData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        company_name: user.company_name || '',
        specialization: user.specialization || '',
        address: user.address || '',
        title: user.title || '',
      });
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update(profileData)
        .eq('id', user.id);

      if (error) throw error;

      // Update the user context
      await updateUser();
      
      enqueueSnackbar('Profile updated successfully', { variant: 'success', autoHideDuration: 2000 });
      setEditing(false);
    } catch (error) {
      console.error('Profile update error:', error);
      enqueueSnackbar(error.message || 'Failed to update profile', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      enqueueSnackbar('New passwords do not match', { variant: 'error' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      enqueueSnackbar('Password must be at least 6 characters long', { variant: 'error' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;

      enqueueSnackbar('Password updated successfully', { variant: 'success', autoHideDuration: 2000 });
      setShowPasswordDialog(false);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Password update error:', error);
      enqueueSnackbar(error.message || 'Failed to update password', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'doctor': return 'primary';
      case 'pharma': return 'secondary';
      case 'admin': return 'error';
      case 'staff': return 'warning';
      default: return 'default';
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'doctor': return <MedicalIcon />;
      case 'pharma': return <BusinessIcon />;
      case 'admin': return <SecurityIcon />;
      case 'staff': return <BadgeIcon />;
      default: return <PersonIcon />;
    }
  };

  if (!user) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 4 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar
              sx={{ 
                width: 64, 
                height: 64, 
                bgcolor: getRoleColor(user.role) + '.main' 
              }}
            >
              {getRoleIcon(user.role)}
            </Avatar>
            <Box>
              <Typography variant="h4" component="h1">
                {user.first_name} {user.last_name}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mt={1}>
                <Chip
                  icon={getRoleIcon(user.role)}
                  label={user.role?.charAt(0).toUpperCase() + user.role?.slice(1)}
                  color={getRoleColor(user.role)}
                  variant="outlined"
                />
                {user.specialization && (
                  <Chip
                    label={user.specialization}
                    variant="outlined"
                    size="small"
                  />
                )}
              </Box>
            </Box>
          </Box>
          
          <Box display="flex" gap={1}>
            {!editing ? (
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => setEditing(true)}
              >
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  onClick={() => {
                    setEditing(false);
                    // Reset form data
                    setProfileData({
                      first_name: user.first_name || '',
                      last_name: user.last_name || '',
                      email: user.email || '',
                      phone: user.phone || '',
                      company_name: user.company_name || '',
                      specialization: user.specialization || '',
                      address: user.address || '',
                      title: user.title || '',
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveProfile}
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Profile Form */}
        <Grid container spacing={3}>
          {/* Basic Information */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Basic Information
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="First Name"
              value={profileData.first_name}
              onChange={(e) => handleInputChange('first_name', e.target.value)}
              disabled={!editing}
              InputProps={{
                startAdornment: <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Last Name"
              value={profileData.last_name}
              onChange={(e) => handleInputChange('last_name', e.target.value)}
              disabled={!editing}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Email"
              value={profileData.email}
              disabled // Email cannot be changed directly
              InputProps={{
                startAdornment: <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              helperText="Contact support to change your email address"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Phone"
              value={profileData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              disabled={!editing}
              InputProps={{
                startAdornment: <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>

          {/* Role-specific fields */}
          {user.role === 'doctor' && (
            <>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Title"
                  value={profileData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  disabled={!editing}
                  placeholder="Dr., Prof., etc."
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Specialization"
                  value={profileData.specialization}
                  onChange={(e) => handleInputChange('specialization', e.target.value)}
                  disabled={!editing}
                  InputProps={{
                    startAdornment: <MedicalIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                />
              </Grid>
            </>
          )}

          {user.role === 'pharma' && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Company Name"
                value={profileData.company_name}
                onChange={(e) => handleInputChange('company_name', e.target.value)}
                disabled={!editing}
                InputProps={{
                  startAdornment: <BusinessIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Grid>
          )}

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Address"
              value={profileData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              disabled={!editing}
              multiline
              rows={2}
              InputProps={{
                startAdornment: <LocationIcon sx={{ mr: 1, color: 'text.secondary', alignSelf: 'flex-start', mt: 1 }} />,
              }}
            />
          </Grid>


        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Security Section */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Security
          </Typography>
          <Card variant="outlined">
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="subtitle1">Password</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last updated: {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'Unknown'}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={() => setShowPasswordDialog(true)}
                  startIcon={<SecurityIcon />}
                >
                  Change Password
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Account Info */}
        <Box mt={3}>
          <Typography variant="h6" gutterBottom>
            Account Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Account Created
              </Typography>
              <Typography variant="body1">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Last Updated
              </Typography>
              <Typography variant="body1">
                {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : 'Unknown'}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Password Change Dialog */}
      <Dialog
        open={showPasswordDialog}
        onClose={() => setShowPasswordDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
              margin="normal"
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    edge="end"
                  >
                    {showNewPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Confirm New Password"
              type={showPassword ? 'text' : 'password'}
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              margin="normal"
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                ),
              }}
            />
            {passwordData.newPassword && passwordData.confirmPassword && 
             passwordData.newPassword !== passwordData.confirmPassword && (
              <Alert severity="error" sx={{ mt: 1 }}>
                Passwords do not match
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
          <Button
            onClick={handlePasswordChange}
            variant="contained"
            disabled={loading || !passwordData.newPassword || !passwordData.confirmPassword}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Profile;