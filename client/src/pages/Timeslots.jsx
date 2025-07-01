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
  Today as TodayIcon,
  DateRange as DateRangeIcon,
  CalendarViewMonth as MonthIcon,
} from '@mui/icons-material';
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSnackbar } from 'notistack';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const Timeslots = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  
  const [dateRange, setDateRange] = useState({
    startDate: dayjs(),
    endDate: dayjs()
  });
  const [activeQuickFilter, setActiveQuickFilter] = useState('today');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);

  // Quick filter functions
  const setQuickDateFilter = (filter) => {
    const today = dayjs();
    let startDate, endDate;

    switch (filter) {
      case 'today':
        startDate = today;
        endDate = today;
        break;
      case 'week':
        startDate = today.startOf('week');
        endDate = today.endOf('week');
        break;
      case 'month':
        startDate = today.startOf('month');
        endDate = today.endOf('month');
        break;
      default:
        startDate = today;
        endDate = today;
    }

    setDateRange({ startDate, endDate });
    setActiveQuickFilter(filter);
  };

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

  // Set up real-time timeslot updates
  useEffect(() => {
    const handleTimeslotUpdate = (event) => {
      const { eventType, timeslot } = event.detail;
      
      console.log('Real-time timeslot update:', eventType, timeslot);
      
      // Invalidate and refetch timeslots to reflect real-time changes
      queryClient.invalidateQueries('timeslots');
      
      // Show toast notification for significant changes
      const timeslotDate = dayjs(timeslot.date);
      const isInRange = timeslotDate.isAfter(dateRange.startDate.subtract(1, 'day')) && 
                        timeslotDate.isBefore(dateRange.endDate.add(1, 'day'));
      
      if (eventType === 'UPDATE' && isInRange) {
        enqueueSnackbar(`Timeslot updated: ${timeslot.start_time} - ${timeslot.end_time}`, { 
          variant: 'info' 
        });
      } else if (eventType === 'INSERT' && isInRange) {
        enqueueSnackbar(`New timeslot available: ${timeslot.start_time} - ${timeslot.end_time}`, { 
          variant: 'success' 
        });
      } else if (eventType === 'DELETE' && isInRange) {
        enqueueSnackbar(`Timeslot removed: ${timeslot.start_time} - ${timeslot.end_time}`, { 
          variant: 'warning' 
        });
      }
    };

    // Listen for real-time timeslot updates
    window.addEventListener('timeslotUpdate', handleTimeslotUpdate);

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('timeslotUpdate', handleTimeslotUpdate);
    };
  }, [queryClient, enqueueSnackbar, dateRange]);

  // Fetch timeslots using Supabase
  const { data: timeslotsData, isLoading } = useQuery(
    ['timeslots', dateRange.startDate.format('YYYY-MM-DD'), dateRange.endDate.format('YYYY-MM-DD')],
    async () => {
      let query = supabase
        .from('timeslots')
        .select(`
          *,
          doctor:users!timeslots_doctor_id_fkey(
            id,
            email,
            first_name,
            last_name,
            clinic_name
          )
        `)
        .gte('date', dateRange.startDate.format('YYYY-MM-DD'))
        .lte('date', dateRange.endDate.format('YYYY-MM-DD'))
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      // Apply role-based filtering
      if (user?.role === 'doctor') {
        query = query.eq('doctor_id', user.id);
      } else if (user?.role === 'staff' && user.profile?.assignedDoctorId) {
        query = query.eq('doctor_id', user.profile.assignedDoctorId);
      } else if (user?.role === 'pharma') {
        // Pharma can see available timeslots only
        query = query.eq('status', 'available');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching timeslots:', error);
        throw new Error(error.message);
      }

      // Map PostgreSQL fields to match expected structure
      const mappedTimeslots = (data || []).map(slot => ({
        ...slot,
        _id: slot.id, // For compatibility with existing code
        startTime: slot.start_time,
        endTime: slot.end_time,
        maxBookings: slot.max_bookings,
        currentBookings: slot.current_bookings,
        isRecurringInstance: slot.is_recurring_instance,
        parentTimeslotId: slot.parent_timeslot_id,
        recurringRule: {
          type: slot.recurring_type || 'none',
          endDate: slot.recurring_end_date,
          daysOfWeek: slot.recurring_days_of_week || [],
          dayOfMonth: slot.recurring_day_of_month
        }
      }));

      return { timeslots: mappedTimeslots };
    }
  );

  // Create timeslot mutation using Supabase
  const createMutation = useMutation(
    async (data) => {
      // Only doctors can create timeslots
      if (user?.role !== 'doctor') {
        throw new Error('Only doctors can create timeslots');
      }

      // Prepare data for PostgreSQL schema
      const timeslotData = {
        doctor_id: user.id,
        date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        type: data.type || 'pharma',
        max_bookings: data.maxBookings || 1,
        notes: data.notes || null,
        recurring_type: data.recurringRule?.type || 'none',
        recurring_end_date: data.recurringRule?.endDate || null,
        recurring_days_of_week: data.recurringRule?.daysOfWeek || null,
        recurring_day_of_month: data.recurringRule?.dayOfMonth || null
      };

      // Check for overlapping timeslots
      const { data: existingSlots, error: checkError } = await supabase
        .from('timeslots')
        .select('id')
        .eq('doctor_id', user.id)
        .eq('date', data.date)
        .or(`start_time.lte.${data.endTime},end_time.gte.${data.startTime}`);

      if (checkError) {
        throw new Error(checkError.message);
      }

      if (existingSlots && existingSlots.length > 0) {
        throw new Error('Timeslot overlaps with existing timeslot');
      }

      // Insert the main timeslot
      const { data: newTimeslot, error } = await supabase
        .from('timeslots')
        .insert([timeslotData])
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // Handle recurring timeslots
      let recurringCreated = 0;
      if (data.recurringRule?.type !== 'none' && data.recurringRule?.endDate) {
        const startDate = dayjs(data.date);
        const endDate = dayjs(data.recurringRule.endDate);
        const recurringSlots = [];
        
        // Update the main timeslot as recurring instance
        await supabase
          .from('timeslots')
          .update({ 
            is_recurring_instance: true
          })
          .eq('id', newTimeslot.id);

        let currentDate = startDate.add(1, 'day'); // Start from next day
        
        while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
          let shouldCreate = false;
          
          switch (data.recurringRule.type) {
            case 'daily':
              shouldCreate = true;
              break;
            case 'weekly':
              shouldCreate = currentDate.day() === startDate.day();
              break;
            case 'monthly':
              shouldCreate = currentDate.date() === startDate.date();
              break;
          }
          
          if (shouldCreate) {
            // Check for conflicts on this date
            const { data: conflicts } = await supabase
              .from('timeslots')
              .select('id')
              .eq('doctor_id', user.id)
              .eq('date', currentDate.format('YYYY-MM-DD'))
              .or(`start_time.lte.${data.endTime},end_time.gte.${data.startTime}`);
            
            if (!conflicts || conflicts.length === 0) {
              recurringSlots.push({
                doctor_id: user.id,
                date: currentDate.format('YYYY-MM-DD'),
                start_time: data.startTime,
                end_time: data.endTime,
                type: data.type,
                max_bookings: data.maxBookings,
                notes: data.notes,
                recurring_type: data.recurringRule.type,
                recurring_end_date: data.recurringRule.endDate,
                parent_timeslot_id: newTimeslot.id,
                is_recurring_instance: true,
                status: 'available'
              });
            }
          }
          
          // Move to next day
          currentDate = currentDate.add(1, 'day');
        }
        
        // Batch insert all recurring timeslots
        if (recurringSlots.length > 0) {
          const { error: batchError } = await supabase
            .from('timeslots')
            .insert(recurringSlots);
          
          if (batchError) {
            console.error('Error creating recurring timeslots:', batchError);
            // Don't throw error, just log it
          } else {
            recurringCreated = recurringSlots.length;
          }
        }
      }

      return {
        message: 'Timeslot created successfully',
        timeslot: newTimeslot,
        recurringCreated
      };
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
        enqueueSnackbar(error.message || 'Failed to create timeslot', {
          variant: 'error',
        });
      },
    }
  );

  // Update timeslot mutation using Supabase
  const updateMutation = useMutation(
    async ({ id, data }) => {
      // Prepare data for PostgreSQL schema
      const updateData = {
        date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        type: data.type,
        max_bookings: data.maxBookings,
        notes: data.notes || null,
        updated_at: new Date().toISOString()
      };

      const { data: updatedTimeslot, error } = await supabase
        .from('timeslots')
        .update(updateData)
        .eq('id', id)
        .eq('doctor_id', user.id) // Ensure user can only update their own timeslots
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return updatedTimeslot;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('timeslots');
        enqueueSnackbar('Timeslot updated successfully!', { variant: 'success', autoHideDuration: 2000 });
        handleCloseDialog();
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to update timeslot', {
          variant: 'error',
        });
      },
    }
  );

  // Delete timeslot mutation using Supabase
  const deleteMutation = useMutation(
    async (id) => {
      const { error } = await supabase
        .from('timeslots')
        .delete()
        .eq('id', id)
        .eq('doctor_id', user.id); // Ensure user can only delete their own timeslots

      if (error) {
        throw new Error(error.message);
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('timeslots');
        enqueueSnackbar('Timeslot deleted successfully!', { variant: 'success', autoHideDuration: 2000 });
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to delete timeslot', {
          variant: 'error',
        });
      },
    }
  );

  // Delete entire recurring series mutation
  const deleteSeriesMutation = useMutation(
    async (parentTimeslotId) => {
      // Delete all child timeslots in the series
      const { error: childError } = await supabase
        .from('timeslots')
        .delete()
        .eq('parent_timeslot_id', parentTimeslotId)
        .eq('doctor_id', user.id);

      if (childError) {
        throw new Error(childError.message);
      }

      // Delete the parent timeslot
      const { error: parentError } = await supabase
        .from('timeslots')
        .delete()
        .eq('id', parentTimeslotId)
        .eq('doctor_id', user.id);

      if (parentError) {
        throw new Error(parentError.message);
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('timeslots');
        enqueueSnackbar('Recurring series deleted successfully!', { variant: 'success', autoHideDuration: 2000 });
      },
      onError: (error) => {
        enqueueSnackbar(error.message || 'Failed to delete recurring series', {
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
        date: dateRange.startDate,
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

  const handleDelete = (slot) => {
    if (slot.isRecurringInstance) {
      const parentId = slot.parentTimeslotId || slot._id; // Use parent ID or current ID if it's the parent
      const choice = window.confirm(
        'This is part of a recurring series. Would you like to:\n\n' +
        'OK - Delete just this single timeslot\n' +
        'Cancel - Delete the entire recurring series\n\n' +
        'Choose OK to delete only this instance.'
      );
      
      if (choice) {
        // Delete single instance
        if (window.confirm('Delete just this single timeslot?')) {
          deleteMutation.mutate(slot._id);
        }
      } else {
        // Delete entire series
        if (window.confirm('Delete the entire recurring series? This will remove all related timeslots.')) {
          deleteSeriesMutation.mutate(parentId);
        }
      }
    } else {
      // Regular single timeslot deletion
      if (window.confirm('Are you sure you want to delete this timeslot?')) {
        deleteMutation.mutate(slot._id);
      }
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
        <Box display="flex" alignItems="center" gap={2}>
          {/* Quick Filter Buttons */}
          <Button
            variant={activeQuickFilter === 'today' ? 'contained' : 'outlined'}
            size="small"
            startIcon={<TodayIcon />}
            onClick={() => setQuickDateFilter('today')}
          >
            Today
          </Button>
          <Button
            variant={activeQuickFilter === 'week' ? 'contained' : 'outlined'}
            size="small"
            startIcon={<DateRangeIcon />}
            onClick={() => setQuickDateFilter('week')}
          >
            This Week
          </Button>
          <Button
            variant={activeQuickFilter === 'month' ? 'contained' : 'outlined'}
            size="small"
            startIcon={<MonthIcon />}
            onClick={() => setQuickDateFilter('month')}
          >
            This Month
          </Button>
        </Box>
      </Box>

      {/* Date Range Selection */}
      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <DatePicker
          label="Start Date"
          value={dateRange.startDate}
          onChange={(newValue) => {
            setDateRange(prev => ({ ...prev, startDate: newValue }));
            setActiveQuickFilter(null);
          }}
          renderInput={(params) => <TextField {...params} size="small" />}
        />
        <Typography variant="body2" color="text.secondary">to</Typography>
        <DatePicker
          label="End Date"
          value={dateRange.endDate}
          onChange={(newValue) => {
            setDateRange(prev => ({ ...prev, endDate: newValue }));
            setActiveQuickFilter(null);
          }}
          renderInput={(params) => <TextField {...params} size="small" />}
        />
      </Box>

      {/* Current Date Range Banner */}
      <Alert 
        severity="info" 
        sx={{ mb: 2 }}
        icon={<CalendarIcon />}
      >
        <Typography variant="body2">
          <strong>Showing timeslots:</strong> {dateRange.startDate.format('MMM D, YYYY')} 
          {!dateRange.startDate.isSame(dateRange.endDate, 'day') && 
            ` - ${dateRange.endDate.format('MMM D, YYYY')}`
          }
          {timeslotsData?.timeslots && (
            <Typography component="span" sx={{ ml: 2, color: 'text.secondary' }}>
              ({timeslotsData.timeslots.length} timeslot{timeslotsData.timeslots.length !== 1 ? 's' : ''} found)
            </Typography>
          )}
        </Typography>
      </Alert>

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
                  No timeslots available for {dateRange.startDate.format('MMM D, YYYY')}
                  {!dateRange.startDate.isSame(dateRange.endDate, 'day') && 
                    ` - ${dateRange.endDate.format('MMM D, YYYY')}`
                  }
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
                      {!dateRange.startDate.isSame(dateRange.endDate, 'day') && (
                        <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 'bold' }}>
                          {dayjs(slot.date).format('MMM D, YYYY')}
                        </Typography>
                      )}
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
                        <Box display="flex" alignItems="center" gap={1} sx={{ mt: 1 }}>
                          <Tooltip title={`Recurring ${slot.recurringRule?.type || 'series'} until ${dayjs(slot.recurringRule?.endDate).format('MMM D, YYYY')}`}>
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <RecurringIcon fontSize="small" color="primary" />
                              <Typography variant="caption" color="primary">
                                {slot.recurringRule?.type}
                              </Typography>
                            </Box>
                          </Tooltip>
                        </Box>
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
                          onClick={() => handleDelete(slot)}
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
          onClick={(e) => {
            e.currentTarget.blur(); // Remove focus from FAB to prevent aria-hidden conflict
            handleOpenDialog();
          }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Create/Edit Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog} 
        maxWidth="sm" 
        fullWidth
        disableEnforceFocus
      >
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