import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
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
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

const Register = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: '',
    phone: '',
    // Doctor fields
    specialization: '',
    licenseNumber: '',
    clinicName: '',
    clinicAddress: '',
    // Pharma fields
    companyName: '',
    companyRegistration: '',
    companyAddress: '',
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

    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.role) newErrors.role = 'Please select a role';

    // Role-specific validations
    if (formData.role === 'doctor') {
      if (!formData.specialization) newErrors.specialization = 'Specialization is required';
      if (!formData.licenseNumber) newErrors.licenseNumber = 'License number is required';
      if (!formData.clinicName) newErrors.clinicName = 'Clinic name is required';
      if (!formData.clinicAddress) newErrors.clinicAddress = 'Clinic address is required';
      if (!formData.phone) newErrors.phone = 'Phone number is required';
    } else if (formData.role === 'pharma') {
      if (!formData.companyName) newErrors.companyName = 'Company name is required';
      if (!formData.companyRegistration) newErrors.companyRegistration = 'Company registration is required';
      if (!formData.companyAddress) newErrors.companyAddress = 'Company address is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Prepare data based on role
      const registrationData = {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        role: formData.role,
      };

      if (formData.role === 'doctor') {
        registrationData.specialization = formData.specialization;
        registrationData.licenseNumber = formData.licenseNumber;
        registrationData.clinicName = formData.clinicName;
        registrationData.clinicAddress = formData.clinicAddress;
        registrationData.phone = formData.phone;
      } else if (formData.role === 'pharma') {
        registrationData.companyName = formData.companyName;
        registrationData.companyRegistration = formData.companyRegistration;
        registrationData.companyAddress = formData.companyAddress;
      }

      const response = await api.post('/auth/register', registrationData);
      
      // Auto-login after successful registration
      await login(formData.email, formData.password);
      
      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
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
              name="clinicAddress"
              label="Clinic Address"
              value={formData.clinicAddress}
              onChange={handleChange}
              error={!!errors.clinicAddress}
              helperText={errors.clinicAddress}
              multiline
              rows={2}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LocationOn />
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
          <Grid item xs={12}>
            <TextField
              fullWidth
              name="companyAddress"
              label="Company Address"
              value={formData.companyAddress}
              onChange={handleChange}
              error={!!errors.companyAddress}
              helperText={errors.companyAddress}
              multiline
              rows={2}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LocationOn />
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
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Create Account
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Join Pharmadoc to connect doctors and pharmaceutical companies
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              {/* Basic Information */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <FormControl fullWidth error={!!errors.role}>
                  <InputLabel>I am a...</InputLabel>
                  <Select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    label="I am a..."
                  >
                    <MenuItem value="doctor">Doctor</MenuItem>
                    <MenuItem value="pharma">Pharmaceutical Representative</MenuItem>
                  </Select>
                  {errors.role && <FormHelperText>{errors.role}</FormHelperText>}
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  name="name"
                  label="Full Name"
                  value={formData.name}
                  onChange={handleChange}
                  error={!!errors.name}
                  helperText={errors.name}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Person />
                      </InputAdornment>
                    ),
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
                        <Email />
                      </InputAdornment>
                    ),
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
                        <Lock />
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
                        <Lock />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              {/* Role-specific fields */}
              {formData.role && (
                <>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {formData.role === 'doctor' ? 'Professional Information' : 'Company Information'}
                      </Typography>
                    </Divider>
                  </Grid>
                  {renderRoleSpecificFields()}
                </>
              )}

              <Grid item xs={12}>
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ mt: 2, mb: 2 }}
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </Grid>

              <Grid item xs={12}>
                <Box textAlign="center">
                  <Typography variant="body2">
                    Already have an account?{' '}
                    <Link to="/login" style={{ textDecoration: 'none' }}>
                      Sign in
                    </Link>
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register; 