import { supabaseAdmin } from '../config/supabase.js';
import NotificationService from '../services/notificationService.js';

// Get all timeslots with filters
export const getTimeslots = async (req, res) => {
  try {
    const { 
      doctorId, 
      date, 
      startDate, 
      endDate, 
      status, 
      type,
      page = 1,
      limit = 50
    } = req.query;
    
    const supabase = supabaseAdmin();
    
    // Build query
    let query = supabase
      .from('timeslots')
      .select(`
        *,
        doctor:users!doctor_id(
          id,
          first_name,
          last_name,
          email,
          specialization,
          clinic_name,
          title
        ),
        appointments(
          id,
          status,
          pharma_rep_id,
          purpose
        )
      `);
    
    // Apply role-based filters
    if (doctorId && (req.user.role === 'admin' || req.user.role === 'pharma')) {
      query = query.eq('doctor_id', doctorId);
    } else if (req.user.role === 'doctor') {
      // Doctors can only see their own timeslots
      query = query.eq('doctor_id', req.user.id);
    } else if (req.user.role === 'staff') {
      // Staff can see their assigned doctor's timeslots
      if (req.user.profile?.assignedDoctorId) {
        query = query.eq('doctor_id', req.user.profile.assignedDoctorId);
      }
    }
    
    // Date filters
    if (date) {
      query = query.eq('date', date);
    } else if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    } else if (startDate) {
      query = query.gte('date', startDate);
    } else if (endDate) {
      query = query.lte('date', endDate);
    } else {
      // Default to future dates only for non-doctors
      if (req.user.role !== 'doctor') {
        query = query.gte('date', new Date().toISOString().split('T')[0]);
      }
    }
    
    // Status filter
    if (status) {
      if (status.includes(',')) {
        query = query.in('status', status.split(','));
      } else {
        query = query.eq('status', status);
      }
    }
    
    // Type filter
    if (type) {
      query = query.eq('type', type);
    }
    
    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    // Execute query
    const { data: timeslots, error, count } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(from, to);
    
    if (error) {
      console.error('Get timeslots error:', error);
      throw error;
    }
    
    res.json({
      timeslots: timeslots || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Get timeslots error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch timeslots',
      details: error.message 
    });
  }
};

// Get single timeslot
export const getTimeslot = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = supabaseAdmin();
    
    const { data: timeslot, error } = await supabase
      .from('timeslots')
      .select(`
        *,
        doctor:users!doctor_id(
          id,
          first_name,
          last_name,
          email,
          specialization,
          clinic_name,
          title
        ),
        appointments(
          id,
          status,
          pharma_rep_id,
          purpose,
          pharma_rep:users!pharma_rep_id(
            id,
            first_name,
            last_name,
            email,
            company_name
          )
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Timeslot not found' });
      }
      throw error;
    }
    
    // Check access permissions
    if (req.user.role === 'doctor' && timeslot.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ timeslot });
  } catch (error) {
    console.error('Get timeslot error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch timeslot',
      details: error.message 
    });
  }
};

// Create timeslot
export const createTimeslot = async (req, res) => {
  try {
    const {
      date,
      startTime,
      endTime,
      type,
      maxBookings,
      notes,
      duration,
      recurringRule
    } = req.body;
    
    // Only doctors can create timeslots
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Only doctors can create timeslots' });
    }
    
    // Validate date is not in the past
    const slotDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    slotDate.setHours(0, 0, 0, 0);
    
    if (slotDate < today) {
      return res.status(400).json({ error: 'Cannot create timeslots in the past' });
    }
    
    const supabase = supabaseAdmin();
    
    // Check for overlapping timeslots
    const { data: overlappingSlots, error: overlapError } = await supabase
      .from('timeslots')
      .select('id')
      .eq('doctor_id', req.user.id)
      .eq('date', date)
      .or(`and(start_time.lte.${startTime},end_time.gt.${startTime}),and(start_time.lt.${endTime},end_time.gte.${endTime}),and(start_time.gte.${startTime},end_time.lte.${endTime})`);
    
    if (overlapError) {
      throw overlapError;
    }
    
    if (overlappingSlots && overlappingSlots.length > 0) {
      return res.status(400).json({ 
        error: 'Timeslot overlaps with existing timeslot' 
      });
    }
    
    // Create timeslot
    const { data: timeslot, error: createError } = await supabase
      .from('timeslots')
      .insert({
        doctor_id: req.user.id,
        date,
        start_time: startTime,
        end_time: endTime,
        duration: duration || 30,
        type: type || 'pharma',
        max_bookings: maxBookings || 1,
        current_bookings: 0,
        status: 'available',
        notes,
        recurring_rule: recurringRule || { type: 'none' }
      })
      .select(`
        *,
        doctor:users!doctor_id(
          id,
          first_name,
          last_name,
          email,
          specialization,
          clinic_name
        )
      `)
      .single();
    
    if (createError) {
      throw createError;
    }
    
    // Handle recurring timeslots
    let recurringCreated = 0;
    if (recurringRule && recurringRule.type !== 'none' && recurringRule.endDate) {
      const recurringSlots = await generateRecurringTimeslots(
        req.user.id,
        date,
        startTime,
        endTime,
        duration,
        type,
        maxBookings,
        notes,
        recurringRule
      );
      
      if (recurringSlots.length > 0) {
        const { error: recurringError } = await supabase
          .from('timeslots')
          .insert(recurringSlots);
        
        if (!recurringError) {
          recurringCreated = recurringSlots.length;
        }
      }
    }
    
    // Create notification for staff if they are assigned to this doctor
    // Find staff assigned to this doctor
    const { data: staffMembers } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('role', 'staff')
      .eq('assigned_doctor_id', req.user.id);
    
    if (staffMembers && staffMembers.length > 0) {
      for (const staff of staffMembers) {
        await NotificationService.createNotification({
          recipientId: staff.id,
          title: 'New Timeslot Created',
          message: `Dr. ${req.user.first_name} ${req.user.last_name} has created a new timeslot for ${date} at ${startTime}.`,
          type: 'timeslot_created',
          priority: 'low',
          data: {
            timeslotId: timeslot.id,
            doctorName: `Dr. ${req.user.first_name} ${req.user.last_name}`,
            date,
            time: startTime,
            link: `/timeslots`
          }
        });
      }
    }
    
    res.status(201).json({
      message: 'Timeslot created successfully',
      timeslot,
      recurringCreated
    });
  } catch (error) {
    console.error('Create timeslot error:', error);
    res.status(500).json({ 
      error: 'Failed to create timeslot',
      details: error.message 
    });
  }
};

// Update timeslot
export const updateTimeslot = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const supabase = supabaseAdmin();
    
    // Find timeslot first
    const { data: existingTimeslot, error: fetchError } = await supabase
      .from('timeslots')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existingTimeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    // Check permissions
    if (req.user.role === 'doctor' && existingTimeslot.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // If updating time or date, check for overlaps
    if (updateData.date || updateData.start_time || updateData.end_time) {
      const checkDate = updateData.date || existingTimeslot.date;
      const checkStartTime = updateData.start_time || existingTimeslot.start_time;
      const checkEndTime = updateData.end_time || existingTimeslot.end_time;
      
      const { data: overlappingSlots, error: overlapError } = await supabase
        .from('timeslots')
        .select('id')
        .eq('doctor_id', existingTimeslot.doctor_id)
        .eq('date', checkDate)
        .neq('id', id)
        .or(`and(start_time.lte.${checkStartTime},end_time.gt.${checkStartTime}),and(start_time.lt.${checkEndTime},end_time.gte.${checkEndTime}),and(start_time.gte.${checkStartTime},end_time.lte.${checkEndTime})`);
      
      if (overlapError) {
        throw overlapError;
      }
      
      if (overlappingSlots && overlappingSlots.length > 0) {
        return res.status(400).json({ 
          error: 'Updated timeslot would overlap with existing timeslot' 
        });
      }
    }
    
    // Prepare update data with proper field names
    const formattedUpdateData = {};
    if (updateData.date) formattedUpdateData.date = updateData.date;
    if (updateData.startTime) formattedUpdateData.start_time = updateData.startTime;
    if (updateData.endTime) formattedUpdateData.end_time = updateData.endTime;
    if (updateData.duration) formattedUpdateData.duration = updateData.duration;
    if (updateData.type) formattedUpdateData.type = updateData.type;
    if (updateData.maxBookings) formattedUpdateData.max_bookings = updateData.maxBookings;
    if (updateData.notes !== undefined) formattedUpdateData.notes = updateData.notes;
    if (updateData.status) formattedUpdateData.status = updateData.status;
    
    formattedUpdateData.updated_at = new Date().toISOString();
    
    // Update timeslot
    const { data: timeslot, error: updateError } = await supabase
      .from('timeslots')
      .update(formattedUpdateData)
      .eq('id', id)
      .select(`
        *,
        doctor:users!doctor_id(
          id,
          first_name,
          last_name,
          email,
          specialization,
          clinic_name
        )
      `)
      .single();
    
    if (updateError) {
      throw updateError;
    }
    
    res.json({
      message: 'Timeslot updated successfully',
      timeslot
    });
  } catch (error) {
    console.error('Update timeslot error:', error);
    res.status(500).json({ 
      error: 'Failed to update timeslot',
      details: error.message 
    });
  }
};

// Delete timeslot
export const deleteTimeslot = async (req, res) => {
  try {
    const { id } = req.params;
    const { force = false } = req.query;
    
    const supabase = supabaseAdmin();
    
    // Find timeslot with appointments
    const { data: timeslot, error: fetchError } = await supabase
      .from('timeslots')
      .select(`
        *,
        appointments(
          id,
          status,
          pharma_rep_id
        )
      `)
      .eq('id', id)
      .single();
    
    if (fetchError || !timeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    // Check permissions
    if (req.user.role === 'doctor' && timeslot.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if timeslot has active appointments
    const activeAppointments = timeslot.appointments?.filter(apt => 
      ['scheduled', 'confirmed'].includes(apt.status)
    ) || [];
    
    if (activeAppointments.length > 0 && !force) {
      return res.status(400).json({ 
        error: 'Cannot delete timeslot with active appointments. Use force=true to override.',
        activeAppointments: activeAppointments.length
      });
    }
    
    // If forcing deletion, cancel active appointments first
    if (activeAppointments.length > 0 && force) {
      const { error: cancelError } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: req.user.id,
          cancellation_reason: 'Timeslot deleted by doctor'
        })
        .in('id', activeAppointments.map(apt => apt.id));
      
      if (cancelError) {
        throw cancelError;
      }
      
      // Create notifications for affected pharma reps
      for (const appointment of activeAppointments) {
        await NotificationService.createNotification({
          recipientId: appointment.pharma_rep_id,
          title: 'Appointment Cancelled - Timeslot Deleted',
          message: `Your appointment for ${timeslot.date} at ${timeslot.start_time} has been cancelled because the doctor deleted the timeslot.`,
          type: 'appointment_cancelled',
          priority: 'high',
          data: {
            appointmentId: appointment.id,
            timeslotId: id,
            date: timeslot.date,
            time: timeslot.start_time,
            reason: 'Timeslot deleted by doctor',
            link: `/appointments`
          }
        });
      }
    }
    
    // Delete timeslot
    const { error: deleteError } = await supabase
      .from('timeslots')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      throw deleteError;
    }
    
    res.json({
      message: 'Timeslot deleted successfully',
      cancelledAppointments: activeAppointments.length
    });
  } catch (error) {
    console.error('Delete timeslot error:', error);
    res.status(500).json({ 
      error: 'Failed to delete timeslot',
      details: error.message 
    });
  }
};

// Bulk create timeslots
export const bulkCreateTimeslots = async (req, res) => {
  try {
    const { timeslots } = req.body;
    
    // Only doctors can create timeslots
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Only doctors can create timeslots' });
    }
    
    if (!Array.isArray(timeslots) || timeslots.length === 0) {
      return res.status(400).json({ error: 'Timeslots array is required' });
    }
    
    if (timeslots.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 timeslots per bulk operation' });
    }
    
    const supabase = supabaseAdmin();
    const createdSlots = [];
    const errors = [];
    
    // Process each timeslot
    for (let i = 0; i < timeslots.length; i++) {
      const slot = timeslots[i];
      
      try {
        // Validate date
        const slotDate = new Date(slot.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        slotDate.setHours(0, 0, 0, 0);
        
        if (slotDate < today) {
          errors.push({
            index: i,
            error: 'Cannot create timeslots in the past',
            slot
          });
          continue;
        }
        
        // Check for overlaps
        const { data: overlappingSlots } = await supabase
          .from('timeslots')
          .select('id')
          .eq('doctor_id', req.user.id)
          .eq('date', slot.date)
          .or(`and(start_time.lte.${slot.startTime},end_time.gt.${slot.startTime}),and(start_time.lt.${slot.endTime},end_time.gte.${slot.endTime}),and(start_time.gte.${slot.startTime},end_time.lte.${slot.endTime})`);
        
        if (overlappingSlots && overlappingSlots.length > 0) {
          errors.push({
            index: i,
            error: 'Timeslot overlaps with existing timeslot',
            slot
          });
          continue;
        }
        
        // Create timeslot
        const { data: newSlot, error: createError } = await supabase
          .from('timeslots')
          .insert({
            doctor_id: req.user.id,
            date: slot.date,
            start_time: slot.startTime,
            end_time: slot.endTime,
            duration: slot.duration || 30,
            type: slot.type || 'pharma',
            max_bookings: slot.maxBookings || 1,
            current_bookings: 0,
            status: 'available',
            notes: slot.notes
          })
          .select()
          .single();
        
        if (createError) {
          errors.push({
            index: i,
            error: createError.message,
            slot
          });
          continue;
        }
        
        createdSlots.push(newSlot);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          slot
        });
      }
    }
    
    res.status(201).json({
      message: `Bulk timeslot creation completed`,
      created: createdSlots.length,
      errors: errors.length,
      timeslots: createdSlots,
      errorDetails: errors
    });
  } catch (error) {
    console.error('Bulk create timeslots error:', error);
    res.status(500).json({ 
      error: 'Failed to bulk create timeslots',
      details: error.message 
    });
  }
};

// Helper function to generate recurring timeslots
async function generateRecurringTimeslots(doctorId, startDate, startTime, endTime, duration, type, maxBookings, notes, recurringRule) {
  const slots = [];
  const start = new Date(startDate);
  const end = new Date(recurringRule.endDate);
  
  let current = new Date(start);
  current.setDate(current.getDate() + 1); // Start from next occurrence
  
  while (current <= end) {
    let shouldCreate = false;
    
    switch (recurringRule.type) {
      case 'daily':
        shouldCreate = true;
        current.setDate(current.getDate() + 1);
        break;
      case 'weekly':
        if (recurringRule.daysOfWeek && recurringRule.daysOfWeek.includes(current.getDay())) {
          shouldCreate = true;
        }
        current.setDate(current.getDate() + 1);
        break;
      case 'monthly':
        if (recurringRule.dayOfMonth && current.getDate() === recurringRule.dayOfMonth) {
          shouldCreate = true;
        }
        current.setDate(current.getDate() + 1);
        break;
      default:
        return slots;
    }
    
    if (shouldCreate) {
      slots.push({
        doctor_id: doctorId,
        date: current.toISOString().split('T')[0],
        start_time: startTime,
        end_time: endTime,
        duration,
        type,
        max_bookings: maxBookings,
        current_bookings: 0,
        status: 'available',
        notes,
        is_recurring_instance: true,
        recurring_rule: recurringRule
      });
    }
  }
  
  return slots;
} 