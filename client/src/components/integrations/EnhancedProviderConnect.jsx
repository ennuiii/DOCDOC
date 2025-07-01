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
  Tooltip,
  IconButton,
  Chip,
  LinearProgress,
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
  Security as SecurityIcon,
  Speed as SpeedIcon,
  Psychology as SmartIcon,
} from '@mui/icons-material';

/**
 * Enhanced Provider Setup Guide Dialog with Smart Features
 */
const SmartSetupGuideDialog = ({ open, onClose, providerId, providerName }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [connectionProgress, setConnectionProgress] = useState(0);

  const getProviderGuide = () => {
    switch (providerId) {
      case 'google':
        return {
          title: 'Google Calendar & Meet Setup',
          description: 'Connect your Google account to sync calendars and enable Meet integration with smart conflict detection',
          smartFeatures: [
            'Automatic conflict detection with travel time calculation',
            'Smart scheduling suggestions based on your preferences',
            'Intelligent buffer time management',
            'Real-time calendar synchronization',
          ],
          steps: [
            {
              label: 'Authorize PharmaDOC',
              content: 'Click "Connect Google Calendar & Meet" to open the authorization window.',
              tips: ['Ensure popups are enabled', 'Use the same browser for best results'],
            },
            {
              label: 'Sign in to Google',
              content: 'Sign in with your Google account in the popup window. Select the account you want to connect.',
              tips: ['Choose your primary calendar account', 'Multi-account selection is supported'],
            },
            {
              label: 'Grant Smart Permissions',
              content: 'Review and accept the permissions PharmaDOC needs for smart scheduling features.',
              tips: ['All permissions are required for full functionality', 'Data is encrypted and secure'],
            },
            {
              label: 'Complete Smart Setup',
              content: 'Your Google Calendar will sync with smart conflict detection and travel time calculations.',
              tips: ['Initial sync may take a few minutes', 'Smart features activate immediately'],
            },
          ],
          permissions: [
            'View and edit your calendar events',
            'Create new calendar events with smart scheduling',
            'Generate Google Meet links for appointments',
            'Access location data for travel time calculations',
            'Analyze calendar patterns for smart suggestions',
          ],
          troubleshooting: [
            { issue: 'Popup blocked', solution: 'Enable popups for this site in your browser settings' },
            { issue: 'Smart features not working', solution: 'Ensure location permissions are granted for travel time features' },
            { issue: 'Sync delays', solution: 'Large calendars may take longer to analyze for smart features' },
          ],
        };
      case 'microsoft':
        return {
          title: 'Microsoft Outlook & Teams Setup',
          description: 'Connect your Microsoft account with enhanced Teams integration and smart scheduling',
          smartFeatures: [
            'Intelligent Teams meeting creation',
            'Smart conflict resolution for Outlook events',
            'Advanced calendar analytics',
            'Preference learning for better scheduling',
          ],
          steps: [
            {
              label: 'Authorize PharmaDOC',
              content: 'Click "Connect Microsoft Outlook & Teams" to start the enhanced authorization.',
              tips: ['Works with personal and business accounts', 'Enhanced security protocols'],
            },
            {
              label: 'Sign in to Microsoft',
              content: 'Sign in with your Microsoft account (supports Office 365, Outlook.com, Hotmail).',
              tips: ['Business accounts may require admin approval', 'Multi-factor auth is supported'],
            },
            {
              label: 'Grant Enhanced Permissions',
              content: 'Accept permissions for smart scheduling and Teams integration.',
              tips: ['Enhanced permissions enable AI features', 'Data processing is GDPR compliant'],
            },
            {
              label: 'Complete Enhanced Setup',
              content: 'Your Outlook calendar gains smart conflict detection and intelligent Teams meeting creation.',
              tips: ['Teams integration requires Teams license', 'Smart features work with all calendar types'],
            },
          ],
          permissions: [
            'Read and write your calendar events',
            'Create smart calendar events with AI assistance',
            'Generate Microsoft Teams meeting links',
            'Analyze calendar patterns for optimization',
            'Access location data for travel calculations',
          ],
          troubleshooting: [
            { issue: 'Organization restrictions', solution: 'Contact your IT administrator for enhanced permissions' },
            { issue: 'Teams not available', solution: 'Ensure you have a Teams license for meeting creation' },
            { issue: 'Smart features limited', solution: 'Some features require Office 365 Business or Enterprise' },
          ],
        };
      case 'zoom':
        return {
          title: 'Enhanced Zoom Meetings Setup',
          description: 'Connect Zoom with smart meeting management and advanced scheduling features',
          smartFeatures: [
            'Intelligent meeting room selection',
            'Smart participant management',
            'Automated meeting optimization',
            'Advanced scheduling analytics',
          ],
          steps: [
            {
              label: 'Authorize Enhanced Access',
              content: 'Click "Connect Zoom Meetings" for enhanced meeting management capabilities.',
              tips: ['Pro account recommended for full features', 'API access must be enabled'],
            },
            {
              label: 'Sign in to Zoom',
              content: 'Sign in with your Zoom account for advanced integration features.',
              tips: ['Admin accounts get additional features', 'Personal meetings are supported'],
            },
            {
              label: 'Grant Advanced Permissions',
              content: 'Authorize enhanced meeting management and analytics capabilities.',
              tips: ['Advanced permissions enable AI optimization', 'Meeting data is anonymized'],
            },
            {
              label: 'Complete Enhanced Integration',
              content: 'Your Zoom account now supports smart meeting creation and optimization.',
              tips: ['Features available for all meeting types', 'Analytics update in real-time'],
            },
          ],
          permissions: [
            'Create and manage Zoom meetings',
            'Access meeting analytics and optimization data',
            'Manage meeting participants and settings',
            'Generate smart meeting join URLs',
            'Analyze meeting patterns for improvements',
          ],
          troubleshooting: [
            { issue: 'Account type required', solution: 'Pro, Business, or Enterprise account required for full features' },
            { issue: 'API access denied', solution: 'Enable API access in your Zoom account settings' },
            { issue: 'Smart features limited', solution: 'Some features require Zoom Webinar or Events license' },
          ],
        };
      case 'caldav':
        return {
          title: 'Smart CalDAV Setup',
          description: 'Connect CalDAV services with intelligent synchronization and conflict detection',
          smartFeatures: [
            'Cross-platform smart synchronization',
            'Intelligent conflict detection across calendars',
            'Smart event categorization',
            'Advanced calendar analytics',
          ],
          steps: [
            {
              label: 'Gather Enhanced Credentials',
              content: 'Collect your CalDAV server details for enhanced synchronization.',
              tips: ['App-specific passwords often required', 'Server autodiscovery available'],
            },
            {
              label: 'Configure Smart Connection',
              content: 'Enter server details with enhanced security and synchronization options.',
              tips: ['SSL/TLS encryption enforced', 'Connection testing is automatic'],
            },
            {
              label: 'Test Enhanced Connection',
              content: 'PharmaDOC tests the connection with advanced validation and optimization.',
              tips: ['Multiple validation checks performed', 'Performance optimization included'],
            },
            {
              label: 'Enable Smart Sync',
              content: 'Select calendars and enable smart features for optimal synchronization.',
              tips: ['Smart categorization improves over time', 'Conflicts detected across all calendars'],
            },
          ],
          permissions: [
            'Read calendar events with smart analysis',
            'Create new calendar events with AI assistance',
            'Update existing events with conflict detection',
            'Access calendar metadata for optimization',
            'Analyze patterns for smart scheduling',
          ],
          troubleshooting: [
            { issue: 'Smart sync issues', solution: 'Ensure all calendars have write permissions' },
            { issue: 'Authentication with app passwords', solution: 'Generate app-specific password for enhanced security' },
            { issue: 'Performance optimization', solution: 'Large calendars benefit from selective sync options' },
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
    // Simulate connection progress
    setConnectionProgress(((activeStep + 1) / guide.steps.length) * 100);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
    setConnectionProgress((activeStep / guide.steps.length) * 100);
  };

  const handleReset = () => {
    setActiveStep(0);
    setConnectionProgress(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartIcon color="primary" />
          {guide.title}
          <Chip label="Enhanced" color="primary" size="small" />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {guide.description}
        </Typography>

        {/* Connection Progress */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Setup Progress
          </Typography>
          <LinearProgress variant="determinate" value={connectionProgress} sx={{ mb: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {Math.round(connectionProgress)}% Complete
          </Typography>
        </Box>

        {/* Smart Features Highlight */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartIcon />
            Smart Features Included
          </Typography>
          <List dense>
            {guide.smartFeatures.map((feature, index) => (
              <ListItem key={index} sx={{ py: 0 }}>
                <ListItemIcon>
                  <CheckIcon color="success" fontSize="small" />
                </ListItemIcon>
                <ListItemText 
                  primary={feature}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
        </Box>

        <Stepper activeStep={activeStep} orientation="vertical">
          {guide.steps.map((step, index) => (
            <Step key={index}>
              <StepLabel>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {step.label}
                  {index < activeStep && <CheckIcon color="success" fontSize="small" />}
                </Box>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {step.content}
                </Typography>
                
                {/* Step Tips */}
                <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SpeedIcon fontSize="small" />
                    Pro Tips
                  </Typography>
                  {step.tips.map((tip, tipIndex) => (
                    <Typography key={tipIndex} variant="caption" display="block" sx={{ ml: 1 }}>
                      • {tip}
                    </Typography>
                  ))}
                </Box>

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
          <Box sx={{ mt: 2, p: 3, bgcolor: 'success.light', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckIcon />
              Enhanced Setup Complete!
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              You're ready to connect your {providerName} account with all smart features enabled. 
              Close this guide and click the connect button to begin.
            </Typography>
            <Button variant="outlined" onClick={handleReset} sx={{ mt: 1 }}>
              Review Steps
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Enhanced Permissions Section */}
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon />
          Enhanced Permissions
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

        {/* Enhanced Troubleshooting Section */}
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon />
          Troubleshooting & Support
        </Typography>
        <List dense>
          {guide.troubleshooting.map((tip, index) => (
            <ListItem key={index}>
              <ListItemIcon>
                <InfoIcon color="info" />
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

/**
 * Enhanced Provider Connect Button with Smart Features
 */
const EnhancedProviderConnect = ({
  providerId,
  providerName,
  scopes = [],
  onSuccess,
  onError,
  disabled = false,
  variant = 'contained',
  size = 'medium',
  fullWidth = false,
  showSmartFeatures = true,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showError, setShowError] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [connectionStep, setConnectionStep] = useState('');

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
          smartFeatures: ['Smart Conflict Detection', 'Travel Time Calculation', 'Preference Learning'],
        };
      case 'microsoft':
        return {
          color: '#0078d4',
          authUrl: '/api/integrations/microsoft/auth',
          defaultScopes: ['https://graph.microsoft.com/calendars.readwrite'],
          smartFeatures: ['Intelligent Teams Integration', 'Smart Scheduling', 'Advanced Analytics'],
        };
      case 'zoom':
        return {
          color: '#2d8cff',
          authUrl: '/api/integrations/zoom/auth',
          defaultScopes: ['meeting:write', 'meeting:read'],
          smartFeatures: ['Smart Meeting Optimization', 'Participant Analytics', 'Room Selection'],
        };
      case 'caldav':
        return {
          color: '#6c757d',
          authUrl: '/api/integrations/caldav/auth',
          defaultScopes: ['calendar:read', 'calendar:write'],
          smartFeatures: ['Cross-Platform Sync', 'Intelligent Categorization', 'Conflict Resolution'],
        };
      default:
        return {
          color: 'primary.main',
          authUrl: '',
          defaultScopes: [],
          smartFeatures: [],
        };
    }
  };

  const handleConnect = async () => {
    if (isConnecting || disabled) return;

    try {
      setIsConnecting(true);
      setError(null);
      setConnectionStep('Initializing...');

      const config = getProviderConfig();
      const requestScopes = scopes.length > 0 ? scopes : config.defaultScopes;

      setConnectionStep('Creating secure session...');

      // Create OAuth state parameter for CSRF protection
      const state = btoa(JSON.stringify({
        providerId,
        timestamp: Date.now(),
        returnUrl: window.location.pathname,
        smartFeatures: showSmartFeatures,
      }));

      setConnectionStep('Opening authorization window...');

      // Build authorization URL
      const authParams = new URLSearchParams({
        scopes: requestScopes.join(' '),
        state,
        redirect_uri: `${window.location.origin}/integrations/callback`,
        smart_features: showSmartFeatures.toString(),
      });

      const authUrl = `${config.authUrl}?${authParams.toString()}`;

      // Open OAuth popup window
      const popup = window.open(
        authUrl,
        `${providerId}-oauth-enhanced`,
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site and try again.');
      }

      setConnectionStep('Waiting for authorization...');

      // Listen for OAuth callback
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsConnecting(false);
          setConnectionStep('');
        }
      }, 1000);

      // Listen for OAuth success/error messages
      const messageHandler = (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'oauth-success') {
          clearInterval(checkClosed);
          popup.close();
          setConnectionStep('Finalizing setup...');
          
          setTimeout(() => {
            setIsConnecting(false);
            setConnectionStep('');
            
            if (onSuccess) {
              onSuccess({
                providerId,
                credentials: event.data.credentials,
                user: event.data.user,
                smartFeatures: event.data.smartFeatures || config.smartFeatures,
              });
            }
          }, 1000);
        } else if (event.data.type === 'oauth-error') {
          clearInterval(checkClosed);
          popup.close();
          setIsConnecting(false);
          setConnectionStep('');
          
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
        setConnectionStep('');
        const timeoutError = 'Connection timed out. Please try again.';
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
      setConnectionStep('');
      const errorMessage = err.message || 'Failed to initiate connection';
      setError(errorMessage);
      setShowError(true);
      
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const handleShowGuide = () => {
    setShowGuide(true);
  };

  const handleCloseGuide = () => {
    setShowGuide(false);
  };

  const handleCloseError = () => {
    setShowError(false);
  };

  const config = getProviderConfig();

  return (
    <>
      <Box sx={{ position: 'relative' }}>
        {/* Help Button */}
        <Tooltip title="Setup Guide">
          <IconButton
            onClick={handleShowGuide}
            sx={{
              position: 'absolute',
              top: -8,
              right: -8,
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { boxShadow: 2 },
            }}
            size="small"
          >
            <HelpIcon fontSize="small" />
          </IconButton>
        </Tooltip>

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
            minHeight: 48,
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
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="button" sx={{ textTransform: 'none' }}>
              {isConnecting ? connectionStep || 'Connecting...' : `Connect ${providerName}`}
            </Typography>
            {showSmartFeatures && !isConnecting && (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                <Chip
                  label="Smart Features"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    bgcolor: 'rgba(255,255,255,0.2)',
                    color: variant === 'contained' ? 'white' : config.color,
                  }}
                />
              </Box>
            )}
          </Box>
        </Button>

        {/* Smart Features Preview */}
        {showSmartFeatures && !isConnecting && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Enhanced with: {config.smartFeatures.slice(0, 2).join(', ')}
              {config.smartFeatures.length > 2 && ` +${config.smartFeatures.length - 2} more`}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Setup Guide Dialog */}
      <SmartSetupGuideDialog
        open={showGuide}
        onClose={handleCloseGuide}
        providerId={providerId}
        providerName={providerName}
      />

      {/* Error Snackbar */}
      <Snackbar
        open={showError}
        autoHideDuration={8000}
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
          <Button 
            size="small" 
            onClick={handleShowGuide}
            sx={{ mt: 1 }}
          >
            View Setup Guide
          </Button>
        </Alert>
      </Snackbar>
    </>
  );
};

export default EnhancedProviderConnect; 