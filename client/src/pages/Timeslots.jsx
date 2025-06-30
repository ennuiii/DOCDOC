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
  Fab,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  EventRepeat as RecurringIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSnackbar } from 'notistack';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

const Timeslots = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [openDialog, setOpenDialog] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [formData, setFormData] = useState({
    date: dayjs(),
    startTime: dayjs().hour(9).minute(0),
    endTime: dayjs().hour(9).minute(30),
    type: 'pharma',
    maxBookings: 1,
    notes: '',
    recurringRule: {
      type: 'none',
      endDate: null,
      daysOfWeek: [],
      dayOfMonth: null,
    },
  });

  // Fetch timeslots
  const { data: timeslotsData, isLoading } = useQuery(
    ['timeslots', selectedDate.format('YYYY-MM-DD')],
    async () => {
      const response = await api.get('/timeslots', {
        params: {
          date: selectedDate.format('YYYY-MM-DD'),
        },
      });
      return response.data;
    }
  );

  // Create timeslot mutation
  const createMutation = useMutation(
    async (data) => {
      const response = await api.post('/timeslots', data);
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('timeslots');
        enqueueSnackbar(
          data.recurringCreated > 0
            ? `Timeslot created successfully! (${data.recurringCreated} recurring slots also created)`
            : 'Timeslot created successfully!',
          { variant: 'success' }
        );
        handleCloseDialog();
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.error || 'Failed to create timeslot', {
          variant: 'error',
        });
      },
    }
  );

  // Update timeslot mutation
  const updateMutation = useMutation(
    async ({ id, data }) => {
      const response = await api.put(`/timeslots/${id}`, data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('timeslots');
        enqueueSnackbar('Timeslot updated successfully!', { variant: 'success' });
        handleCloseDialog();
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.error || 'Failed to update timeslot', {
          variant: 'error',
        });
      },
    }
  );

  // Delete timeslot mutation
  const deleteMutation = useMutation(
    async (id) => {
      await api.delete(`/timeslots/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('timeslots');
        enqueueSnackbar('Timeslot deleted successfully!', { variant: 'success' });
      },
      onError: (error) => {
        enqueueSnackbar(error.response?.data?.error || 'Failed to delete timeslot', {
          variant: 'error',
        });
      },
    }
  );

  const handleOpenDialog = (slot = null) => {
    if (slot) {
      setEditingSlot(slot);
      setFormData({
        date: dayjs(slot.date),
        startTime: dayjs(`2000-01-01 ${slot.startTime}`),
        endTime: dayjs(`2000-01-01 ${slot.endTime}`),
        type: slot.type,
        maxBookings: slot.maxBookings,
        notes: slot.notes || '',
        recurringRule: slot.recurringRule || { type: 'none' },
      });
    } else {
      setEditingSlot(null);
      setFormData({
        date: selectedDate,
        startTime: dayjs().hour(9).minute(0),
        endTime: dayjs().hour(9).minute(30),
        type: 'pharma',
        maxBookings: 1,
        notes: '',
        recurringRule: {
          type: 'none',
          endDate: null,
          daysOfWeek: [],
          dayOfMonth: null,
        },
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingSlot(null);
  };

  const handleSubmit = () => {
    const data = {
      date: formData.date.format('YYYY-MM-DD'),
      startTime: formData.startTime.format('HH:mm'),
      endTime: formData.endTime.format('HH:mm'),
      type: formData.type,
      maxBookings: formData.maxBookings,
      notes: formData.notes,
    };

    if (formData.recurringRule.type !== 'none') {
      data.recurringRule = {
        ...formData.recurringRule,
        endDate: formData.recurringRule.endDate?.format('YYYY-MM-DD'),
      };
    }

    if (editingSlot) {
      updateMutation.mutate({ id: editingSlot._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this timeslot?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'success';
      case 'booked':
        return 'error';
      case 'blocked':
        return 'warning';
      case 'cancelled':
        return 'default';
      default:
        return 'default';
    }
  };

  const timeslots = timeslotsData?.timeslots || [];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Manage Timeslots</Typography>
        <DatePicker
          label="Select Date"
          value={selectedDate}
          onChange={setSelectedDate}
          renderInput={(params) => <TextField {...params} />}
        />
      </Box>

      {user?.role === 'doctor' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Create and manage your available timeslots for pharmaceutical companies to book appointments.
        </Alert>
      )}

      <Grid container spacing={3}>
        {isLoading ? (
          <Grid item xs={12}>
            <Typography>Loading timeslots...</Typography>
          </Grid>
        ) : timeslots.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" align="center">
                  No timeslots available for {selectedDate.format('MMMM D, YYYY')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          timeslots.map((slot) => (
            <Grid item xs={12} sm={6} md={4} key={slot._id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6">
                        {slot.startTime} - {slot.endTime}
                      </Typography>
                      <Chip
                        label={slot.status}
                        color={getStatusColor(slot.status)}
                        size="small"
                        sx={{ mt: 1, mb: 1 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        Type: {slot.type}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Max Bookings: {slot.maxBookings}
                      </Typography>
                      {slot.notes && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {slot.notes}
                        </Typography>
                      )}
                      {slot.isRecurringInstance && (
                        <Tooltip title="This is a recurring timeslot">
                          <RecurringIcon fontSize="small" sx={{ mt: 1 }} />
                        </Tooltip>
                      )}
                    </Box>
                    {slot.status === 'available' && (
                      <Box>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(slot)}
                          disabled={slot.status === 'booked'}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(slot._id)}
                          disabled={slot.status === 'booked'}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      {user?.role === 'doctor' && (
        <Fab
          color="primary"
          aria-label="add"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={() => handleOpenDialog()}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSlot ? 'Edit Timeslot' : 'Create New Timeslot'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <DatePicker
              label="Date"
              value={formData.date}
              onChange={(newValue) => setFormData({ ...formData, date: newValue })}
              disabled={editingSlot !== null}
              renderInput={(params) => <TextField {...params} fullWidth />}
            />
            
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TimePicker
                label="Start Time"
                value={formData.startTime}
                onChange={(newValue) => setFormData({ ...formData, startTime: newValue })}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
              <TimePicker
                label="End Time"
                value={formData.endTime}
                onChange={(newValue) => setFormData({ ...formData, endTime: newValue })}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </Box>

            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formData.type}
                label="Type"
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <MenuItem value="pharma">Pharma</MenuItem>
                <MenuItem value="patient">Patient</MenuItem>
                <MenuItem value="general">General</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Max Bookings"
              type="number"
              value={formData.maxBookings}
              onChange={(e) => setFormData({ ...formData, maxBookings: parseInt(e.target.value) || 1 })}
              inputProps={{ min: 1, max: 10 }}
              fullWidth
            />

            <TextField
              label="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />

            {!editingSlot && (
              <>
                <FormControl fullWidth>
                  <InputLabel>Recurring</InputLabel>
                  <Select
                    value={formData.recurringRule.type}
                    label="Recurring"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        recurringRule: { ...formData.recurringRule, type: e.target.value },
                      })
                    }
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>

                {formData.recurringRule.type !== 'none' && (
                  <DatePicker
                    label="Repeat Until"
                    value={formData.recurringRule.endDate}
                    onChange={(newValue) =>
                      setFormData({
                        ...formData,
                        recurringRule: { ...formData.recurringRule, endDate: newValue },
                      })
                    }
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={createMutation.isLoading || updateMutation.isLoading}>
            {editingSlot ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Timeslots; 