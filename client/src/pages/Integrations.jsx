import React from 'react';
import { Box, Typography } from '@mui/material';
import IntegrationDashboard from '../components/integrations/IntegrationDashboard';

const Integrations = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Calendar & Video Integrations
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Connect and manage your calendar and video conferencing integrations
      </Typography>
      <IntegrationDashboard />
    </Box>
  );
};

export default Integrations; 