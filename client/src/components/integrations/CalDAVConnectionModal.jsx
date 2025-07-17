import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Chip,
  Link,
} from '@mui/material';
import {
  Cloud as CalDAVIcon,
  Apple as AppleIcon,
  Help as HelpIcon,
  Security as SecurityIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import AppleCalendarSetupHelper from './AppleCalendarSetupHelper';
import { supabase } from '../../lib/supabase';

const CalDAVConnectionModal = ({ open, onClose, onSuccess, onError }) => {
  const [formData, setFormData] = useState({
    provider_type: 'icloud',
    server_url: 'https://caldav.icloud.com',
    username: '',
    password: '',
    display_name: '',
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showAppleHelper, setShowAppleHelper] = useState(false);

  const providers = [
    {
      id: 'icloud',
      name: 'Apple iCloud',
      url: 'https://caldav.icloud.com',
      description: 'Apple Calendar (iCloud)',
      requiresAppPassword: true,
    },
    {
      id: 'yahoo',
      name: 'Yahoo Calendar',
      url: 'https://caldav.calendar.yahoo.com',
      description: 'Yahoo Calendar',
      requiresAppPassword: false,
    },
    {
      id: 'fastmail',
      name: 'FastMail',
      url: 'https://caldav.fastmail.com',
      description: 'FastMail Calendar',
      requiresAppPassword: false,
    },
    {
      id: 'custom',
      name: 'Custom CalDAV Server',
      url: '',
      description: 'Other CalDAV-compatible server',
      requiresAppPassword: false,
    },
  ];

  const selectedProvider = providers.find(p => p.id === formData.provider_type);

  const handleProviderChange = (event) => {
    const providerId = event.target.value;
    const provider = providers.find(p => p.id === providerId);
    
    setFormData(prev => ({
      ...prev,
      provider_type: providerId,
      server_url: provider.url,
      display_name: provider.name,
    }));
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.server_url || !formData.username || !formData.password) {
        throw new Error('Please fill in all required fields');
      }

      // Validate Apple ID email format for iCloud
      if (formData.provider_type === 'icloud' && !formData.username.includes('@')) {
        throw new Error('Please enter your full Apple ID email (e.g., yourname@icloud.com)');
      }

      // Get current Supabase session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error('Authentication required. Please log in again.');
      }

      const response = await fetch('/api/integrations/caldav/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Connection failed');
      }

      if (onSuccess) {
        onSuccess({
          providerId: 'caldav',
          providerType: formData.provider_type,
          displayName: formData.display_name || selectedProvider.name,
          result,
        });
      }

      onClose();
    } catch (err) {
      setError(err.message);
      if (onError) {
        onError(err.message);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleShowAppleHelper = () => {
    setShowAppleHelper(true);
  };

  const handleAppleHelperClose = () => {
    setShowAppleHelper(false);
  };

  const handleAppleHelperProceed = () => {
    setShowAppleHelper(false);
    // Pre-fill iCloud settings
    setFormData(prev => ({
      ...prev,
      provider_type: 'icloud',
      server_url: 'https://caldav.icloud.com',
      display_name: 'Apple iCloud',
    }));
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalDAVIcon color="primary" />
            <Typography variant="h6">Connect CalDAV Calendar</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Connect Apple iCloud, Yahoo, or other CalDAV-compatible calendars
          </Typography>
        </DialogTitle>

        <DialogContent>
          {/* Apple iCloud Quick Setup */}
          <Card sx={{ mb: 3, bgcolor: 'primary.light' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AppleIcon />
                <Typography variant="h6">Apple iCloud Calendar</Typography>
                <Chip label="Most Popular" size="small" color="primary" />
              </Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Connect your Apple Calendar with step-by-step guidance for App-Specific Password setup.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AppleIcon />}
                onClick={handleShowAppleHelper}
                fullWidth
              >
                Setup Apple Calendar (Guided)
              </Button>
            </CardContent>
          </Card>

          <Divider sx={{ my: 2 }}>
            <Typography variant="body2" color="text.secondary">OR</Typography>
          </Divider>

          {/* Provider Selection */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Calendar Provider</InputLabel>
            <Select
              value={formData.provider_type}
              label="Calendar Provider"
              onChange={handleProviderChange}
            >
              {providers.map((provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {provider.id === 'icloud' && <AppleIcon fontSize="small" />}
                    <Box>
                      <Typography variant="body2">{provider.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {provider.description}
                      </Typography>
                    </Box>
                    {provider.requiresAppPassword && (
                      <Chip 
                        label="App Password Required" 
                        size="small" 
                        color="warning" 
                        variant="outlined"
                      />
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Apple iCloud Warning */}
          {formData.provider_type === 'icloud' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                🍎 Apple Users: App-Specific Password Required
              </Typography>
              <Typography variant="body2">
                You MUST use an App-Specific Password (not your Apple ID password). 
                Need help? <Link 
                  component="button" 
                  onClick={handleShowAppleHelper}
                  sx={{ textDecoration: 'underline' }}
                >
                  Click here for step-by-step setup
                </Link>
              </Typography>
            </Alert>
          )}

          {/* Connection Form */}
          <TextField
            fullWidth
            label="Server URL"
            name="server_url"
            value={formData.server_url}
            onChange={handleInputChange}
            placeholder="https://caldav.example.com"
            margin="normal"
            required
            disabled={formData.provider_type !== 'custom'}
            helperText={
              formData.provider_type !== 'custom' 
                ? 'Auto-filled based on provider selection'
                : 'Enter your CalDAV server URL'
            }
          />

          <TextField
            fullWidth
            label={
              formData.provider_type === 'icloud' 
                ? "Apple ID Email" 
                : "Username"
            }
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            placeholder={
              formData.provider_type === 'icloud'
                ? "yourname@icloud.com"
                : "Your username"
            }
            margin="normal"
            required
            helperText={
              formData.provider_type === 'icloud'
                ? "Your full Apple ID email address"
                : "Your calendar account username"
            }
          />

          <TextField
            fullWidth
            label={
              formData.provider_type === 'icloud'
                ? "App-Specific Password"
                : "Password"
            }
            name="password"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder={
              formData.provider_type === 'icloud'
                ? "abcd-efgh-ijkl-mnop"
                : "Your password"
            }
            margin="normal"
            required
            helperText={
              formData.provider_type === 'icloud'
                ? "NOT your Apple ID password - use the App-Specific Password you generated"
                : "Your calendar account password"
            }
          />

          <TextField
            fullWidth
            label="Display Name (Optional)"
            name="display_name"
            value={formData.display_name}
            onChange={handleInputChange}
            placeholder="My Calendar"
            margin="normal"
            helperText="What to call this calendar connection in PharmaDOC"
          />

          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Connection Failed:</strong> {error}
              </Typography>
              {formData.provider_type === 'icloud' && error.includes('authentication') && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  💡 <strong>Apple users:</strong> Make sure you're using an App-Specific Password, not your Apple ID password. 
                  <Link 
                    component="button" 
                    onClick={handleShowAppleHelper}
                    sx={{ textDecoration: 'underline', ml: 1 }}
                  >
                    Need help setting one up?
                  </Link>
                </Typography>
              )}
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={connecting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConnect}
            disabled={connecting || !formData.server_url || !formData.username || !formData.password}
            startIcon={connecting ? <CircularProgress size={16} /> : <SettingsIcon />}
          >
            {connecting ? 'Connecting...' : 'Test & Connect'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Apple Calendar Setup Helper */}
      <AppleCalendarSetupHelper
        open={showAppleHelper}
        onClose={handleAppleHelperClose}
        onProceedToConnection={handleAppleHelperProceed}
      />
    </>
  );
};

export default CalDAVConnectionModal; 