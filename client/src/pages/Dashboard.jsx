import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  IconButton,
  Button,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  EventAvailable as AppointmentIcon,
  People as PeopleIcon,
  TrendingUp as TrendingIcon,
  AccessTime as TimeIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
  Today as TodayIcon,
  ArrowForward as ArrowIcon,
  Business as CompanyIcon,
  Category as CategoryIcon,
  Notifications as NotificationIcon,
  CheckCircleOutline as ConfirmIcon,
  Done as CompleteIcon,
} from '@mui/icons-material';
import { DateCalendar } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useSnackbar } from 'notistack';
import { useQueryClient } from 'react-query';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [processingAppointment, setProcessingAppointment] = useState(null);

  // Fetch dashboard statistics
  const { data: stats, isLoading: loadingStats } = useQuery(
    'dashboard-stats',
    async () => {
      const today = dayjs().format('YYYY-MM-DD');
      const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
      const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');
      const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

      const [todayAppointments, weekAppointments, todayTimeslots, monthStats] = await Promise.all([
        api.get('/appointments', {
          params: {
            startDate: today,
            endDate: today,
            status: 'scheduled,confirmed',
          },
        }),
        api.get('/appointments', {
          params: {
            startDate: startOfWeek,
            endDate: endOfWeek,
          },
        }),
        api.get('/timeslots', {
          params: {
            date: today,
          },
        }),
        api.get('/appointments/stats', {
          params: {
            startDate: startOfMonth,
            endDate: endOfMonth,
          },
        }),
      ]);

      return {
        todayCount: todayAppointments.data.appointments.length,
        weekCount: weekAppointments.data.appointments.length,
        availableSlots: todayTimeslots.data.timeslots.filter(s => s.status === 'available').length,
        completedThisWeek: weekAppointments.data.appointments.filter(a => a.status === 'completed').length,
        monthStats: monthStats.data.stats,
      };
    }
  );

  // Fetch today's appointments
  const { data: todayAppointments, isLoading: loadingAppointments } = useQuery(
    ['today-appointments', selectedDate.format('YYYY-MM-DD')],
    async () => {
      const response = await api.get('/appointments', {
        params: {
          startDate: selectedDate.format('YYYY-MM-DD'),
          endDate: selectedDate.format('YYYY-MM-DD'),
          status: 'scheduled,confirmed',
        },
      });
      return response.data.appointments;
    }
  );

  // Fetch upcoming appointments (next 7 days)
  const { data: upcomingAppointments } = useQuery(
    'upcoming-appointments',
    async () => {
      const response = await api.get('/appointments', {
        params: {
          startDate: dayjs().format('YYYY-MM-DD'),
          endDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
          status: 'scheduled,confirmed',
        },
      });
      return response.data.appointments;
    }
  );

  // Fetch appointments needing action
  const { data: pendingActions } = useQuery(
    'pending-actions',
    async () => {
      const response = await api.get('/appointments', {
        params: {
          status: 'scheduled',
          startDate: dayjs().format('YYYY-MM-DD'),
          endDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
        },
      });
      return response.data.appointments.filter(apt => apt.status === 'scheduled');
    }
  );

  const getTimeFromNow = (date, time) => {
    const appointmentTime = dayjs(`${date} ${time}`);
    const now = dayjs();
    const diffMinutes = appointmentTime.diff(now, 'minute');
    
    if (diffMinutes < 0) return 'Past';
    if (diffMinutes < 60) return `In ${diffMinutes} minutes`;
    if (diffMinutes < 1440) return `In ${Math.floor(diffMinutes / 60)} hours`;
    return appointmentTime.format('MMM D');
  };

  const StatCard = ({ title, value, icon, color, subtext }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="text.secondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            {subtext && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {subtext}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ bgcolor: color, width: 56, height: 56 }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  const COLORS = {
    scheduled: '#2196F3',
    confirmed: '#4CAF50',
    completed: '#8BC34A',
    cancelled: '#F44336',
    'no-show': '#FF9800',
  };

  const meetingTypeColors = {
    'in-person': '#3F51B5',
    virtual: '#009688',
    phone: '#FF5722',
  };

  // Prepare chart data
  const statusChartData = stats?.monthStats ? Object.entries(stats.monthStats.byStatus).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' '),
    value: count,
  })) : [];

  const meetingTypeData = stats?.monthStats ? Object.entries(stats.monthStats.byMeetingType).map(([type, count]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' '),
    value: count,
  })) : [];

  // Handle appointment confirmation
  const handleConfirmAppointment = async (appointmentId) => {
    setProcessingAppointment(appointmentId);
    try {
      await api.post(`/appointments/${appointmentId}/confirm`);
      enqueueSnackbar('Appointment confirmed successfully', { variant: 'success' });
      // Refetch data
      queryClient.invalidateQueries(['today-appointments']);
      queryClient.invalidateQueries(['pending-actions']);
    } catch (error) {
      enqueueSnackbar(error.response?.data?.message || 'Failed to confirm appointment', { variant: 'error' });
    } finally {
      setProcessingAppointment(null);
    }
  };

  // Handle appointment completion
  const handleCompleteAppointment = async (appointmentId) => {
    setProcessingAppointment(appointmentId);
    try {
      await api.post(`/appointments/${appointmentId}/complete`);
      enqueueSnackbar('Appointment marked as completed', { variant: 'success' });
      // Refetch data
      queryClient.invalidateQueries(['today-appointments']);
      queryClient.invalidateQueries(['dashboard-stats']);
    } catch (error) {
      enqueueSnackbar(error.response?.data?.message || 'Failed to complete appointment', { variant: 'error' });
    } finally {
      setProcessingAppointment(null);
    }
  };

  if (user?.role !== 'doctor') {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body1">
          Welcome to Pharmadoc! Use the navigation menu to access different features.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Doctor Dashboard</Typography>
        <Box display="flex" alignItems="center" gap={2}>
          {pendingActions?.length > 0 && (
            <Chip
              icon={<NotificationIcon />}
              label={`${pendingActions.length} appointments need confirmation`}
              color="warning"
              onClick={() => navigate('/appointments')}
            />
          )}
          <Typography variant="subtitle1" color="text.secondary">
            Welcome back, Dr. {user?.profile?.lastName}
          </Typography>
        </Box>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Today's Appointments"
            value={stats?.todayCount || 0}
            icon={<TodayIcon />}
            color="primary.main"
            subtext={`${stats?.availableSlots || 0} slots available`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="This Week"
            value={stats?.weekCount || 0}
            icon={<CalendarIcon />}
            color="secondary.main"
            subtext={`${stats?.completedThisWeek || 0} completed`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completion Rate"
            value={stats?.monthStats?.completionRate ? `${stats.monthStats.completionRate}%` : '0%'}
            icon={<TrendingIcon />}
            color="success.main"
            subtext="This month"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pharma Companies"
            value={stats?.monthStats?.uniqueCompanies || 0}
            icon={<CompanyIcon />}
            color="warning.main"
            subtext="This month"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Calendar and Today's Schedule */}
        <Grid item xs={12} md={8}>
          {/* Analytics Charts */}
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Appointment Status (This Month)
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase().replace(' ', '-')] || '#666'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Meeting Types
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={meetingTypeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value">
                      {meetingTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={meetingTypeColors[entry.name.toLowerCase().replace(' ', '-')] || '#666'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Today's Schedule - {selectedDate.format('MMMM D, YYYY')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {loadingAppointments ? (
              <LinearProgress />
            ) : todayAppointments?.length === 0 ? (
              <Box textAlign="center" py={4}>
                <Typography color="text.secondary">
                  No appointments scheduled for {selectedDate.format('MMMM D, YYYY')}
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<CalendarIcon />}
                  onClick={() => navigate('/timeslots')}
                  sx={{ mt: 2 }}
                >
                  Manage Timeslots
                </Button>
              </Box>
            ) : (
              <List>
                {todayAppointments?.map((appointment, index) => (
                  <Box key={appointment._id}>
                    <ListItem
                      secondaryAction={
                        <Box display="flex" alignItems="center" gap={1}>
                          {appointment.status === 'scheduled' && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<ConfirmIcon />}
                              onClick={() => handleConfirmAppointment(appointment._id)}
                              disabled={processingAppointment === appointment._id}
                            >
                              Confirm
                            </Button>
                          )}
                          {appointment.status === 'confirmed' && dayjs(`${appointment.timeslot.date} ${appointment.timeslot.endTime}`).isBefore(dayjs()) && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="success"
                              startIcon={<CompleteIcon />}
                              onClick={() => handleCompleteAppointment(appointment._id)}
                              disabled={processingAppointment === appointment._id}
                            >
                              Complete
                            </Button>
                          )}
                          <Chip
                            label={appointment.status}
                            color={appointment.status === 'confirmed' ? 'success' : 'info'}
                            size="small"
                          />
                          <IconButton
                            edge="end"
                            onClick={() => navigate('/appointments')}
                          >
                            <ArrowIcon />
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: appointment.meetingType === 'virtual' ? 'info.main' : 'primary.light' }}>
                          <ScheduleIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="subtitle1">
                              {appointment.timeslot.startTime} - {appointment.timeslot.endTime}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              ({appointment.duration || 30} min)
                            </Typography>
                            <Chip
                              label={appointment.meetingType}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2">
                              {appointment.pharmaRep.profile.firstName} {appointment.pharmaRep.profile.lastName} - {appointment.pharmaRep.profile.companyName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Purpose: {appointment.purpose}
                            </Typography>
                            {appointment.products?.length > 0 && (
                              <Typography variant="body2" color="text.secondary">
                                Products: {appointment.products.map(p => p.name).join(', ')}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < todayAppointments.length - 1 && <Divider variant="inset" component="li" />}
                  </Box>
                ))}
              </List>
            )}
          </Paper>

          {/* Quick Actions */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<CalendarIcon />}
                  onClick={() => navigate('/timeslots')}
                >
                  Manage Timeslots
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AppointmentIcon />}
                  onClick={() => navigate('/appointments')}
                >
                  View All Appointments
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<PeopleIcon />}
                  onClick={() => navigate('/staff')}
                  disabled
                >
                  Manage Staff
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Calendar Widget and Notifications */}
        <Grid item xs={12} md={4}>
          {/* Pending Actions */}
          {pendingActions?.length > 0 && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'warning.light', color: 'warning.contrastText' }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <NotificationIcon />
                <Typography variant="h6">Action Required</Typography>
              </Box>
              <List dense>
                {pendingActions.slice(0, 3).map((appointment) => (
                  <ListItem key={appointment._id}>
                    <ListItemText
                      primary={`${dayjs(appointment.timeslot.date).format('MMM D')} at ${appointment.timeslot.startTime}`}
                      secondary={`${appointment.pharmaRep.profile.companyName} - Needs confirmation`}
                    />
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleConfirmAppointment(appointment._id)}
                      disabled={processingAppointment === appointment._id}
                    >
                      Confirm
                    </Button>
                  </ListItem>
                ))}
              </List>
              {pendingActions.length > 3 && (
                <Button
                  fullWidth
                  size="small"
                  onClick={() => navigate('/appointments')}
                >
                  View all {pendingActions.length} pending
                </Button>
              )}
            </Paper>
          )}

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Calendar
            </Typography>
            <DateCalendar
              value={selectedDate}
              onChange={setSelectedDate}
              sx={{ width: '100%' }}
            />
          </Paper>

          {/* Upcoming Appointments */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Upcoming This Week
            </Typography>
            <List dense>
              {upcomingAppointments?.slice(0, 5).map((appointment) => (
                <ListItem key={appointment._id}>
                  <ListItemText
                    primary={`${dayjs(appointment.timeslot.date).format('MMM D')} at ${appointment.timeslot.startTime}`}
                    secondary={`${appointment.pharmaRep.profile.companyName}`}
                  />
                </ListItem>
              ))}
              {upcomingAppointments?.length > 5 && (
                <ListItem>
                  <Button
                    size="small"
                    onClick={() => navigate('/appointments')}
                  >
                    View all {upcomingAppointments.length} appointments
                  </Button>
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard; 