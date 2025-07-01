import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Typography,
  Box,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Link,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Google as GoogleIcon,
  Microsoft as MicrosoftIcon,
  VideoCall as ZoomIcon,
  Cloud as CalDAVIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  HelpOutline as HelpIcon,
} from '@mui/icons-material';

/**
 * ProviderConnectButton - Handles OAuth connection flow for integration providers
 * @param {Object} props
 * @param {string} props.providerId - Provider identifier (google, microsoft, zoom, caldav)
 * @param {string} props.providerName - Display name for the provider
 * @param {string[]} props.scopes - OAuth scopes to request
 * @param {Function} props.onSuccess - Callback when connection succeeds
 * @param {Function} props.onError - Callback when connection fails
 * @param {boolean} props.disabled - Whether the button is disabled
 * @param {string} props.variant - Button variant (contained, outlined, text)
 * @param {string} props.size - Button size (small, medium, large)
 * @param {boolean} props.fullWidth - Whether button should take full width
 */
const ProviderConnectButton = ({
  providerId,
  providerName,
  scopes = [],
  onSuccess,
  onError,
  disabled = false,
  variant = 'contained',
  size = 'medium',
  fullWidth = false,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);

  const getProviderIcon = () => {
    switch (providerId) {
      case 'google':
        return <GoogleIcon sx={{ mr: 1 }} />;
      case 'microsoft':
        return <MicrosoftIcon sx={{ mr: 1 }} />;
      case 'zoom':
        return <ZoomIcon sx={{ mr: 1 }} />;
      case 'caldav':
        return <CalDAVIcon sx={{ mr: 1 }} />;
      default:
        return null;
    }
  };

  const getProviderConfig = () => {
    switch (providerId) {
      case 'google':
        return {
          color: '#4285f4',
          authUrl: '/api/integrations/google/auth',
          defaultScopes: ['https://www.googleapis.com/auth/calendar'],
        };
      case 'microsoft':
        return {
          color: '#0078d4',
          authUrl: '/api/integrations/microsoft/auth',
          defaultScopes: ['https://graph.microsoft.com/calendars.readwrite'],
        };
      case 'zoom':
        return {
          color: '#2d8cff',
          authUrl: '/api/integrations/zoom/auth',
          defaultScopes: ['meeting:write', 'meeting:read'],
        };
      case 'caldav':
        return {
          color: '#6c757d',
          authUrl: '/api/integrations/caldav/auth',
          defaultScopes: ['calendar:read', 'calendar:write'],
        };
      default:
        return {
          color: 'primary.main',
          authUrl: '',
          defaultScopes: [],
        };
    }
  };

  const handleConnect = async () => {
    if (isConnecting || disabled) return;

    try {
      setIsConnecting(true);
      setError(null);

      const config = getProviderConfig();
      const requestScopes = scopes.length > 0 ? scopes : config.defaultScopes;

      // Create OAuth state parameter for CSRF protection
      const state = btoa(JSON.stringify({
        providerId,
        timestamp: Date.now(),
        returnUrl: window.location.pathname,
      }));

      // Build authorization URL
      const authParams = new URLSearchParams({
        scopes: requestScopes.join(' '),
        state,
        redirect_uri: `${window.location.origin}/integrations/callback`,
      });

      const authUrl = `${config.authUrl}?${authParams.toString()}`;

      // Open OAuth popup window
      const popup = window.open(
        authUrl,
        `${providerId}-oauth`,
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Listen for OAuth callback
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsConnecting(false);
        }
      }, 1000);

      // Listen for OAuth success/error messages
      const messageHandler = (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'oauth-success') {
          clearInterval(checkClosed);
          popup.close();
          setIsConnecting(false);
          
          if (onSuccess) {
            onSuccess({
              providerId,
              credentials: event.data.credentials,
              user: event.data.user,
            });
          }
        } else if (event.data.type === 'oauth-error') {
          clearInterval(checkClosed);
          popup.close();
          setIsConnecting(false);
          
          const errorMessage = event.data.error || 'Connection failed';
          setError(errorMessage);
          setShowError(true);
          
          if (onError) {
            onError(errorMessage);
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Cleanup on component unmount or timeout
      const timeout = setTimeout(() => {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        if (!popup.closed) {
          popup.close();
        }
        setIsConnecting(false);
        const timeoutError = 'Connection timed out';
        setError(timeoutError);
        setShowError(true);
        if (onError) {
          onError(timeoutError);
        }
      }, 300000); // 5 minute timeout

      // Store cleanup function
      return () => {
        clearTimeout(timeout);
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
      };

    } catch (err) {
      setIsConnecting(false);
      const errorMessage = err.message || 'Failed to initiate connection';
      setError(errorMessage);
      setShowError(true);
      
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const handleCloseError = () => {
    setShowError(false);
  };

  const config = getProviderConfig();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        disabled={disabled || isConnecting}
        onClick={handleConnect}
        startIcon={
          isConnecting ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            getProviderIcon()
          )
        }
        sx={{
          backgroundColor: variant === 'contained' ? config.color : 'transparent',
          borderColor: variant === 'outlined' ? config.color : undefined,
          color: variant === 'contained' ? 'white' : config.color,
          '&:hover': {
            backgroundColor: 
              variant === 'contained' 
                ? config.color 
                : `${config.color}0a`, // 10% opacity
          },
          '&.Mui-disabled': {
            opacity: 0.6,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="button" sx={{ textTransform: 'none' }}>
            {isConnecting ? 'Connecting...' : `Connect ${providerName}`}
          </Typography>
        </Box>
      </Button>

      {/* Error Snackbar */}
      <Snackbar
        open={showError}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleCloseError} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          <Typography variant="body2">
            <strong>{providerName} Connection Failed</strong>
          </Typography>
          <Typography variant="caption">
            {error}
          </Typography>
        </Alert>
      </Snackbar>
    </>
  );
};

/**
 * Enhanced Provider Setup Guide Dialog
 */
const ProviderSetupGuideDialog = ({ open, onClose, providerId, providerName }) => {
  const [activeStep, setActiveStep] = useState(0);

  const getProviderGuide = () => {
    switch (providerId) {
      case 'google':
        return {
          title: 'Google Calendar & Meet Setup',
          description: 'Connect your Google account to sync calendars and enable Meet integration',
          steps: [
            {
              label: 'Authorize PharmaDOC',
              content: 'Click "Connect Google Calendar & Meet" to open the authorization window.',
            },
            {
              label: 'Sign in to Google',
              content: 'Sign in with your Google account in the popup window. If you\'re already signed in, select the account you want to connect.',
            },
            {
              label: 'Grant Permissions',
              content: 'Review and accept the permissions PharmaDOC needs to access your calendar and create Meet links.',
            },
            {
              label: 'Complete Setup',
              content: 'Once authorized, your Google Calendar will sync automatically and you can create appointments with Google Meet links.',
            },
          ],
          permissions: [
            'View and edit your calendar events',
            'Create new calendar events',
            'Generate Google Meet links for appointments',
            'Access basic profile information',
          ],
          troubleshooting: [
            { issue: 'Popup blocked', solution: 'Enable popups for this site in your browser settings' },
            { issue: 'Account not found', solution: 'Make sure you\'re signed in to the correct Google account' },
            { issue: 'Permission denied', solution: 'Contact your Google Workspace admin if using a business account' },
          ],
        };
      case 'microsoft':
        return {
          title: 'Microsoft Outlook & Teams Setup',
          description: 'Connect your Microsoft account to sync Outlook calendars and enable Teams integration',
          steps: [
            {
              label: 'Authorize PharmaDOC',
              content: 'Click "Connect Microsoft Outlook & Teams" to start the authorization process.',
            },
            {
              label: 'Sign in to Microsoft',
              content: 'Sign in with your Microsoft account (Outlook, Hotmail, or Office 365) in the popup window.',
            },
            {
              label: 'Grant Permissions',
              content: 'Review and accept the permissions PharmaDOC needs to access your Outlook calendar and create Teams meetings.',
            },
            {
              label: 'Complete Setup',
              content: 'Your Outlook calendar will sync and you can create appointments with Microsoft Teams meeting links.',
            },
          ],
          permissions: [
            'Read and write your calendar events',
            'Create new calendar events',
            'Generate Microsoft Teams meeting links',
            'Access basic profile information',
          ],
          troubleshooting: [
            { issue: 'Organization restrictions', solution: 'Contact your IT administrator for Microsoft 365 business accounts' },
            { issue: 'Two-factor authentication', solution: 'Complete 2FA verification in the popup window' },
            { issue: 'Account type not supported', solution: 'Ensure you\'re using a supported Microsoft account type' },
          ],
        };
      case 'zoom':
        return {
          title: 'Zoom Meetings Setup',
          description: 'Connect your Zoom account to create and manage Zoom meetings for appointments',
          steps: [
            {
              label: 'Authorize PharmaDOC',
              content: 'Click "Connect Zoom Meetings" to authorize PharmaDOC to create meetings.',
            },
            {
              label: 'Sign in to Zoom',
              content: 'Sign in with your Zoom account credentials in the popup window.',
            },
            {
              label: 'Grant App Permissions',
              content: 'Authorize PharmaDOC to create and manage Zoom meetings on your behalf.',
            },
            {
              label: 'Verify Integration',
              content: 'Your Zoom account is now connected and you can create appointments with Zoom meeting links.',
            },
          ],
          permissions: [
            'Create new Zoom meetings',
            'Manage your Zoom meetings',
            'Access meeting participant information',
            'Generate meeting join URLs',
          ],
          troubleshooting: [
            { issue: 'Account type required', solution: 'A Zoom Pro, Business, or Enterprise account is required' },
            { issue: 'API permissions', solution: 'Ensure your Zoom account has API access enabled' },
            { issue: 'Meeting limits', solution: 'Check your Zoom account meeting limits and upgrade if needed' },
          ],
        };
      case 'caldav':
        return {
          title: 'CalDAV Setup (iCloud, Yahoo, etc.)',
          description: 'Connect any CalDAV-compatible calendar service for cross-platform synchronization',
          steps: [
            {
              label: 'Gather Credentials',
              content: 'Collect your CalDAV server URL, username, and password from your calendar provider.',
            },
            {
              label: 'Enter Server Details',
              content: 'Provide your CalDAV server information in the connection form.',
            },
            {
              label: 'Test Connection',
              content: 'PharmaDOC will test the connection to verify your credentials and server accessibility.',
            },
            {
              label: 'Select Calendars',
              content: 'Choose which calendars to sync with PharmaDOC from your CalDAV account.',
            },
          ],
          permissions: [
            'Read calendar events and availability',
            'Create new calendar events',
            'Update existing calendar events',
            'Access calendar metadata',
          ],
          troubleshooting: [
            { issue: 'Server not found', solution: 'Verify the CalDAV server URL with your provider' },
            { issue: 'Authentication failed', solution: 'Check username and password, some providers require app-specific passwords' },
            { issue: 'SSL certificate errors', solution: 'Ensure your CalDAV server supports secure connections' },
          ],
        };
      default:
        return null;
    }
  };

  const guide = getProviderGuide();
  if (!guide) return null;

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon color="primary" />
          {guide.title}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {guide.description}
        </Typography>

        <Stepper activeStep={activeStep} orientation="vertical">
          {guide.steps.map((step, index) => (
            <Step key={index}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {step.content}
                </Typography>
                <Box sx={{ mb: 1 }}>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    sx={{ mt: 1, mr: 1 }}
                    disabled={index === guide.steps.length - 1}
                  >
                    {index === guide.steps.length - 1 ? 'Finish' : 'Continue'}
                  </Button>
                  <Button
                    disabled={index === 0}
                    onClick={handleBack}
                    sx={{ mt: 1, mr: 1 }}
                  >
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>

        {activeStep === guide.steps.length && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              Setup Complete!
            </Typography>
            <Typography variant="body2">
              You're ready to connect your {providerName} account. Close this guide and click the connect button.
            </Typography>
            <Button onClick={handleReset} sx={{ mt: 1 }}>
              Review Steps
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Permissions Section */}
        <Typography variant="h6" gutterBottom>
          Required Permissions
        </Typography>
        <List dense>
          {guide.permissions.map((permission, index) => (
            <ListItem key={index}>
              <ListItemIcon>
                <CheckIcon color="success" />
              </ListItemIcon>
              <ListItemText primary={permission} />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 3 }} />

        {/* Troubleshooting Section */}
        <Typography variant="h6" gutterBottom>
          Troubleshooting Tips
        </Typography>
        <List dense>
          {guide.troubleshooting.map((tip, index) => (
            <ListItem key={index}>
              <ListItemIcon>
                <WarningIcon color="warning" />
              </ListItemIcon>
              <ListItemText 
                primary={tip.issue}
                secondary={tip.solution}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close Guide
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConnectButton; 