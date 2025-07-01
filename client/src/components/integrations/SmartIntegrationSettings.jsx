import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Button,
  Alert,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tooltip,
  IconButton,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Psychology as AIIcon,
  Speed as PerformanceIcon,
  Security as SecurityIcon,
  Analytics as AnalyticsIcon,
  Schedule as BufferIcon,
  CalendarToday as CalendarIcon,
  Sync as SyncIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  TrendingUp as TrendIcon,
  AutoAwesome as SmartIcon,
  Notifications as NotificationIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';

import BufferTimeSettings from './BufferTimeSettings';
import CalendarSelectionModal from './CalendarSelectionModal';

/**
 * Smart Integration Settings Panel with AI-Powered Features
 */
const SmartIntegrationSettings = ({ 
  userId, 
  integrations = [], 
  onSettingsUpdate 
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [smartInsights, setSmartInsights] = useState(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [selectedCalendars, setSelectedCalendars] = useState([]);
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [settings, setSettings] = useState({
    smartFeatures: {
      autoConflictResolution: true,
      travelTimeOptimization: true,
      preferencelearning: true,
      smartScheduling: true,
      aiRecommendations: true,
    },
    notifications: {
      conflictAlerts: true,
      syncFailures: true,
      smartSuggestions: true,
      weeklyInsights: true,
    },
    performance: {
      realTimeSyncEnabled: true,
      batchSyncInterval: 15,
      intelligentCaching: true,
      backgroundOptimization: true,
    },
    privacy: {
      dataMinimization: true,
      anonymizedAnalytics: true,
      gdprCompliance: true,
      encryptionLevel: 'advanced',
    }
  });

  // Load smart insights when component mounts
  useEffect(() => {
    loadSmartInsights();
    loadCalendarData();
  }, [userId, integrations]);

  const loadSmartInsights = async () => {
    setLoadingInsights(true);
    try {
      const response = await fetch(`/api/smart-insights/user/${userId}`);
      if (response.ok) {
        const insights = await response.json();
        setSmartInsights(insights);
      }
    } catch (error) {
      console.error('Failed to load smart insights:', error);
    } finally {
      setLoadingInsights(false);
    }
  };

  const loadCalendarData = async () => {
    try {
      const [calendarsResponse, selectedResponse] = await Promise.all([
        fetch(`/api/integrations/google/calendars/${userId}`),
        fetch(`/api/users/${userId}/selected-calendars`)
      ]);

      if (calendarsResponse.ok) {
        const calendarsData = await calendarsResponse.json();
        setAvailableCalendars(calendarsData.calendars || []);
      }

      if (selectedResponse.ok) {
        const selectedData = await selectedResponse.json();
        setSelectedCalendars(selectedData.calendars || []);
      }
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleSettingToggle = (category, setting) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [setting]: !prev[category][setting]
      }
    }));
  };

  const handleCalendarSave = (calendarData) => {
    setSelectedCalendars(calendarData.calendars);
    setCalendarModalOpen(false);
    // Trigger settings update
    onSettingsUpdate?.(settings);
  };

  // Smart Insights Panel Component
  const SmartInsightsPanel = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AIIcon color="primary" />
          AI-Powered Insights & Recommendations
        </Typography>
        
        {loadingInsights ? (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Analyzing your integration patterns...
            </Typography>
          </Box>
        ) : smartInsights ? (
          <Box sx={{ mt: 2 }}>
            {/* Conflict Patterns */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Conflict Resolution Patterns
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  icon={<TrendIcon />}
                  label={`${smartInsights.conflictResolution?.totalResolved || 0} conflicts resolved`}
                  color="success"
                  size="small"
                />
                <Chip
                  icon={<AIIcon />}
                  label={`${Math.round((smartInsights.conflictResolution?.aiAccuracy || 0) * 100)}% AI accuracy`}
                  color="primary"
                  size="small"
                />
                <Chip
                  icon={<LocationIcon />}
                  label={`${smartInsights.travelOptimization?.totalOptimizations || 0} travel optimizations`}
                  color="info"
                  size="small"
                />
              </Box>
            </Box>

            {/* Recommendations */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Smart Recommendations
              </Typography>
              <List dense>
                {smartInsights.recommendations?.map((rec, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <SmartIcon color="primary" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText 
                      primary={rec.title}
                      secondary={rec.description}
                    />
                    <Chip 
                      label={`${Math.round(rec.confidence * 100)}% confidence`} 
                      size="small" 
                      variant="outlined"
                    />
                  </ListItem>
                ))}
              </List>
            </Box>

            {/* Performance Metrics */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Integration Performance
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">Sync Success Rate</Typography>
                  <Typography variant="h6" color="success.main">
                    {Math.round((smartInsights.performance?.syncSuccessRate || 0) * 100)}%
                  </Typography>
                </Card>
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">Avg Sync Time</Typography>
                  <Typography variant="h6" color="primary.main">
                    {smartInsights.performance?.avgSyncTime || 0}ms
                  </Typography>
                </Card>
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">Smart Features Used</Typography>
                  <Typography variant="h6" color="info.main">
                    {smartInsights.featureUsage?.total || 0}
                  </Typography>
                </Card>
              </Box>
            </Box>
          </Box>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            Connect your integrations to see AI-powered insights and recommendations.
          </Alert>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <SettingsIcon />
        Smart Integration Settings
        <Chip 
          icon={<AIIcon />} 
          label="AI-Powered" 
          color="primary" 
          variant="outlined" 
        />
      </Typography>

      {/* Smart Insights Panel */}
      <SmartInsightsPanel />

      {/* Settings Tabs */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab 
              icon={<BufferIcon />} 
              label="Buffer Time Settings" 
              iconPosition="start"
            />
            <Tab 
              icon={<CalendarIcon />} 
              label="Calendar Selection" 
              iconPosition="start"
            />
            <Tab 
              icon={<SmartIcon />} 
              label="Smart Features" 
              iconPosition="start"
            />
            <Tab 
              icon={<NotificationIcon />} 
              label="Notifications" 
              iconPosition="start"
            />
            <Tab 
              icon={<PerformanceIcon />} 
              label="Performance" 
              iconPosition="start"
            />
            <Tab 
              icon={<SecurityIcon />} 
              label="Privacy & Security" 
              iconPosition="start"
            />
          </Tabs>
        </Box>

        <CardContent sx={{ p: 0 }}>
          {/* Buffer Time Settings Tab */}
          {activeTab === 0 && (
            <Box sx={{ p: 3 }}>
              <BufferTimeSettings 
                userId={userId}
                onSettingsUpdate={onSettingsUpdate}
              />
            </Box>
          )}

          {/* Calendar Selection Tab */}
          {activeTab === 1 && (
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">Calendar Synchronization</Typography>
                <Button
                  variant="contained"
                  startIcon={<CalendarIcon />}
                  onClick={() => setCalendarModalOpen(true)}
                >
                  Manage Calendars
                </Button>
              </Box>

              {selectedCalendars.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Currently Syncing {selectedCalendars.length} Calendar(s)
                  </Typography>
                  <List>
                    {selectedCalendars.map((calendar) => (
                      <ListItem key={calendar.calendar_id}>
                        <ListItemIcon>
                          <CalendarIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={calendar.calendar_name}
                          secondary={`Sync: ${calendar.sync_direction} • Conflicts: ${calendar.conflict_resolution}`}
                        />
                        <Badge 
                          badgeContent={<CheckIcon fontSize="small" />} 
                          color="success"
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ) : (
                <Alert severity="info">
                  No calendars selected for synchronization. Click "Manage Calendars" to get started.
                </Alert>
              )}
            </Box>
          )}

          {/* Smart Features Tab */}
          {activeTab === 2 && (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                AI-Powered Smart Features
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <AIIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Auto Conflict Resolution"
                    secondary="Automatically resolve calendar conflicts using AI recommendations"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.smartFeatures.autoConflictResolution}
                        onChange={() => handleSettingToggle('smartFeatures', 'autoConflictResolution')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <LocationIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Travel Time Optimization"
                    secondary="Factor in travel time when scheduling and detecting conflicts"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.smartFeatures.travelTimeOptimization}
                        onChange={() => handleSettingToggle('smartFeatures', 'travelTimeOptimization')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <TrendIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Preference Learning"
                    secondary="Learn from your scheduling decisions to provide better recommendations"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.smartFeatures.preferencelearning}
                        onChange={() => handleSettingToggle('smartFeatures', 'preferencelearning')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <SmartIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Smart Scheduling"
                    secondary="AI-powered scheduling suggestions based on availability and preferences"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.smartFeatures.smartScheduling}
                        onChange={() => handleSettingToggle('smartFeatures', 'smartScheduling')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <AnalyticsIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="AI Recommendations"
                    secondary="Receive intelligent recommendations for improving your scheduling workflow"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.smartFeatures.aiRecommendations}
                        onChange={() => handleSettingToggle('smartFeatures', 'aiRecommendations')}
                      />
                    }
                    label=""
                  />
                </ListItem>
              </List>
            </Box>
          )}

          {/* Notifications Tab */}
          {activeTab === 3 && (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Notification Preferences
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <WarningIcon color="warning" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Conflict Alerts"
                    secondary="Get notified when calendar conflicts are detected"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.conflictAlerts}
                        onChange={() => handleSettingToggle('notifications', 'conflictAlerts')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <SyncIcon color="error" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Sync Failures"
                    secondary="Receive alerts when calendar synchronization fails"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.syncFailures}
                        onChange={() => handleSettingToggle('notifications', 'syncFailures')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <SmartIcon color="info" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Smart Suggestions"
                    secondary="Get notified when AI has new scheduling suggestions"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.smartSuggestions}
                        onChange={() => handleSettingToggle('notifications', 'smartSuggestions')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <AnalyticsIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Weekly Insights"
                    secondary="Receive weekly reports on your scheduling patterns and optimization opportunities"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications.weeklyInsights}
                        onChange={() => handleSettingToggle('notifications', 'weeklyInsights')}
                      />
                    }
                    label=""
                  />
                </ListItem>
              </List>
            </Box>
          )}

          {/* Performance Tab */}
          {activeTab === 4 && (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Performance Optimization
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <SyncIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Real-time Sync"
                    secondary="Enable real-time calendar synchronization for instant updates"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.performance.realTimeSyncEnabled}
                        onChange={() => handleSettingToggle('performance', 'realTimeSyncEnabled')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <PerformanceIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Intelligent Caching"
                    secondary="Use smart caching to improve performance and reduce API calls"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.performance.intelligentCaching}
                        onChange={() => handleSettingToggle('performance', 'intelligentCaching')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <SmartIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Background Optimization"
                    secondary="Automatically optimize performance during low-usage periods"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.performance.backgroundOptimization}
                        onChange={() => handleSettingToggle('performance', 'backgroundOptimization')}
                      />
                    }
                    label=""
                  />
                </ListItem>
              </List>
            </Box>
          )}

          {/* Privacy & Security Tab */}
          {activeTab === 5 && (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Privacy & Security
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon>
                    <SecurityIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Data Minimization"
                    secondary="Only collect and store essential data required for functionality"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.privacy.dataMinimization}
                        onChange={() => handleSettingToggle('privacy', 'dataMinimization')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <AnalyticsIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Anonymized Analytics"
                    secondary="Use anonymized data for improving AI recommendations while protecting privacy"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.privacy.anonymizedAnalytics}
                        onChange={() => handleSettingToggle('privacy', 'anonymizedAnalytics')}
                      />
                    }
                    label=""
                  />
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <CheckIcon color="success" />
                  </ListItemIcon>
                  <ListItemText 
                    primary="GDPR Compliance"
                    secondary="Ensure all data processing complies with GDPR regulations"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.privacy.gdprCompliance}
                        onChange={() => handleSettingToggle('privacy', 'gdprCompliance')}
                      />
                    }
                    label=""
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Encryption Level: Advanced (AES-256)
                </Typography>
                <Alert severity="success" sx={{ mt: 1 }}>
                  All data is encrypted using industry-standard AES-256 encryption both in transit and at rest.
                </Alert>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Calendar Selection Modal */}
      <CalendarSelectionModal
        isOpen={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        availableCalendars={availableCalendars}
        selectedCalendars={selectedCalendars}
        onSave={handleCalendarSave}
        recommendations={smartInsights?.calendarRecommendations || []}
      />
    </Box>
  );
};

export default SmartIntegrationSettings; 