import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  TextField,
  Typography,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  InputAdornment,
  IconButton,
  Divider,
  FormHelperText,
  Paper,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Person,
  Email,
  Lock,
  Business,
  LocalHospital,
  Phone,
  Badge,
  LocationOn,
  Assignment,
  Home,
  LocationCity,
  ArrowBack,
  ArrowForward,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from 'notistack';
import AnimatedButton from '../components/ui/AnimatedButton';
import GlassCard from '../components/ui/GlassCard';

const Register = () => {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: '',
    phone: '',
    // Address fields
    street: '',
    streetNumber: '',
    city: '',
    postCode: '',
    state: '',
    country: '',
    // Doctor fields
    specialization: '',
    licenseNumber: '',
    clinicName: '',
    // Pharma fields
    companyName: '',
    companyRegistration: '',
    // Staff fields
    assignedDoctorId: ''
  });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Common validations
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';

    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';

    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.role) newErrors.role = 'Please select a role';

    // Address validations
    if (!formData.street) newErrors.street = 'Street is required';
    if (!formData.streetNumber) newErrors.streetNumber = 'Street number is required';
    if (!formData.city) newErrors.city = 'City is required';
    if (!formData.postCode) newErrors.postCode = 'Post code is required';

    // Role-specific validations
    if (formData.role === 'doctor') {
      if (!formData.specialization) newErrors.specialization = 'Specialization is required';
      if (!formData.licenseNumber) newErrors.licenseNumber = 'License number is required';
      if (!formData.clinicName) newErrors.clinicName = 'Clinic name is required';
      if (!formData.phone) newErrors.phone = 'Phone number is required';
    } else if (formData.role === 'pharma') {
      if (!formData.companyName) newErrors.companyName = 'Company name is required';
      if (!formData.companyRegistration) newErrors.companyRegistration = 'Company registration is required';
    } else if (formData.role === 'staff') {
      if (!formData.assignedDoctorId) newErrors.assignedDoctorId = 'Assigned doctor is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Prepare registration data
      const registrationData = {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        phone: formData.phone,
        address: {
          street: formData.street,
          streetNumber: formData.streetNumber,
          city: formData.city,
          postCode: formData.postCode,
          state: formData.state,
          country: formData.country
        }
      };

      // Add role-specific fields
      if (formData.role === 'doctor') {
        registrationData.specialization = formData.specialization;
        registrationData.licenseNumber = formData.licenseNumber;
        registrationData.clinicName = formData.clinicName;
      } else if (formData.role === 'pharma') {
        registrationData.companyName = formData.companyName;
        registrationData.companyRegistration = formData.companyRegistration;
      } else if (formData.role === 'staff') {
        registrationData.assignedDoctorId = formData.assignedDoctorId;
      }

      console.log('Submitting registration data:', registrationData);
      const result = await signUp(registrationData);
      
      if (result.success) {
        enqueueSnackbar(result.message, { variant: 'success' });
        
        if (result.emailConfirmationRequired) {
          // Email confirmation required - redirect to login with info message
                  enqueueSnackbar('Please check your email and click the confirmation link, then return to log in.', {
          variant: 'info',
          autoHideDuration: 3000 
          });
          navigate('/login', { 
            state: { 
              message: 'Registration successful! Please check your email to verify your account before signing in.',
              email: formData.email 
            } 
          });
        } else {
          // No email confirmation needed - try auto-login
          try {
            await signIn(formData.email, formData.password);
            navigate('/dashboard');
          } catch (loginError) {
            // If auto-login fails, redirect to login page
            enqueueSnackbar('Registration successful! Please log in.', { variant: 'info' });
            navigate('/login');
          }
        }
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
      enqueueSnackbar(err.message || 'Registration failed. Please try again.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const renderRoleSpecificFields = () => {
    if (formData.role === 'doctor') {
      return (
        <>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              name="specialization"
              label="Specialization"
              value={formData.specialization}
              onChange={handleChange}
              error={!!errors.specialization}
              helperText={errors.specialization}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LocalHospital />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              name="licenseNumber"
              label="License Number"
              value={formData.licenseNumber}
              onChange={handleChange}
              error={!!errors.licenseNumber}
              helperText={errors.licenseNumber}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Badge />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              name="clinicName"
              label="Clinic/Hospital Name"
              value={formData.clinicName}
              onChange={handleChange}
              error={!!errors.clinicName}
              helperText={errors.clinicName}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Business />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              name="phone"
              label="Phone Number"
              value={formData.phone}
              onChange={handleChange}
              error={!!errors.phone}
              helperText={errors.phone}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Phone />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </>
      );
    } else if (formData.role === 'pharma') {
      return (
        <>
          <Grid item xs={12}>
            <TextField
              fullWidth
              name="companyName"
              label="Company Name"
              value={formData.companyName}
              onChange={handleChange}
              error={!!errors.companyName}
              helperText={errors.companyName}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Business />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              name="companyRegistration"
              label="Company Registration Number"
              value={formData.companyRegistration}
              onChange={handleChange}
              error={!!errors.companyRegistration}
              helperText={errors.companyRegistration}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Assignment />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </>
      );
    }
    return null;
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decorative elements */}
      <Box
        sx={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          animation: 'float 6s ease-in-out infinite',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -150,
          left: -150,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          animation: 'float 8s ease-in-out infinite reverse',
        }}
      />

      <GlassCard
        intensity="medium"
        sx={{
          width: '100%',
          maxWidth: 800,
          p: 4,
          animation: 'slideUp 0.6s ease-out',
        }}
      >
        {/* Header */}
        <Box textAlign="center" mb={4}>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            Join Pharmadoc
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 2, fontWeight: 500 }}
          >
            Connect with healthcare professionals and pharmaceutical companies
          </Typography>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: 2,
              animation: 'fadeIn 0.5s ease-in-out',
            }}
          >
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Role Selection */}
            <Grid item xs={12}>
              <Paper
                sx={{
                  p: 3,
                  borderRadius: 3,
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                  border: '1px solid #bae6fd',
                }}
              >
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: '#0369a1' }}>
                  I am a...
                </Typography>
                <FormControl fullWidth error={!!errors.role}>
                  <Select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    displayEmpty
                    sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: 2,
                      '& .MuiOutlinedInput-notchedOutline': {
                        border: 'none',
                      },
                    }}
                  >
                    <MenuItem value="" disabled>
                      Select your role
                    </MenuItem>
                    <MenuItem value="doctor">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocalHospital sx={{ color: '#059669' }} />
                        Doctor / Healthcare Professional
                      </Box>
                    </MenuItem>
                    <MenuItem value="pharma">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Business sx={{ color: '#7c3aed' }} />
                        Pharmaceutical Representative
                      </Box>
                    </MenuItem>
                  </Select>
                  {errors.role && <FormHelperText>{errors.role}</FormHelperText>}
                </FormControl>
              </Paper>
            </Grid>

            {/* Personal Information */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Personal Information
                </Typography>
              </Divider>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="firstName"
                label="First Name"
                value={formData.firstName}
                onChange={handleChange}
                error={!!errors.firstName}
                helperText={errors.firstName}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Person sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'white',
                    },
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="lastName"
                label="Last Name"
                value={formData.lastName}
                onChange={handleChange}
                error={!!errors.lastName}
                helperText={errors.lastName}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Person sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'white',
                    },
                  },
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                name="email"
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={handleChange}
                error={!!errors.email}
                helperText={errors.email}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'white',
                    },
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                error={!!errors.password}
                helperText={errors.password}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'white',
                    },
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'white',
                    },
                  },
                }}
              />
            </Grid>

              {/* Address Information */}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }}>
                  <Typography variant="h6" color="text.secondary">
                    Address Information
                  </Typography>
                </Divider>
              </Grid>

              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  name="street"
                  label="Street Name"
                  value={formData.street}
                  onChange={handleChange}
                  error={!!errors.street}
                  helperText={errors.street}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOn />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  name="streetNumber"
                  label="Street Number"
                  value={formData.streetNumber}
                  onChange={handleChange}
                  error={!!errors.streetNumber}
                  helperText={errors.streetNumber}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Home />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  name="city"
                  label="City"
                  value={formData.city}
                  onChange={handleChange}
                  error={!!errors.city}
                  helperText={errors.city}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationCity />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  name="postCode"
                  label="Post Code"
                  value={formData.postCode}
                  onChange={handleChange}
                  error={!!errors.postCode}
                  helperText={errors.postCode}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  name="state"
                  label="State/Province (Optional)"
                  value={formData.state}
                  onChange={handleChange}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  name="country"
                  label="Country (Optional)"
                  value={formData.country}
                  onChange={handleChange}
                />
              </Grid>

              {/* Role-specific fields */}
              {formData.role && (
                <>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }}>
                      <Typography variant="h6" color="text.secondary">
                        {formData.role === 'doctor' ? 'Professional Information' : 'Company Information'}
                      </Typography>
                    </Divider>
                  </Grid>
                  {renderRoleSpecificFields()}
                </>
              )}

            <Grid item xs={12}>
              <AnimatedButton
                type="submit"
                fullWidth
                variant="contained"
                animationType="gradient"
                loading={loading}
                loadingText="Creating Account..."
                sx={{
                  mt: 4,
                  mb: 3,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                }}
              >
                Create Account
              </AnimatedButton>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?
                </Typography>
              </Divider>
              <Box sx={{ textAlign: 'center' }}>
                <Link
                  to="/login"
                  style={{
                    color: '#2563eb',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  Sign in to your account
                </Link>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </GlassCard>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </Box>
  );
};

export default Register; 