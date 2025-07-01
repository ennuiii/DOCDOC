import React, { useState, useEffect } from 'react';
import {
  Paper,
  Box,
  Typography,
  Chip,
  LinearProgress,
  Grid,
  Card,
  CardContent,
  Divider,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Avatar,
} from '@mui/material';
import {
  Psychology as AIIcon,
  Timeline as TrendIcon,
  Navigation as TravelIcon,
  Schedule as ConflictIcon,
  Speed as PerformanceIcon,
  Analytics as AnalyticsIcon,
  TrendingUp as InsightIcon,
  AutoAwesome as SmartIcon,
  CheckCircle as SuccessIcon,
  Warning as WarningIcon,
  MapPin as LocationIcon,
  Zap as OptimizationIcon,
} from '@mui/icons-material';

/**
 * Smart Analytics Dashboard - Comprehensive analytics for all smart integration services
 */
const SmartAnalyticsDashboard = ({ 
  userId,
  integrations = [],
  timeRange = '7d',
  onRefresh
}) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load comprehensive analytics
  useEffect(() => {
    loadAnalytics();
  }, [userId, timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/smart-analytics/comprehensive?userId=${userId}&timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load smart analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Loading smart analytics...
        </Typography>
      </Paper>
    );
  }

  if (!analytics) {
    return (
      <Alert severity="info">
        No analytics data available. Connect your integrations to see insights.
      </Alert>
    );
  }

  return (
    <Box sx={{ space: 3 }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartIcon />
          Smart Integration Analytics
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          AI-powered insights from your calendar integrations and scheduling patterns
        </Typography>
        {lastUpdated && (
          <Typography variant="caption" sx={{ opacity: 0.8, mt: 1, display: 'block' }}>
            Last updated: {lastUpdated.toLocaleString()}
          </Typography>
        )}
      </Paper>

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'success.main', mx: 'auto', mb: 1 }}>
                <ConflictIcon />
              </Avatar>
              <Typography variant="h4" color="success.main">
                {analytics.conflictResolution?.totalResolved || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Conflicts Resolved
              </Typography>
              <Chip 
                label={`${Math.round((analytics.conflictResolution?.aiSuccessRate || 0) * 100)}% AI Success`}
                color="success"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'info.main', mx: 'auto', mb: 1 }}>
                <TravelIcon />
              </Avatar>
              <Typography variant="h4" color="info.main">
                {analytics.travelOptimization?.totalOptimizations || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Travel Optimizations
              </Typography>
              <Chip 
                label={`${analytics.travelOptimization?.timeSavedHours || 0}h saved`}
                color="info"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'primary.main', mx: 'auto', mb: 1 }}>
                <AIIcon />
              </Avatar>
              <Typography variant="h4" color="primary.main">
                {analytics.smartSuggestions?.totalGenerated || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Smart Suggestions
              </Typography>
              <Chip 
                label={`${Math.round((analytics.smartSuggestions?.acceptanceRate || 0) * 100)}% accepted`}
                color="primary"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'warning.main', mx: 'auto', mb: 1 }}>
                <TrendIcon />
              </Avatar>
              <Typography variant="h4" color="warning.main">
                {analytics.preferenceLearning?.totalDecisions || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Decisions Learned
              </Typography>
              <Chip 
                label={`${Math.round((analytics.preferenceLearning?.accuracy || 0) * 100)}% accuracy`}
                color="warning"
                size="small"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Conflict Resolution Analytics */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ConflictIcon color="error" />
                Smart Conflict Resolution
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Resolution Success Rate
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(analytics.conflictResolution?.successRate || 0) * 100}
                  color="success"
                  sx={{ height: 8, borderRadius: 4, mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {Math.round((analytics.conflictResolution?.successRate || 0) * 100)}% of conflicts resolved automatically
                </Typography>
              </Box>

              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <SuccessIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Time Overlap Conflicts"
                    secondary={`${analytics.conflictResolution?.byType?.timeOverlap || 0} resolved`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <LocationIcon color="warning" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Travel Impossibilities"
                    secondary={`${analytics.conflictResolution?.byType?.travelImpossible || 0} detected & resolved`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <OptimizationIcon color="info" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Buffer Violations"
                    secondary={`${analytics.conflictResolution?.byType?.bufferViolation || 0} optimized`}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Travel Time Optimization */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TravelIcon color="primary" />
                Travel Time Intelligence
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Travel Feasibility Score
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(analytics.travelOptimization?.feasibilityScore || 0) * 100}
                  color="primary"
                  sx={{ height: 8, borderRadius: 4, mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {Math.round((analytics.travelOptimization?.feasibilityScore || 0) * 100)}% of meetings are travel-feasible
                </Typography>
              </Box>

              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <TravelIcon color="primary" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Average Travel Time"
                    secondary={`${analytics.travelOptimization?.avgTravelTime || 0} minutes`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <OptimizationIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Time Saved"
                    secondary={`${analytics.travelOptimization?.timeSavedHours || 0} hours this ${timeRange}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <WarningIcon color="warning" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Travel Warnings"
                    secondary={`${analytics.travelOptimization?.warningsIssued || 0} warnings issued`}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Smart Suggestions Analytics */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmartIcon color="secondary" />
                Alternative Suggestions
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Suggestion Acceptance Rate
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(analytics.smartSuggestions?.acceptanceRate || 0) * 100}
                  color="secondary"
                  sx={{ height: 8, borderRadius: 4, mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {Math.round((analytics.smartSuggestions?.acceptanceRate || 0) * 100)}% of AI suggestions accepted
                </Typography>
              </Box>

              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <AIIcon color="secondary" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Total Suggestions"
                    secondary={`${analytics.smartSuggestions?.totalGenerated || 0} generated`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <SuccessIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Average Score"
                    secondary={`${Math.round((analytics.smartSuggestions?.avgScore || 0) * 100)}% quality score`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <TrendIcon color="info" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Preference Match"
                    secondary={`${Math.round((analytics.smartSuggestions?.preferenceMatch || 0) * 100)}% user preference alignment`}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Preference Learning */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendIcon color="warning" />
                Preference Learning
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Learning Model Accuracy
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(analytics.preferenceLearning?.accuracy || 0) * 100}
                  color="warning"
                  sx={{ height: 8, borderRadius: 4, mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {Math.round((analytics.preferenceLearning?.accuracy || 0) * 100)}% prediction accuracy
                </Typography>
              </Box>

              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <InsightIcon color="warning" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Decisions Tracked"
                    secondary={`${analytics.preferenceLearning?.totalDecisions || 0} scheduling decisions`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <AIIcon color="primary" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Patterns Identified"
                    secondary={`${analytics.preferenceLearning?.patternsFound || 0} behavioral patterns`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <TrendIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Confidence Level"
                    secondary={`${Math.round((analytics.preferenceLearning?.confidence || 0) * 100)}% confidence in predictions`}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Metrics */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PerformanceIcon color="info" />
                System Performance & Integration Health
              </Typography>

              <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {Math.round((analytics.performance?.uptime || 0) * 100)}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      System Uptime
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary.main">
                      {analytics.performance?.avgResponseTime || 0}ms
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Avg Response Time
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="info.main">
                      {analytics.performance?.apiCallsToday || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      API Calls Today
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main">
                      {Math.round((analytics.performance?.cacheHitRate || 0) * 100)}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Cache Hit Rate
                    </Typography>
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Next optimization scheduled for tonight at 2:00 AM
                </Typography>
                <Chip 
                  icon={<SmartIcon />}
                  label="AI Optimization Active"
                  color="primary"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SmartAnalyticsDashboard; 