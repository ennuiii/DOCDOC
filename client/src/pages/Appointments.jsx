import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Autocomplete,
  Rating,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Add as AddIcon,
  Cancel as CancelIcon,
  CheckCircle as ConfirmIcon,
  Info as InfoIcon,
  LocationOn as LocationIcon,
  VideoCall as VideoIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSnackbar } from 'notistack';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const Appointments = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  const [tabValue, setTabValue] = useState(0);
  const [dateRange, setDateRange] = useState({
    startDate: dayjs(),
    endDate: dayjs().add(30, 'day') // Default to next 30 days for better appointment visibility
  });
  const [openBookingDialog, setOpenBookingDialog] = useState(false);
  const [selectedTimeslot, setSelectedTimeslot] = useState(null);
  const [openDetailsDialog, setOpenDetailsDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [filters, setFilters] = useState({
    specialization: '',
    doctorName: '',
  });
  
  const [bookingForm, setBookingForm] = useState({
    purpose: '',
    products: [],
    notes: '',
    meetingType: 'in-person',
  });
  
  const [processingAppointment, setProcessingAppointment] = useState(null);

  // Quick date filter functions
  const setQuickDateFilter = (filter) => {
    const today = dayjs();
    
    switch (filter) {
      case 'today':
        setDateRange({
          startDate: today,
          endDate: today
        });
        break;
      case 'week':
        setDateRange({
          startDate: today,
          endDate: today.add(7, 'day')
        });
        break;
      case 'month':
        setDateRange({
          startDate: today,
          endDate: today.add(1, 'month')
        });
        break;
      default:
        break;
    }
  };

  // Set up real-time appointment updates
  useEffect(() => {
    const handleAppointmentUpdate = () => {
      queryClient.invalidateQueries('appointments');
      queryClient.invalidateQueries('available-timeslots');
    };

    const handleTimeslotUpdate = () => {
      queryClient.invalidateQueries('available-timeslots');
    };

    // Listen for appointment updates
    window.addEventListener('appointmentUpdate', handleAppointmentUpdate);
    window.addEventListener('timeslotUpdate', handleTimeslotUpdate);

    return () => {
      window.removeEventListener('appointmentUpdate', handleAppointmentUpdate);
      window.removeEventListener('timeslotUpdate', handleTimeslotUpdate);
    };
  }, [queryClient]);

  // Fetch available timeslots for pharma users
  const { data: timeslotsData, isLoading: loadingTimeslots } = useQuery(
    ['available-timeslots', dateRange.startDate.format('YYYY-MM-DD'), dateRange.endDate.format('YYYY-MM-DD'), filters],
    async () => {
      if (user?.role !== 'pharma') return { timeslots: [] };
      
      let query = supabase
        .from('timeslots')
        .select(`
          *,
          doctor:users!timeslots_doctor_id_fkey (
            id,
            first_name,
            last_name,
            specialization,
            title,
            clinic_name
          )
        `)
        .gte('date', dateRange.startDate.format('YYYY-MM-DD'))
        .lte('date', dateRange.endDate.format('YYYY-MM-DD'))
        .eq('status', 'available');

      const { data, error } = await query.order('date').order('start_time');
      
      if (error) {
        console.error('Timeslots query error:', error);
        throw error;
      }
      
      let filteredData = (data || []).filter(timeslot => 
        timeslot.current_bookings < timeslot.max_bookings
      );
      
      // Apply specialization filter if provided
      if (filters.specialization) {
        filteredData = filteredData.filter(slot => 
          slot.doctor?.specialization?.toLowerCase().includes(filters.specialization.toLowerCase())
        );
      }

      // Apply doctor name filter if provided
      if (filters.doctorName) {
        filteredData = filteredData.filter(slot => {
          const fullName = `${slot.doctor?.first_name || ''} ${slot.doctor?.last_name || ''}`.toLowerCase();
          return fullName.includes(filters.doctorName.toLowerCase());
        });
      }
      
      // Add computed full_name for display
      const timeslotsWithFullName = filteredData.map(timeslot => ({
        ...timeslot,
        doctor: {
          ...timeslot.doctor,
          full_name: `${timeslot.doctor?.first_name || ''} ${timeslot.doctor?.last_name || ''}`.trim() || timeslot.doctor?.email || 'Unknown Doctor'
        }
      }));
      
      return { timeslots: timeslotsWithFullName };
    },
    {
      enabled: tabValue === 0 && user?.role === 'pharma',
    }
  );

  // Fetch user's appointments
  const { data: appointmentsData, isLoading: loadingAppointments } = useQuery(
    ['appointments', tabValue, dateRange.startDate.format('YYYY-MM-DD'), dateRange.endDate.format('YYYY-MM-DD')],
    async () => {
      // Determine status list based on user role and tab
    let statusList;
    if (user?.role === 'pharma') {
      // Pharma: Tab 1 = upcoming, Tab 2 = past
      statusList = tabValue === 1 ? ['scheduled', 'confirmed'] : ['completed', 'cancelled'];
    } else {
      // Doctor: Tab 0 = upcoming, Tab 1 = past
      statusList = tabValue === 0 ? ['scheduled', 'confirmed'] : ['completed', 'cancelled'];
    }
      
      // First, get timeslots that match our date criteria
      let timeslotQuery = supabase
        .from('timeslots')
        .select('id');
      
      // Determine if this is upcoming or past based on user role and tab
      const isUpcoming = user?.role === 'pharma' ? tabValue === 1 : tabValue === 0;
      
      if (isUpcoming) {
        // Upcoming appointments: filter by date range
        timeslotQuery = timeslotQuery
          .gte('date', dateRange.startDate.format('YYYY-MM-DD'))
          .lte('date', dateRange.endDate.format('YYYY-MM-DD'));
      } else {
        // Past appointments: show appointments before today
        timeslotQuery = timeslotQuery
          .lte('date', dayjs().format('YYYY-MM-DD'));
      }

      const { data: timeslotIds, error: timeslotError } = await timeslotQuery;
      
      if (timeslotError) {
        console.error('Timeslots query error:', timeslotError);
        throw timeslotError;
      }

      const timeslotIdList = (timeslotIds || []).map(t => t.id);
      
      // If no timeslots match the date criteria, return empty appointments
      if (timeslotIdList.length === 0) {
        return { appointments: [] };
      }

      // Now get appointments that match the timeslot IDs and user criteria
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          timeslot:timeslots (
            id,
            date,
            start_time,
            end_time,
            duration
          ),
          doctor:users!doctor_id (
            id,
            first_name,
            last_name,
            specialization,
            title
          ),
          pharma_rep:users!pharma_rep_id (
            id,
            first_name,
            last_name,
            company_name
          ),
          products:appointment_products (
            id,
            name,
            category,
            description
          )
        `)
        .in('status', statusList)
        .in('timeslot_id', timeslotIdList)
        .or(`doctor_id.eq.${user.id},pharma_rep_id.eq.${user.id}`);
      
      if (error) {
        console.error('Appointments query error:', error);
        throw error;
      }
      
      // Debug logging
      console.log('Appointments query result:', {
        userRole: user?.role,
        userId: user?.id,
        statusList,
        tabValue,
        dateRange: {
          start: dateRange.startDate.format('YYYY-MM-DD'),
          end: dateRange.endDate.format('YYYY-MM-DD')
        },
        timeslotIdList: timeslotIdList.length,
        appointmentsFound: (data || []).length,
        appointments: data
      });
      
      // Add computed full_name for display
      const appointmentsWithFullName = (data || []).map(appointment => ({
        ...appointment,
        doctor: appointment.doctor ? {
          ...appointment.doctor,
          full_name: `${appointment.doctor.first_name || ''} ${appointment.doctor.last_name || ''}`.trim() || 'Unknown Doctor'
        } : null,
        pharma_rep: appointment.pharma_rep ? {
          ...appointment.pharma_rep,
          full_name: `${appointment.pharma_rep.first_name || ''} ${appointment.pharma_rep.last_name || ''}`.trim() || 'Unknown Rep'
        } : null
      }));

      // Sort appointments by date and time
      const sortedAppointments = appointmentsWithFullName.sort((a, b) => {
        const dateA = a.timeslot?.date || '';
        const dateB = b.timeslot?.date || '';
        const timeA = a.timeslot?.start_time || '';
        const timeB = b.timeslot?.start_time || '';
        
        // For upcoming appointments, sort ascending (earliest first)
        // For past appointments, sort descending (most recent first)
        const isUpcomingTab = user?.role === 'pharma' ? tabValue === 1 : tabValue === 0;
        const dateCompare = isUpcomingTab 
          ? dateA.localeCompare(dateB) 
          : dateB.localeCompare(dateA);
        
        if (dateCompare !== 0) return dateCompare;
        
        // If same date, sort by start time
        return timeA.localeCompare(timeB);
      });
      
      return { appointments: sortedAppointments };
    }
  );

  // Book appointment mutation
  const bookMutation = useMutation(
    async (data) => {
      const { products, timeslotId, ...appointmentData } = data;
      
      // Start a transaction for appointment + products
      const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          timeslot_id: timeslotId,
          doctor_id: selectedTimeslot.doctor.id,
          pharma_rep_id: user.id,
          purpose: appointmentData.purpose,
          notes: appointmentData.notes,
          meeting_type: appointmentData.meetingType,
          status: 'scheduled'
        })
        .select()
        .single();
      
      if (appointmentError) throw appointmentError;
      
      // Insert products if any
      if (products && products.length > 0) {
        const productsToInsert = products.map(product => ({
          appointment_id: appointment.id,
          name: product.name || product,
          category: product.category || 'other',
          description: product.description || null
        }));
        
        const { error: productsError } = await supabase
          .from('appointment_products')
          .insert(productsToInsert);
        
        if (productsError) throw productsError;
      }
      
      // Update timeslot current_bookings
      const { error: updateError } = await supabase
        .from('timeslots')
        .update({ 
          current_bookings: selectedTimeslot.current_bookings + 1,
          status: selectedTimeslot.current_bookings + 1 >= selectedTimeslot.max_bookings ? 'booked' : 'available'
        })
        .eq('id', timeslotId);
      
      if (updateError) throw updateError;
      
      return appointment;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('available-timeslots');
        queryClient.invalidateQueries('appointments');
        enqueueSnackbar('Appointment booked successfully!', { variant: 'success' });
        handleCloseBookingDialog();
        setTabValue(1); // Switch to upcoming appointments
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to book appointment', {
          variant: 'error',
        });
      },
    }
  );

  // Cancel appointment mutation
  const cancelMutation = useMutation(
    async ({ id, reason }) => {
      // Get appointment details first to update timeslot and send notifications
      const { data: appointment, error: getError } = await supabase
        .from('appointments')
        .select(`
          *,
          timeslot:timeslots(*),
          doctor:users!doctor_id(id, first_name, last_name, email),
          pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name)
        `)
        .eq('id', id)
        .single();
      
      if (getError) throw getError;
      
      // Update appointment status and cancellation details
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          cancellation_reason: reason,
          cancelled_by_id: user.id,
          cancelled_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (updateError) throw updateError;
      
      // Update timeslot availability
      const newBookingCount = Math.max(0, appointment.timeslot.current_bookings - 1);
      const { error: timeslotError } = await supabase
        .from('timeslots')
        .update({
          current_bookings: newBookingCount,
          status: newBookingCount < appointment.timeslot.max_bookings ? 'available' : 'booked'
        })
        .eq('id', appointment.timeslot_id);
      
      if (timeslotError) throw timeslotError;
      
      // Create notification for the other party
      const otherParty = user.role === 'doctor' ? appointment.pharma_rep : appointment.doctor;
      const cancellerName = user.role === 'doctor' 
        ? `Dr. ${user.first_name} ${user.last_name}`
        : `${user.first_name} ${user.last_name}`;
      
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: otherParty.id,
          type: 'appointment-cancelled',
          title: 'Appointment Cancelled',
          message: `Your appointment on ${dayjs(appointment.timeslot.date).format('MMMM D, YYYY')} at ${appointment.timeslot.start_time} has been cancelled by ${cancellerName}.`,
          data: {
            appointment_id: appointment.id,
            cancelled_by: user.role,
            cancellation_reason: reason,
            appointment_date: appointment.timeslot.date,
            appointment_time: appointment.timeslot.start_time,
            link: '/appointments'
          },
          priority: 'medium'
        });
      
      if (notificationError) console.error('Failed to create notification:', notificationError);
      
      return appointment;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('appointments');
        queryClient.invalidateQueries('available-timeslots');
        // Also invalidate dashboard queries so they update immediately
        queryClient.invalidateQueries('dashboard-stats');
        queryClient.invalidateQueries(['today-appointments']);
        queryClient.invalidateQueries('upcoming-appointments');
        queryClient.invalidateQueries('notifications'); // Refresh notifications for real-time updates
        enqueueSnackbar('Appointment cancelled successfully', { variant: 'success' });
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to cancel appointment', {
          variant: 'error',
        });
      },
    }
  );

  // Confirm appointment mutation  
  const confirmMutation = useMutation(
    async (appointmentId) => {
      setProcessingAppointment(appointmentId);
      
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status: 'confirmed',
          confirmed_at: new Date().toISOString()
        })
        .eq('id', appointmentId);
      
      if (error) throw error;
      
      return appointmentId;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('appointments');
        // Also invalidate dashboard queries so they update immediately
        queryClient.invalidateQueries('dashboard-stats');
        queryClient.invalidateQueries(['today-appointments']);
        queryClient.invalidateQueries('upcoming-appointments');
        enqueueSnackbar('Appointment confirmed successfully!', { variant: 'success' });
        setProcessingAppointment(null);
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to confirm appointment', {
          variant: 'error',
        });
        setProcessingAppointment(null);
      },
    }
  );

  const handleOpenBookingDialog = (timeslot) => {
    setSelectedTimeslot(timeslot);
    setOpenBookingDialog(true);
  };

  const handleCloseBookingDialog = () => {
    setOpenBookingDialog(false);
    setSelectedTimeslot(null);
    setBookingForm({
      purpose: '',
      products: [],
      notes: '',
      meetingType: 'in-person',
    });
  };

  const handleBookAppointment = () => {
    if (!bookingForm.purpose) {
      enqueueSnackbar('Please provide a purpose for the appointment', { variant: 'error' });
      return;
    }

    bookMutation.mutate({
      timeslotId: selectedTimeslot.id,
      ...bookingForm,
    });
  };

  const handleOpenDetailsDialog = (appointment) => {
    setSelectedAppointment(appointment);
    setOpenDetailsDialog(true);
  };

  const handleCloseDetailsDialog = () => {
    setOpenDetailsDialog(false);
    setSelectedAppointment(null);
  };

  const handleCancelAppointment = (appointmentId) => {
    const reason = window.prompt('Please provide a reason for cancellation:');
    if (reason) {
      cancelMutation.mutate({ id: appointmentId, reason });
    }
  };

  const handleConfirmAppointment = (appointmentId) => {
    confirmMutation.mutate(appointmentId);
  };

  const getMeetingIcon = (type) => {
    switch (type) {
      case 'in-person':
        return <LocationIcon />;
      case 'virtual':
        return <VideoIcon />;
      case 'phone':
        return <PhoneIcon />;
      default:
        return <LocationIcon />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'info';
      case 'confirmed':
        return 'success';
      case 'completed':
        return 'default';
      case 'cancelled':
        return 'error';
      case 'no-show':
        return 'warning';
      default:
        return 'default';
    }
  };

  const timeslots = timeslotsData?.timeslots || [];
  const appointments = appointmentsData?.appointments || [];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {user?.role === 'pharma' ? 'Book & Manage Appointments' : 'Manage Appointments'}
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          {user?.role === 'pharma' && <Tab label="Book Appointment" />}
          <Tab label="Upcoming Appointments" />
          <Tab label="Past Appointments" />
        </Tabs>
      </Paper>

      {/* Book Appointment Tab (Pharma only) */}
      {tabValue === 0 && user?.role === 'pharma' && (
        <Box>
          {/* Current Date Range Display */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
            <Typography variant="h6" display="flex" alignItems="center" gap={1}>
              <CalendarIcon />
              Viewing appointments from {dateRange.startDate.format('MMM D, YYYY')} to {dateRange.endDate.format('MMM D, YYYY')}
              {dateRange.startDate.isSame(dateRange.endDate, 'day') && (
                <Chip label="Single Day" size="small" sx={{ bgcolor: 'primary.dark', color: 'primary.contrastText' }} />
              )}
            </Typography>
          </Paper>

          {/* Quick Date Filters */}
          <Box display="flex" gap={1} mb={2} flexWrap="wrap">
            <Button
              variant={dateRange.startDate.isSame(dayjs(), 'day') && dateRange.endDate.isSame(dayjs(), 'day') ? 'contained' : 'outlined'}
              onClick={() => setQuickDateFilter('today')}
              size="small"
            >
              Today
            </Button>
            <Button
              variant={dateRange.startDate.isSame(dayjs(), 'day') && dateRange.endDate.isSame(dayjs().add(7, 'day'), 'day') ? 'contained' : 'outlined'}
              onClick={() => setQuickDateFilter('week')}
              size="small"
            >
              This Week
            </Button>
            <Button
              variant={dateRange.startDate.isSame(dayjs(), 'day') && dateRange.endDate.isSame(dayjs().add(1, 'month'), 'day') ? 'contained' : 'outlined'}
              onClick={() => setQuickDateFilter('month')}
              size="small"
            >
              This Month
            </Button>
          </Box>

          {/* Date Range and Other Filters */}
          <Box display="flex" gap={2} mb={3} flexWrap="wrap">
            <DatePicker
              label="Start Date"
              value={dateRange.startDate}
              onChange={(newDate) => setDateRange({ ...dateRange, startDate: newDate })}
              minDate={dayjs()}
              renderInput={(params) => <TextField {...params} />}
            />
            <DatePicker
              label="End Date"
              value={dateRange.endDate}
              onChange={(newDate) => setDateRange({ ...dateRange, endDate: newDate })}
              minDate={dateRange.startDate}
              renderInput={(params) => <TextField {...params} />}
            />
            <TextField
              label="Filter by Specialization"
              value={filters.specialization}
              onChange={(e) => setFilters({ ...filters, specialization: e.target.value })}
              sx={{ minWidth: 200 }}
              placeholder="e.g. Cardiology, Dermatology"
            />
            <TextField
              label="Filter by Doctor Name"
              value={filters.doctorName}
              onChange={(e) => setFilters({ ...filters, doctorName: e.target.value })}
              sx={{ minWidth: 200 }}
              placeholder="e.g. John Smith"
            />
          </Box>

          {/* Results Summary */}
          {!loadingTimeslots && timeslots.length > 0 && (
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Found {timeslots.length} available timeslot{timeslots.length !== 1 ? 's' : ''} in your selected date range
              </Typography>
            </Box>
          )}

          <Grid container spacing={3}>
            {loadingTimeslots ? (
              <Grid item xs={12}>
                <Typography>Loading available timeslots...</Typography>
              </Grid>
            ) : timeslots.length === 0 ? (
              <Grid item xs={12}>
                <Alert severity="info">
                  No available timeslots found from {dateRange.startDate.format('MMM D, YYYY')} to {dateRange.endDate.format('MMM D, YYYY')}
                </Alert>
              </Grid>
            ) : (
              timeslots.map((slot) => (
                <Grid item xs={12} sm={6} md={4} key={slot.id}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">
                        {slot.doctor.title ? `${slot.doctor.title} ` : 'Dr. '}{slot.doctor.full_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {slot.doctor.specialization} {slot.doctor.clinic_name && `• ${slot.doctor.clinic_name}`}
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Box display="flex" alignItems="center" gap={1}>
                        <CalendarIcon fontSize="small" />
                        <Typography variant="body2">
                          {dayjs(slot.date).format('MMM D, YYYY')}
                        </Typography>
                      </Box>
                      <Typography variant="h6" sx={{ mt: 1 }}>
                        {slot.start_time} - {slot.end_time}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Available slots: {slot.max_bookings - slot.current_bookings}
                      </Typography>
                      <Button
                        variant="contained"
                        fullWidth
                        sx={{ mt: 2 }}
                        onClick={() => handleOpenBookingDialog(slot)}
                      >
                        Book Appointment
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))
            )}
          </Grid>
        </Box>
      )}

      {/* Upcoming Appointments Tab */}
      {((tabValue === 1 && user?.role === 'pharma') || (tabValue === 0 && user?.role === 'doctor')) && (
        <Box>
          {/* Date Range Controls for Doctors */}
          {user?.role === 'doctor' && (
            <>
              {/* Current Date Range Display */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                  <CalendarIcon />
                  Viewing appointments from {dateRange.startDate.format('MMM D, YYYY')} to {dateRange.endDate.format('MMM D, YYYY')}
                </Typography>
              </Paper>

              {/* Quick Date Filters */}
              <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                <Button
                  variant={dateRange.startDate.isSame(dayjs(), 'day') && dateRange.endDate.isSame(dayjs(), 'day') ? 'contained' : 'outlined'}
                  onClick={() => setQuickDateFilter('today')}
                  size="small"
                >
                  Today
                </Button>
                <Button
                  variant={dateRange.startDate.isSame(dayjs(), 'day') && dateRange.endDate.isSame(dayjs().add(7, 'day'), 'day') ? 'contained' : 'outlined'}
                  onClick={() => setQuickDateFilter('week')}
                  size="small"
                >
                  This Week
                </Button>
                <Button
                  variant={dateRange.startDate.isSame(dayjs(), 'day') && dateRange.endDate.isSame(dayjs().add(1, 'month'), 'day') ? 'contained' : 'outlined'}
                  onClick={() => setQuickDateFilter('month')}
                  size="small"
                >
                  This Month
                </Button>
              </Box>

              {/* Date Range Pickers */}
              <Box display="flex" gap={2} mb={3} flexWrap="wrap">
                <DatePicker
                  label="Start Date"
                  value={dateRange.startDate}
                  onChange={(newDate) => setDateRange({ ...dateRange, startDate: newDate })}
                  renderInput={(params) => <TextField {...params} />}
                />
                <DatePicker
                  label="End Date"
                  value={dateRange.endDate}
                  onChange={(newDate) => setDateRange({ ...dateRange, endDate: newDate })}
                  minDate={dateRange.startDate}
                  renderInput={(params) => <TextField {...params} />}
                />
              </Box>
            </>
          )}

          <List>
          {loadingAppointments ? (
            <ListItem>
              <ListItemText primary="Loading appointments..." />
            </ListItem>
          ) : appointments.filter(apt => ['scheduled', 'confirmed'].includes(apt.status)).length === 0 ? (
            <ListItem>
              <ListItemText primary="No upcoming appointments" />
            </ListItem>
          ) : (
            appointments
              .filter(apt => ['scheduled', 'confirmed'].includes(apt.status))
              .map((appointment) => (
                <Paper key={appointment.id} sx={{ mb: 2 }}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="h6">
                            {user?.role === 'pharma' 
                              ? `Dr. ${appointment.doctor.full_name}`
                              : `${appointment.pharma_rep.full_name} - ${appointment.pharma_rep.company_name}`
                            }
                          </Typography>
                          <Chip
                            label={appointment.status}
                            color={getStatusColor(appointment.status)}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {dayjs(appointment.timeslot.date).format('MMMM D, YYYY')} at {appointment.timeslot.start_time}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Purpose: {appointment.purpose}
                          </Typography>
                          <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                            {getMeetingIcon(appointment.meeting_type)}
                            <Typography variant="caption">
                              {appointment.meeting_type.charAt(0).toUpperCase() + appointment.meeting_type.slice(1)}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton onClick={() => handleOpenDetailsDialog(appointment)}>
                        <InfoIcon />
                      </IconButton>
                      {appointment.status === 'scheduled' && user?.role === 'doctor' && (
                        <IconButton
                          color="success"
                          onClick={() => handleConfirmAppointment(appointment.id)}
                          disabled={processingAppointment === appointment.id}
                          title="Confirm Appointment"
                        >
                          <ConfirmIcon />
                        </IconButton>
                      )}
                      {['scheduled', 'confirmed'].includes(appointment.status) && (
                        <IconButton
                          color="error"
                          onClick={() => handleCancelAppointment(appointment.id)}
                          title="Cancel Appointment"
                        >
                          <CancelIcon />
                        </IconButton>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                </Paper>
              ))
          )}
          </List>
        </Box>
      )}

      {/* Past Appointments Tab */}
      {((tabValue === 2 && user?.role === 'pharma') || (tabValue === 1 && user?.role === 'doctor')) && (
        <List>
          {loadingAppointments ? (
            <ListItem>
              <ListItemText primary="Loading appointments..." />
            </ListItem>
          ) : appointments.filter(apt => ['completed', 'cancelled'].includes(apt.status)).length === 0 ? (
            <ListItem>
              <ListItemText primary="No past appointments" />
            </ListItem>
          ) : (
            appointments
              .filter(apt => ['completed', 'cancelled'].includes(apt.status))
              .map((appointment) => (
                <Paper key={appointment.id} sx={{ mb: 2 }}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="h6">
                            {user?.role === 'pharma' 
                              ? `Dr. ${appointment.doctor.full_name}`
                              : `${appointment.pharma_rep.full_name}`
                            }
                          </Typography>
                          <Chip
                            label={appointment.status}
                            color={getStatusColor(appointment.status)}
                            size="small"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {dayjs(appointment.timeslot.date).format('MMMM D, YYYY')} at {appointment.timeslot.start_time}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Purpose: {appointment.purpose}
                          </Typography>
                          {appointment.feedback && (
                            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                              <Rating value={appointment.feedback.rating} readOnly size="small" />
                              <Typography variant="caption">
                                {appointment.feedback.comment}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton onClick={() => handleOpenDetailsDialog(appointment)}>
                        <InfoIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Paper>
              ))
          )}
        </List>
      )}

      {/* Booking Dialog */}
      <Dialog open={openBookingDialog} onClose={handleCloseBookingDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Book Appointment</DialogTitle>
        <DialogContent>
          {selectedTimeslot && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Doctor:</strong> {selectedTimeslot.doctor.title ? `${selectedTimeslot.doctor.title} ` : 'Dr. '}{selectedTimeslot.doctor.full_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Specialization:</strong> {selectedTimeslot.doctor.specialization}
              </Typography>
              {selectedTimeslot.doctor.clinic_name && (
                <Typography variant="body2" gutterBottom>
                  <strong>Clinic:</strong> {selectedTimeslot.doctor.clinic_name}
                </Typography>
              )}
              <Typography variant="body2" gutterBottom>
                <strong>Date & Time:</strong> {dayjs(selectedTimeslot.date).format('MMMM D, YYYY')} at {selectedTimeslot.start_time} - {selectedTimeslot.end_time}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Duration:</strong> {selectedTimeslot.duration || 30} minutes
              </Typography>
            </Box>
          )}
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Purpose of Visit"
              value={bookingForm.purpose}
              onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value })}
              required
              fullWidth
              helperText="Briefly describe the purpose of this appointment"
            />
            
            <FormControl fullWidth>
              <InputLabel>Meeting Type</InputLabel>
              <Select
                value={bookingForm.meetingType}
                label="Meeting Type"
                onChange={(e) => setBookingForm({ ...bookingForm, meetingType: e.target.value })}
              >
                <MenuItem value="in-person">In-Person</MenuItem>
                <MenuItem value="virtual">Virtual</MenuItem>
                <MenuItem value="phone">Phone</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Additional Notes"
              value={bookingForm.notes}
              onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
              multiline
              rows={3}
              fullWidth
              helperText="Any additional information for the doctor"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBookingDialog}>Cancel</Button>
          <Button 
            onClick={handleBookAppointment} 
            variant="contained" 
            disabled={bookMutation.isLoading || !bookingForm.purpose}
          >
            Book Appointment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Appointment Details Dialog */}
      <Dialog open={openDetailsDialog} onClose={handleCloseDetailsDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Appointment Details</DialogTitle>
        <DialogContent>
          {selectedAppointment && (
            <Box sx={{ pt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Status</Typography>
              <Chip
                label={selectedAppointment.status}
                color={getStatusColor(selectedAppointment.status)}
                sx={{ mb: 2 }}
              />
              
              <Typography variant="subtitle2" gutterBottom>Doctor</Typography>
              <Typography variant="body1" paragraph>
                Dr. {selectedAppointment.doctor.full_name}
                <br />
                {selectedAppointment.doctor.specialization} • {selectedAppointment.doctor.title}
              </Typography>
              
              {user?.role === 'doctor' && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Pharma Representative</Typography>
                  <Typography variant="body1" paragraph>
                    {selectedAppointment.pharma_rep.full_name}
                    <br />
                    {selectedAppointment.pharma_rep.company_name}
                  </Typography>
                </>
              )}
              
              <Typography variant="subtitle2" gutterBottom>Date & Time</Typography>
              <Typography variant="body1" paragraph>
                {dayjs(selectedAppointment.timeslot.date).format('MMMM D, YYYY')} at {selectedAppointment.timeslot.start_time}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Purpose</Typography>
              <Typography variant="body1" paragraph>
                {selectedAppointment.purpose}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Meeting Type</Typography>
              <Box display="flex" alignItems="center" gap={1} paragraph>
                {getMeetingIcon(selectedAppointment.meeting_type)}
                <Typography variant="body1">
                  {selectedAppointment.meeting_type.charAt(0).toUpperCase() + selectedAppointment.meeting_type.slice(1)}
                </Typography>
              </Box>
              
              {selectedAppointment.notes && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Notes</Typography>
                  <Typography variant="body1" paragraph>
                    {selectedAppointment.notes}
                  </Typography>
                </>
              )}
              
              {selectedAppointment.status === 'confirmed' && selectedAppointment.confirmed_at && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Confirmed</Typography>
                  <Typography variant="body1" paragraph color="success.main">
                    Confirmed on {dayjs(selectedAppointment.confirmed_at).format('MMMM D, YYYY [at] h:mm A')}
                  </Typography>
                </>
              )}
              
              {selectedAppointment.cancellation_reason && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Cancellation Information</Typography>
                  <Typography variant="body1" paragraph color="error">
                    <strong>Reason:</strong> {selectedAppointment.cancellation_reason}
                  </Typography>
                  {selectedAppointment.cancelled_at && (
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Cancelled on {dayjs(selectedAppointment.cancelled_at).format('MMMM D, YYYY [at] h:mm A')}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {/* Confirm button - only for doctors with scheduled appointments */}
          {selectedAppointment?.status === 'scheduled' && user?.role === 'doctor' && (
            <Button 
              onClick={() => {
                handleConfirmAppointment(selectedAppointment.id);
                handleCloseDetailsDialog();
              }}
              variant="contained"
              color="success"
              startIcon={<ConfirmIcon />}
              disabled={processingAppointment === selectedAppointment.id}
            >
              Confirm
            </Button>
          )}
          
          {/* Cancel button - for both doctors and pharma users with scheduled/confirmed appointments */}
          {['scheduled', 'confirmed'].includes(selectedAppointment?.status) && (
            <Button 
              onClick={() => {
                const reason = window.prompt('Please provide a reason for cancellation:');
                if (reason) {
                  cancelMutation.mutate({ id: selectedAppointment.id, reason });
                  handleCloseDetailsDialog();
                }
              }}
              variant="outlined"
              color="error"
              startIcon={<CancelIcon />}
              disabled={cancelMutation.isLoading}
            >
              Cancel Appointment
            </Button>
          )}
          
          <Button onClick={handleCloseDetailsDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Appointments; 