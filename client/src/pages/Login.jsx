import { useState, useEffect } from 'react';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import {
  Box,
  TextField,
  Typography,
  Link,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  LocalHospital,
  Science,
  AdminPanelSettings,
  Email,
  Lock,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from 'notistack';
import AnimatedButton from '../components/ui/AnimatedButton';
import GlassCard from '../components/ui/GlassCard';

const Login = () => {
  const { user, signIn, loading } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Check for registration confirmation message
  useEffect(() => {
    if (location.state?.message) {
      setConfirmationMessage(location.state.message);
      // Pre-fill email if provided
      if (location.state.email) {
        setFormData(prev => ({ ...prev, email: location.state.email }));
      }
      // Clear the location state to avoid showing message on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Redirect if already logged in
  if (user) {
    if (user.role === 'doctor') {
      return <Navigate to="/timeslots" replace />;
    } else if (user.role === 'pharma') {
      return <Navigate to="/appointments" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const result = await signIn(formData.email, formData.password);
      
      if (result.success) {
        enqueueSnackbar('Login successful!', { variant: 'success', autoHideDuration: 1500 });
        
        // Navigation is handled by route protection, but we can add specific logic here
        const { role } = result.user;
        if (role === 'doctor') {
          // Navigate to timeslots will happen automatically
        } else if (role === 'pharma') {
          // Navigate to appointments will happen automatically
        }
      }
    } catch (error) {
      setErrors({ submit: error.message });
      enqueueSnackbar(error.message, { variant: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

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
          maxWidth: 480,
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
            Pharmadoc
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, fontWeight: 500 }}
          >
            Connecting Healthcare Professionals
          </Typography>
          <Typography
            variant="h5"
            component="h2"
            sx={{ fontWeight: 600, color: 'text.primary' }}
          >
            Welcome Back
          </Typography>
        </Box>

        {/* Alerts */}
        {confirmationMessage && (
          <Alert
            severity="success"
            sx={{
              mb: 3,
              borderRadius: 2,
              animation: 'fadeIn 0.5s ease-in-out',
            }}
          >
            {confirmationMessage}
          </Alert>
        )}

        {errors.submit && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: 2,
              animation: 'fadeIn 0.5s ease-in-out',
            }}
          >
            {errors.submit}
          </Alert>
        )}

        {/* Test Credentials */}
        <Paper
          sx={{
            p: 3,
            mb: 4,
            borderRadius: 3,
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            border: '1px solid #bae6fd',
          }}
        >
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, color: '#0369a1' }}>
            Demo Credentials
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalHospital sx={{ fontSize: 16, color: '#0369a1' }} />
              <Typography variant="body2" sx={{ color: '#0369a1' }}>
                <strong>Doctor:</strong> doctor@test.com / doctor123
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Science sx={{ fontSize: 16, color: '#0369a1' }} />
              <Typography variant="body2" sx={{ color: '#0369a1' }}>
                <strong>Pharma:</strong> pharma@test.com / pharma123
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AdminPanelSettings sx={{ fontSize: 16, color: '#0369a1' }} />
              <Typography variant="body2" sx={{ color: '#0369a1' }}>
                <strong>Admin:</strong> admin@test.com / admin123
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Form */}
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
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
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="current-password"
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
                    aria-label="toggle password visibility"
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

          <AnimatedButton
            type="submit"
            fullWidth
            variant="contained"
            animationType="gradient"
            loading={isSubmitting}
            loadingText="Signing In..."
            sx={{
              mt: 4,
              mb: 3,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 600,
            }}
          >
            Sign In
          </AnimatedButton>

          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              New to Pharmadoc?
            </Typography>
          </Divider>

          <Box sx={{ textAlign: 'center' }}>
            <Link
              component={RouterLink}
              to="/register"
              variant="body2"
              sx={{
                color: 'primary.main',
                textDecoration: 'none',
                fontWeight: 500,
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              Create your account
            </Link>
          </Box>
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

export default Login; 