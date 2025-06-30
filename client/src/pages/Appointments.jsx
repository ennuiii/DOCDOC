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
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const Appointments = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  const [tabValue, setTabValue] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dayjs());
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

  // Fetch available timeslots for pharma users
  const { data: availableTimeslots, isLoading: loadingTimeslots } = useQuery(
    ['available-timeslots', selectedDate.format('YYYY-MM-DD'), filters],
    async () => {
      if (user?.role !== 'pharma') return { timeslots: [] };
      
      const response = await api.get('/appointments/available-timeslots', {
        params: {
          date: selectedDate.format('YYYY-MM-DD'),
          specialization: filters.specialization || undefined,
        },
      });
      return response.data;
    },
    {
      enabled: tabValue === 0 && user?.role === 'pharma',
    }
  );

  // Fetch user's appointments
  const { data: appointmentsData, isLoading: loadingAppointments } = useQuery(
    ['appointments', tabValue],
    async () => {
      const status = tabValue === 1 ? 'scheduled,confirmed' : 'completed,cancelled';
      const response = await api.get('/appointments', {
        params: { status },
      });
      return response.data;
    }
  );

  // Book appointment mutation
  const bookMutation = useMutation(
    async (data) => {
      const response = await api.post('/appointments', data);
      return response.data;
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
        enqueueSnackbar(error.response?.data?.error || 'Failed to book appointment', {
          variant: 'error',
        });
      },
    }
  );

  // Cancel appointment mutation
  const cancelMutation = useMutation(
    async ({ id, reason }) => {
      await api.delete(`/appointments/${id}`, { data: { reason } });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('appointments');
        enqueueSnackbar('Appointment cancelled successfully', { variant: 'success' });
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.error || 'Failed to cancel appointment', {
          variant: 'error',
        });
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
      timeslotId: selectedTimeslot._id,
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

  const timeslots = availableTimeslots?.timeslots || [];
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
          <Box display="flex" gap={2} mb={3}>
            <DatePicker
              label="Select Date"
              value={selectedDate}
              onChange={setSelectedDate}
              minDate={dayjs()}
              renderInput={(params) => <TextField {...params} />}
            />
            <TextField
              label="Filter by Specialization"
              value={filters.specialization}
              onChange={(e) => setFilters({ ...filters, specialization: e.target.value })}
              sx={{ minWidth: 200 }}
            />
          </Box>

          <Grid container spacing={3}>
            {loadingTimeslots ? (
              <Grid item xs={12}>
                <Typography>Loading available timeslots...</Typography>
              </Grid>
            ) : timeslots.length === 0 ? (
              <Grid item xs={12}>
                <Alert severity="info">
                  No available timeslots found for {selectedDate.format('MMMM D, YYYY')}
                </Alert>
              </Grid>
            ) : (
              timeslots.map((slot) => (
                <Grid item xs={12} sm={6} md={4} key={slot._id}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">
                        Dr. {slot.doctor.profile.firstName} {slot.doctor.profile.lastName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {slot.doctor.profile.specialization} • {slot.doctor.profile.clinicName}
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Box display="flex" alignItems="center" gap={1}>
                        <CalendarIcon fontSize="small" />
                        <Typography variant="body2">
                          {dayjs(slot.date).format('MMM D, YYYY')}
                        </Typography>
                      </Box>
                      <Typography variant="h6" sx={{ mt: 1 }}>
                        {slot.startTime} - {slot.endTime}
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
      {((tabValue === 1 && user?.role === 'pharma') || (tabValue === 0 && user?.role !== 'pharma')) && (
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
                <Paper key={appointment._id} sx={{ mb: 2 }}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="h6">
                            {user?.role === 'pharma' 
                              ? `Dr. ${appointment.doctor.profile.firstName} ${appointment.doctor.profile.lastName}`
                              : `${appointment.pharmaRep.profile.firstName} ${appointment.pharmaRep.profile.lastName} - ${appointment.pharmaRep.profile.companyName}`
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
                            {dayjs(appointment.timeslot.date).format('MMMM D, YYYY')} at {appointment.timeslot.startTime}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Purpose: {appointment.purpose}
                          </Typography>
                          <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                            {getMeetingIcon(appointment.meetingType)}
                            <Typography variant="caption">
                              {appointment.meetingType.charAt(0).toUpperCase() + appointment.meetingType.slice(1)}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton onClick={() => handleOpenDetailsDialog(appointment)}>
                        <InfoIcon />
                      </IconButton>
                      {appointment.status === 'scheduled' && (
                        <IconButton
                          color="error"
                          onClick={() => handleCancelAppointment(appointment._id)}
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
      )}

      {/* Past Appointments Tab */}
      {((tabValue === 2 && user?.role === 'pharma') || (tabValue === 1 && user?.role !== 'pharma')) && (
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
                <Paper key={appointment._id} sx={{ mb: 2 }}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="h6">
                            {user?.role === 'pharma' 
                              ? `Dr. ${appointment.doctor.profile.firstName} ${appointment.doctor.profile.lastName}`
                              : `${appointment.pharmaRep.profile.firstName} ${appointment.pharmaRep.profile.lastName}`
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
                            {dayjs(appointment.timeslot.date).format('MMMM D, YYYY')} at {appointment.timeslot.startTime}
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
                <strong>Doctor:</strong> Dr. {selectedTimeslot.doctor.profile.firstName} {selectedTimeslot.doctor.profile.lastName}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Specialization:</strong> {selectedTimeslot.doctor.profile.specialization}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Date & Time:</strong> {dayjs(selectedTimeslot.date).format('MMMM D, YYYY')} at {selectedTimeslot.startTime} - {selectedTimeslot.endTime}
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
                Dr. {selectedAppointment.doctor.profile.firstName} {selectedAppointment.doctor.profile.lastName}
                <br />
                {selectedAppointment.doctor.profile.specialization} • {selectedAppointment.doctor.profile.clinicName}
              </Typography>
              
              {user?.role === 'doctor' && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Pharma Representative</Typography>
                  <Typography variant="body1" paragraph>
                    {selectedAppointment.pharmaRep.profile.firstName} {selectedAppointment.pharmaRep.profile.lastName}
                    <br />
                    {selectedAppointment.pharmaRep.profile.companyName}
                  </Typography>
                </>
              )}
              
              <Typography variant="subtitle2" gutterBottom>Date & Time</Typography>
              <Typography variant="body1" paragraph>
                {dayjs(selectedAppointment.timeslot.date).format('MMMM D, YYYY')} at {selectedAppointment.timeslot.startTime}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Purpose</Typography>
              <Typography variant="body1" paragraph>
                {selectedAppointment.purpose}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Meeting Type</Typography>
              <Box display="flex" alignItems="center" gap={1} paragraph>
                {getMeetingIcon(selectedAppointment.meetingType)}
                <Typography variant="body1">
                  {selectedAppointment.meetingType.charAt(0).toUpperCase() + selectedAppointment.meetingType.slice(1)}
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
              
              {selectedAppointment.cancellationReason && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Cancellation Reason</Typography>
                  <Typography variant="body1" paragraph color="error">
                    {selectedAppointment.cancellationReason}
                  </Typography>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetailsDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Appointments; 