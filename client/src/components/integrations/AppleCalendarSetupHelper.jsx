import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  Chip,
  Link,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Card,
  CardContent,
} from '@mui/material';
import {
  Apple as AppleIcon,
  Security as SecurityIcon,
  ArrowForward as ArrowIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  OpenInNew as ExternalIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';

const AppleCalendarSetupHelper = ({ open, onClose, onProceedToConnection }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [appPasswordGenerated, setAppPasswordGenerated] = useState(false);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleProceedToConnection = () => {
    onClose();
    if (onProceedToConnection) {
      onProceedToConnection();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const steps = [
    {
      label: 'Why App-Specific Password?',
      content: (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Apple requires App-Specific Passwords for calendar access to protect your main Apple ID password. 
              This is Apple's official security requirement - not a PharmaDOC limitation.
            </Typography>
          </Alert>
          
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            🔒 Why This is Required:
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon><SecurityIcon color="primary" /></ListItemIcon>
              <ListItemText 
                primary="Enhanced Security" 
                secondary="Protects your main Apple ID password from third-party apps"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon><SecurityIcon color="primary" /></ListItemIcon>
              <ListItemText 
                primary="Granular Control" 
                secondary="You can revoke access anytime without changing your main password"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon><SecurityIcon color="primary" /></ListItemIcon>
              <ListItemText 
                primary="Limited Access" 
                secondary="Only provides calendar access - no other iCloud data"
              />
            </ListItem>
          </List>
        </Box>
      ),
    },
    {
      label: 'Open Apple ID Settings',
      content: (
        <Box>
          <Typography variant="body1" gutterBottom>
            First, you'll need to access your Apple ID account settings:
          </Typography>
          
          <Card sx={{ mt: 2, mb: 2, bgcolor: 'primary.light' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AppleIcon />
                <Typography variant="h6">Go to Apple ID Settings</Typography>
              </Box>
              <Button 
                variant="contained" 
                color="primary"
                startIcon={<ExternalIcon />}
                onClick={() => window.open('https://appleid.apple.com/', '_blank')}
                fullWidth
                sx={{ mt: 1 }}
              >
                Open appleid.apple.com
              </Button>
            </CardContent>
          </Card>

          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Important:</strong> Make sure you're signed in with the Apple ID you want to use for calendar access.
            </Typography>
          </Alert>
        </Box>
      ),
    },
    {
      label: 'Navigate to App-Specific Passwords',
      content: (
        <Box>
          <Typography variant="body1" gutterBottom>
            Once you're signed in to your Apple ID account:
          </Typography>
          
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>📱 Step-by-Step:</Typography>
            <List>
              <ListItem>
                <ListItemIcon><ArrowIcon color="primary" /></ListItemIcon>
                <ListItemText 
                  primary="1. Look for 'Sign-In and Security' section"
                  secondary="This should be visible on your Apple ID dashboard"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><ArrowIcon color="primary" /></ListItemIcon>
                <ListItemText 
                  primary="2. Click 'App-Specific Passwords'"
                  secondary="You might need to verify your identity with 2FA"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><ArrowIcon color="primary" /></ListItemIcon>
                <ListItemText 
                  primary="3. Click 'Generate an app-specific password'"
                  secondary="You'll see a blue '+' or 'Generate' button"
                />
              </ListItem>
            </List>
          </Box>

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Don't see App-Specific Passwords?</strong> You need to enable Two-Factor Authentication first. 
              It's required for App-Specific Passwords.
            </Typography>
          </Alert>
        </Box>
      ),
    },
    {
      label: 'Generate Your Password',
      content: (
        <Box>
          <Typography variant="body1" gutterBottom>
            Now you'll create the password that PharmaDOC will use:
          </Typography>

          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>🔑 Password Generation:</Typography>
            <List>
              <ListItem>
                <ListItemIcon><CheckIcon color="success" /></ListItemIcon>
                <ListItemText 
                  primary="1. Enter a descriptive label"
                  secondary="Use something like 'PharmaDOC Calendar' so you remember what it's for"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckIcon color="success" /></ListItemIcon>
                <ListItemText 
                  primary="2. Click 'Create'"
                  secondary="Apple will generate a unique password for this app"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><WarningIcon color="warning" /></ListItemIcon>
                <ListItemText 
                  primary="3. IMPORTANT: Copy the password immediately"
                  secondary="Apple only shows it once! Save it somewhere secure."
                />
              </ListItem>
            </List>
          </Box>

          <Card sx={{ mt: 2, bgcolor: 'warning.light' }}>
            <CardContent>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                ⚠️ Critical: The password will look like this:
              </Typography>
              <Box sx={{ 
                mt: 1, 
                p: 1, 
                bgcolor: 'grey.100', 
                borderRadius: 1, 
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <Typography variant="body2">abcd-efgh-ijkl-mnop</Typography>
                <Button 
                  size="small" 
                  startIcon={<CopyIcon />}
                  onClick={() => copyToClipboard('abcd-efgh-ijkl-mnop')}
                >
                  Copy Example
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Your actual password will be different. Copy YOUR generated password!
              </Typography>
            </CardContent>
          </Card>
        </Box>
      ),
    },
    {
      label: 'Ready to Connect!',
      content: (
        <Box>
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
              🎉 You're all set! Here's what you'll need for PharmaDOC:
            </Typography>
          </Alert>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Connection Details for PharmaDOC:</Typography>
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Server URL"
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <code>https://caldav.icloud.com</code>
                        <Button 
                          size="small" 
                          startIcon={<CopyIcon />}
                          onClick={() => copyToClipboard('https://caldav.icloud.com')}
                        >
                          Copy
                        </Button>
                      </Box>
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Username"
                    secondary="Your Apple ID email (e.g., yourname@icloud.com)"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Password"
                    secondary="The App-Specific Password you just generated (NOT your Apple ID password)"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Provider Type"
                    secondary="Select 'icloud' from the dropdown"
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button 
              variant="contained" 
              color="primary" 
              size="large"
              onClick={handleProceedToConnection}
              sx={{ minWidth: 200 }}
            >
              Connect Apple Calendar Now
            </Button>
          </Box>
        </Box>
      ),
    },
  ];

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppleIcon color="primary" />
          <Typography variant="h5">Apple Calendar Setup Assistant</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Step-by-step guide to connect your Apple iCloud Calendar
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={index}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                {step.content}
                <Box sx={{ mb: 2, mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    sx={{ mr: 1 }}
                    disabled={index === steps.length - 1}
                  >
                    {index === steps.length - 1 ? 'Complete' : 'Continue'}
                  </Button>
                  <Button
                    disabled={index === 0}
                    onClick={handleBack}
                    sx={{ mr: 1 }}
                  >
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          Close Guide
        </Button>
        {activeStep === steps.length - 1 && (
          <Button 
            variant="contained" 
            onClick={handleProceedToConnection}
            startIcon={<AppleIcon />}
          >
            Connect Apple Calendar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AppleCalendarSetupHelper; 