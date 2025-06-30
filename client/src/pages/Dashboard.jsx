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
import { useRealtimeSubscriptions } from '../hooks/useRealtimeSubscriptions';
import { supabase } from '../lib/supabase';
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
  
  // Initialize real-time subscriptions
  const { isConnected } = useRealtimeSubscriptions();
  
  // Listen for appointment updates to refresh dashboard data
  useEffect(() => {
    const handleAppointmentChange = () => {
      // Invalidate all dashboard-related queries when appointments change
      queryClient.invalidateQueries('dashboard-stats');
      queryClient.invalidateQueries(['today-appointments']);
      queryClient.invalidateQueries('upcoming-appointments');
    };

    // Listen for custom events from real-time subscriptions
    window.addEventListener('appointmentUpdated', handleAppointmentChange);
    window.addEventListener('appointmentCreated', handleAppointmentChange);
    window.addEventListener('appointmentDeleted', handleAppointmentChange);

    return () => {
      window.removeEventListener('appointmentUpdated', handleAppointmentChange);
      window.removeEventListener('appointmentCreated', handleAppointmentChange);
      window.removeEventListener('appointmentDeleted', handleAppointmentChange);
    };
  }, [queryClient]);

  // Fetch dashboard statistics
  const { data: stats, isLoading: loadingStats } = useQuery(
    'dashboard-stats',
    async () => {
      const today = dayjs().format('YYYY-MM-DD');
      const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
      const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD');
      const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
      const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

      try {
        // Get today's appointments
        const { data: todayAppts } = await supabase
          .from('appointments')
          .select(`
            *,
            timeslot:timeslots!timeslot_id(date, start_time, end_time)
          `)
          .eq('timeslots.date', today)
          .in('status', ['scheduled', 'confirmed']);

        // Get week's appointments
        const { data: weekAppts } = await supabase
          .from('appointments')
          .select(`
            *,
            timeslot:timeslots!timeslot_id(date, start_time, end_time)
          `)
          .gte('timeslots.date', startOfWeek)
          .lte('timeslots.date', endOfWeek);

        // Get today's available timeslots
        const { data: todaySlots } = await supabase
          .from('timeslots')
          .select('*')
          .eq('date', today)
          .eq('status', 'available');

        // Get month stats
        const { data: monthAppts } = await supabase
          .from('appointments')
          .select(`
            status, 
            meeting_type,
            timeslot:timeslots!timeslot_id(date)
          `)
          .gte('timeslots.date', startOfMonth)
          .lte('timeslots.date', endOfMonth);

        // Calculate stats
        const monthStats = {
          byStatus: {},
          byMeetingType: {}
        };

        (monthAppts || []).forEach(apt => {
          monthStats.byStatus[apt.status] = (monthStats.byStatus[apt.status] || 0) + 1;
          monthStats.byMeetingType[apt.meeting_type] = (monthStats.byMeetingType[apt.meeting_type] || 0) + 1;
        });

        return {
          todayCount: (todayAppts || []).length,
          weekCount: (weekAppts || []).length,
          availableSlots: (todaySlots || []).length,
          completedThisWeek: (weekAppts || []).filter(a => a.status === 'completed').length,
          monthStats,
        };
      } catch (error) {
        console.error('Dashboard stats query error:', error);
        throw error;
      }
    }
  );

  // Fetch today's appointments
  const { data: todayAppointments, isLoading: loadingAppointments } = useQuery(
    ['today-appointments', selectedDate.format('YYYY-MM-DD')],
    async () => {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            *,
            timeslot:timeslots!timeslot_id(id, date, start_time, end_time),
            doctor:users!doctor_id(id, first_name, last_name, email, specialization),
            pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name),
            products:appointment_products(id, name, category, description)
          `)
          .eq('timeslots.date', selectedDate.format('YYYY-MM-DD'))
          .in('status', ['scheduled', 'confirmed']);

        if (error) throw error;

        // Add computed full_name for display and sort by timeslot start_time
        const appointmentsWithFullName = (data || []).map(apt => ({
          ...apt,
          doctor: apt.doctor ? {
            ...apt.doctor,
            full_name: `${apt.doctor.first_name || ''} ${apt.doctor.last_name || ''}`.trim() || apt.doctor.email
          } : null,
          pharma_rep: apt.pharma_rep ? {
            ...apt.pharma_rep,
            full_name: `${apt.pharma_rep.first_name || ''} ${apt.pharma_rep.last_name || ''}`.trim() || apt.pharma_rep.email
          } : null
        }));

        // Sort by timeslot start_time
        return appointmentsWithFullName.sort((a, b) => {
          const timeA = a.timeslot?.start_time || '';
          const timeB = b.timeslot?.start_time || '';
          return timeA.localeCompare(timeB);
        });
      } catch (error) {
        console.error('Today appointments query error:', error);
        throw error;
      }
    }
  );

  // Fetch upcoming appointments (next 7 days)
  const { data: upcomingAppointments } = useQuery(
    'upcoming-appointments',
    async () => {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            *,
            timeslot:timeslots!timeslot_id(id, date, start_time, end_time),
            doctor:users!doctor_id(id, first_name, last_name, email, specialization),
            pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name),
            products:appointment_products(id, name, category, description)
          `)
          .gte('timeslots.date', dayjs().format('YYYY-MM-DD'))
          .lte('timeslots.date', dayjs().add(7, 'day').format('YYYY-MM-DD'))
          .in('status', ['scheduled', 'confirmed']);

        if (error) throw error;

        // Add computed full_name for display
        const appointmentsWithFullName = (data || []).map(apt => ({
          ...apt,
          doctor: apt.doctor ? {
            ...apt.doctor,
            full_name: `${apt.doctor.first_name || ''} ${apt.doctor.last_name || ''}`.trim() || apt.doctor.email
          } : null,
          pharma_rep: apt.pharma_rep ? {
            ...apt.pharma_rep,
            full_name: `${apt.pharma_rep.first_name || ''} ${apt.pharma_rep.last_name || ''}`.trim() || apt.pharma_rep.email
          } : null
        }));

        // Sort by timeslot date first, then by start_time
        return appointmentsWithFullName.sort((a, b) => {
          const dateA = a.timeslot?.date || '';
          const dateB = b.timeslot?.date || '';
          const dateCompare = dateA.localeCompare(dateB);
          if (dateCompare !== 0) return dateCompare;
          
          const timeA = a.timeslot?.start_time || '';
          const timeB = b.timeslot?.start_time || '';
          return timeA.localeCompare(timeB);
        });
      } catch (error) {
        console.error('Upcoming appointments query error:', error);
        throw error;
      }
    }
  );

  // Fetch appointments needing action
  const { data: pendingActions } = useQuery(
    'pending-actions',
    async () => {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            *,
            timeslot:timeslots!timeslot_id(id, date, start_time, end_time),
            doctor:users!doctor_id(id, first_name, last_name, email, specialization),
            pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name),
            products:appointment_products(id, name, category, description)
          `)
          .eq('status', 'scheduled')
          .gte('timeslots.date', dayjs().format('YYYY-MM-DD'))
          .lte('timeslots.date', dayjs().add(2, 'day').format('YYYY-MM-DD'));

        if (error) throw error;

        // Add computed full_name for display
        const appointmentsWithFullName = (data || []).map(apt => ({
          ...apt,
          doctor: apt.doctor ? {
            ...apt.doctor,
            full_name: `${apt.doctor.first_name || ''} ${apt.doctor.last_name || ''}`.trim() || apt.doctor.email
          } : null,
          pharma_rep: apt.pharma_rep ? {
            ...apt.pharma_rep,
            full_name: `${apt.pharma_rep.first_name || ''} ${apt.pharma_rep.last_name || ''}`.trim() || apt.pharma_rep.email
          } : null
        }));

        // Sort by timeslot date first, then by start_time
        return appointmentsWithFullName.sort((a, b) => {
          const dateA = a.timeslot?.date || '';
          const dateB = b.timeslot?.date || '';
          const dateCompare = dateA.localeCompare(dateB);
          if (dateCompare !== 0) return dateCompare;
          
          const timeA = a.timeslot?.start_time || '';
          const timeB = b.timeslot?.start_time || '';
          return timeA.localeCompare(timeB);
        });
      } catch (error) {
        console.error('Pending actions query error:', error);
        throw error;
      }
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
      await supabase
        .from('appointments')
        .update({ 
          status: 'confirmed',
          confirmed_at: new Date().toISOString()
        })
        .eq('id', appointmentId);
      enqueueSnackbar('Appointment confirmed successfully', { variant: 'success' });
      // Refetch all related data
      queryClient.invalidateQueries('dashboard-stats');
      queryClient.invalidateQueries(['today-appointments']);
      queryClient.invalidateQueries('upcoming-appointments');
      queryClient.invalidateQueries(['pending-actions']);
    } catch (error) {
      enqueueSnackbar(error.message || 'Failed to confirm appointment', { variant: 'error' });
    } finally {
      setProcessingAppointment(null);
    }
  };

  // Handle appointment completion
  const handleCompleteAppointment = async (appointmentId) => {
    setProcessingAppointment(appointmentId);
    try {
      await supabase
        .from('appointments')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', appointmentId);
      enqueueSnackbar('Appointment marked as completed', { variant: 'success' });
      // Refetch all related data
      queryClient.invalidateQueries('dashboard-stats');
      queryClient.invalidateQueries(['today-appointments']);
      queryClient.invalidateQueries('upcoming-appointments');
      queryClient.invalidateQueries(['pending-actions']);
    } catch (error) {
      enqueueSnackbar(error.message || 'Failed to complete appointment', { variant: 'error' });
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
            Welcome back, {user?.role === 'doctor' ? 'Dr.' : ''} {user?.first_name} {user?.last_name}
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
                  <Box key={appointment.id}>
                    <ListItem
                      secondaryAction={
                        <Box display="flex" alignItems="center" gap={1}>
                          {appointment.status === 'scheduled' && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<ConfirmIcon />}
                              onClick={() => handleConfirmAppointment(appointment.id)}
                              disabled={processingAppointment === appointment.id}
                            >
                              Confirm
                            </Button>
                          )}
                          {appointment.status === 'confirmed' && appointment.timeslot && dayjs(appointment.timeslot.end_time).isBefore(dayjs()) && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="success"
                              startIcon={<CompleteIcon />}
                              onClick={() => handleCompleteAppointment(appointment.id)}
                              disabled={processingAppointment === appointment.id}
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
                        <Avatar sx={{ bgcolor: appointment.meeting_type === 'virtual' ? 'info.main' : 'primary.light' }}>
                          <ScheduleIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          `${appointment.timeslot ? 
                            `${appointment.timeslot.start_time} - ${appointment.timeslot.end_time}` :
                            'Time: TBD'
                          } (${appointment.duration || 30} min) - ${appointment.meeting_type}`
                        }
                        secondary={
                          <>
                            {appointment.doctor?.full_name || 'Unknown Doctor'} - {appointment.pharma_rep?.full_name || 'Unknown Rep'}
                            <br />
                            Purpose: {appointment.purpose}
                            {appointment.products?.length > 0 && (
                              <>
                                <br />
                                Products: {appointment.products.map(p => p.name).join(', ')}
                              </>
                            )}
                          </>
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
                  <ListItem key={appointment.id}>
                    <ListItemText
                      primary={appointment.timeslot ? 
                        `${dayjs(appointment.timeslot.date).format('MMM D')} at ${appointment.timeslot.start_time}` :
                        'Time: TBD'
                      }
                      secondary={`${appointment.pharma_rep?.full_name || 'Unknown Rep'} - Needs confirmation`}
                    />
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleConfirmAppointment(appointment.id)}
                      disabled={processingAppointment === appointment.id}
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
                <ListItem key={appointment.id}>
                  <ListItemText
                    primary={appointment.timeslot ? 
                      `${dayjs(appointment.timeslot.date).format('MMM D')} at ${appointment.timeslot.start_time}` :
                      'Time: TBD'
                    }
                    secondary={`${appointment.doctor?.full_name || 'Unknown Doctor'}`}
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