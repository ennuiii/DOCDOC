import { supabaseAdmin } from '../config/supabase.js';
import NotificationService from '../services/notificationService.js';

// Get appointments with filters
export const getAppointments = async (req, res) => {
  try {
    const { 
      status, 
      startDate, 
      endDate, 
      doctorId,
      pharmaRepId,
      page = 1,
      limit = 20
    } = req.query;
    
    const supabase = supabaseAdmin();
    
    // Build query based on user role
    let query = supabase
      .from('appointments')
      .select(`
        *,
        timeslot:timeslots(
          id,
          date,
          start_time,
          end_time,
          duration
        ),
        doctor:users!doctor_id(
          id,
          first_name,
          last_name,
          email,
          specialization,
          clinic_name
        ),
        pharma_rep:users!pharma_rep_id(
          id,
          first_name,
          last_name,
          email,
          company_name
        ),
        products:appointment_products(
          id,
          name,
          category,
          description
        )
      `);
    
    // Apply role-based filters
    if (req.user.role === 'doctor') {
      query = query.eq('doctor_id', req.user.id);
    } else if (req.user.role === 'pharma') {
      query = query.eq('pharma_rep_id', req.user.id);
    } else if (req.user.role === 'staff') {
      // Staff can see their assigned doctor's appointments
      if (req.user.profile?.assignedDoctorId) {
        query = query.eq('doctor_id', req.user.profile.assignedDoctorId);
      }
    }
    
    // Apply filters
    if (status) {
      if (status.includes(',')) {
        query = query.in('status', status.split(','));
      } else {
        query = query.eq('status', status);
      }
    }
    
    if (doctorId && req.user.role === 'admin') {
      query = query.eq('doctor_id', doctorId);
    }
    
    if (pharmaRepId && req.user.role === 'admin') {
      query = query.eq('pharma_rep_id', pharmaRepId);
    }
    
    // Date range filter using timeslot date
    if (startDate) {
      query = query.gte('timeslots.date', startDate);
    }
    if (endDate) {
      query = query.lte('timeslots.date', endDate);
    }
    
    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    // Execute query
    const { data: appointments, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) {
      console.error('Get appointments error:', error);
      throw error;
    }
    
    res.json({
      appointments: appointments || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch appointments',
      details: error.message 
    });
  }
};

// Get single appointment
export const getAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = supabaseAdmin();
    
    const { data: appointment, error } = await supabase
      .from('appointments')
      .select(`
        *,
        timeslot:timeslots(
          id,
          date,
          start_time,
          end_time,
          duration
        ),
        doctor:users!doctor_id(
          id,
          first_name,
          last_name,
          email,
          specialization,
          clinic_name
        ),
        pharma_rep:users!pharma_rep_id(
          id,
          first_name,
          last_name,
          email,
          company_name
        ),
        products:appointment_products(
          id,
          name,
          category,
          description
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      throw error;
    }
    
    // Check access permissions
    if (
      (req.user.role === 'doctor' && appointment.doctor_id !== req.user.id) ||
      (req.user.role === 'pharma' && appointment.pharma_rep_id !== req.user.id)
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ appointment });
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch appointment',
      details: error.message 
    });
  }
};

// Create appointment (book timeslot)
export const createAppointment = async (req, res) => {
  try {
    const {
      timeslotId,
      purpose,
      products,
      notes,
      meetingType
    } = req.body;
    
    // Only pharma reps can book appointments
    if (req.user.role !== 'pharma') {
      return res.status(403).json({ error: 'Only pharmaceutical representatives can book appointments' });
    }
    
    const supabase = supabaseAdmin();
    
    // Find and validate timeslot
    const { data: timeslot, error: timeslotError } = await supabase
      .from('timeslots')
      .select(`
        *,
        doctor:users!doctor_id(id, first_name, last_name, email)
      `)
      .eq('id', timeslotId)
      .single();
    
    if (timeslotError || !timeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    if (timeslot.status !== 'available' || timeslot.current_bookings >= timeslot.max_bookings) {
      return res.status(400).json({ error: 'Timeslot is not available for booking' });
    }
    
    // Create appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        timeslot_id: timeslotId,
        doctor_id: timeslot.doctor_id,
        pharma_rep_id: req.user.id,
        purpose,
        notes,
        meeting_type: meetingType || 'in-person',
        status: 'scheduled'
      })
      .select(`
        *,
        timeslot:timeslots(id, date, start_time, end_time, duration),
        doctor:users!doctor_id(id, first_name, last_name, email, specialization),
        pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name)
      `)
      .single();
    
    if (appointmentError) {
      console.error('Create appointment error:', appointmentError);
      throw appointmentError;
    }
    
    // Add products if provided
    if (products && products.length > 0) {
      const productInserts = products.map(product => ({
        appointment_id: appointment.id,
        name: product.name,
        category: product.category,
        description: product.description
      }));
      
      await supabase
        .from('appointment_products')
        .insert(productInserts);
    }
    
    // Update timeslot booking count
    await supabase
      .from('timeslots')
      .update({ 
        current_bookings: timeslot.current_bookings + 1,
        status: timeslot.current_bookings + 1 >= timeslot.max_bookings ? 'booked' : 'available'
      })
      .eq('id', timeslotId);
    
    // Create notification for doctor
    await NotificationService.createNotification({
      recipientId: timeslot.doctor_id,
      title: 'New Appointment Booked',
      message: `${req.user.first_name} ${req.user.last_name} from ${req.user.company_name} has booked an appointment for ${timeslot.date} at ${timeslot.start_time}.`,
      type: 'appointment_created',
      priority: 'medium',
      data: {
        appointmentId: appointment.id,
        pharmaRep: `${req.user.first_name} ${req.user.last_name}`,
        company: req.user.company_name,
        date: timeslot.date,
        time: timeslot.start_time,
        purpose,
        link: `/appointments`
      }
    });
    
    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ 
      error: 'Failed to book appointment',
      details: error.message 
    });
  }
};

// Update appointment
export const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const supabase = supabaseAdmin();
    
    // Find appointment first
    const { data: existingAppointment, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !existingAppointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check permissions
    if (
      (req.user.role === 'doctor' && existingAppointment.doctor_id !== req.user.id) ||
      (req.user.role === 'pharma' && existingAppointment.pharma_rep_id !== req.user.id)
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update appointment
    const { data: appointment, error } = await supabase
      .from('appointments')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        timeslot:timeslots(id, date, start_time, end_time),
        doctor:users!doctor_id(id, first_name, last_name, email),
        pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name)
      `)
      .single();
    
    if (error) {
      throw error;
    }
    
    res.json({
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ 
      error: 'Failed to update appointment',
      details: error.message 
    });
  }
};

// Cancel appointment
export const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const supabase = supabaseAdmin();
    
    // Find appointment with related data
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        timeslot:timeslots(id, date, start_time, current_bookings, max_bookings),
        doctor:users!doctor_id(id, first_name, last_name, email),
        pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name)
      `)
      .eq('id', id)
      .single();
    
    if (fetchError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check if already cancelled
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment is already cancelled' });
    }
    
    // Check permissions
    if (
      (req.user.role === 'doctor' && appointment.doctor_id !== req.user.id) ||
      (req.user.role === 'pharma' && appointment.pharma_rep_id !== req.user.id)
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update appointment status
    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.user.id,
        cancellation_reason: reason
      })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    // Update timeslot availability
    const newBookingCount = Math.max(0, appointment.timeslot.current_bookings - 1);
    await supabase
      .from('timeslots')
      .update({ 
        current_bookings: newBookingCount,
        status: 'available' // Make available again
      })
      .eq('id', appointment.timeslot_id);
    
    // Create notification for the other party
    const recipientId = req.user.role === 'doctor' ? appointment.pharma_rep_id : appointment.doctor_id;
    const senderName = req.user.role === 'doctor' 
      ? `Dr. ${req.user.first_name} ${req.user.last_name}`
      : `${req.user.first_name} ${req.user.last_name}`;
    
    await NotificationService.createNotification({
      recipientId,
      title: 'Appointment Cancelled',
      message: `${senderName} has cancelled the appointment scheduled for ${appointment.timeslot.date} at ${appointment.timeslot.start_time}.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'appointment_cancelled',
      priority: 'high',
      data: {
        appointmentId: id,
        cancelledBy: senderName,
        date: appointment.timeslot.date,
        time: appointment.timeslot.start_time,
        reason,
        link: `/appointments`
      }
    });
    
    res.json({
      message: 'Appointment cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel appointment',
      details: error.message 
    });
  }
};

// Confirm appointment (doctors only)
export const confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const supabase = supabaseAdmin();
    
    // Find appointment
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        timeslot:timeslots(id, date, start_time, end_time),
        doctor:users!doctor_id(id, first_name, last_name, email),
        pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name)
      `)
      .eq('id', id)
      .single();
    
    if (fetchError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Only doctors can confirm appointments
    if (req.user.role !== 'doctor' || appointment.doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the assigned doctor can confirm appointments' });
    }
    
    if (appointment.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only scheduled appointments can be confirmed' });
    }
    
    // Update appointment status
    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: req.user.id
      })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    // Create notification for pharma rep
    await NotificationService.createNotification({
      recipientId: appointment.pharma_rep_id,
      title: 'Appointment Confirmed',
      message: `Dr. ${appointment.doctor.first_name} ${appointment.doctor.last_name} has confirmed your appointment for ${appointment.timeslot.date} at ${appointment.timeslot.start_time}.`,
      type: 'appointment_confirmed',
      priority: 'medium',
      data: {
        appointmentId: id,
        doctorName: `Dr. ${appointment.doctor.first_name} ${appointment.doctor.last_name}`,
        date: appointment.timeslot.date,
        time: appointment.timeslot.start_time,
        link: `/appointments`
      }
    });
    
    res.json({
      message: 'Appointment confirmed successfully',
      appointment
    });
  } catch (error) {
    console.error('Confirm appointment error:', error);
    res.status(500).json({ 
      error: 'Failed to confirm appointment',
      details: error.message 
    });
  }
};

// Complete appointment
export const completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const supabase = supabaseAdmin();
    
    // Find appointment
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        timeslot:timeslots(id, date, start_time, end_time),
        doctor:users!doctor_id(id, first_name, last_name, email),
        pharma_rep:users!pharma_rep_id(id, first_name, last_name, email, company_name)
      `)
      .eq('id', id)
      .single();
    
    if (fetchError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check permissions
    if (
      (req.user.role === 'doctor' && appointment.doctor_id !== req.user.id) ||
      (req.user.role === 'pharma' && appointment.pharma_rep_id !== req.user.id)
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({ error: 'Only scheduled or confirmed appointments can be marked as completed' });
    }
    
    // Update appointment status
    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: req.user.id
      })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    // Create notification for the other party
    const recipientId = req.user.role === 'doctor' ? appointment.pharma_rep_id : appointment.doctor_id;
    const senderName = req.user.role === 'doctor' 
      ? `Dr. ${req.user.first_name} ${req.user.last_name}`
      : `${req.user.first_name} ${req.user.last_name}`;
    
    await NotificationService.createNotification({
      recipientId,
      title: 'Appointment Completed',
      message: `${senderName} has marked the appointment for ${appointment.timeslot.date} at ${appointment.timeslot.start_time} as completed.`,
      type: 'appointment_completed',
      priority: 'low',
      data: {
        appointmentId: id,
        completedBy: senderName,
        date: appointment.timeslot.date,
        time: appointment.timeslot.start_time,
        link: `/appointments`
      }
    });
    
    res.json({
      message: 'Appointment marked as completed'
    });
  } catch (error) {
    console.error('Complete appointment error:', error);
    res.status(500).json({ 
      error: 'Failed to complete appointment',
      details: error.message 
    });
  }
};

// Get available timeslots for booking (pharma view)
export const getAvailableTimeslots = async (req, res) => {
  try {
    const { 
      doctorId,
      specialization,
      date,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;
    
    const supabase = supabaseAdmin();
    
    // Build query to get available timeslots
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
        )
      `)
      .eq('status', 'available')
      .lt('current_bookings', supabase.raw('max_bookings'));
    
    // Filter by doctor
    if (doctorId) {
      query = query.eq('doctor_id', doctorId);
    }
    
    // Date filters
    if (date) {
      query = query.eq('date', date);
    } else if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    } else {
      // Default to future dates only
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('date', today);
    }
    
    // Execute query
    const { data: timeslots, error } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    if (!timeslots || timeslots.length === 0) {
      return res.json({
        timeslots: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }
    
    // Get all appointments for these timeslots to check if any are scheduled/confirmed
    const timeslotIds = timeslots.map(t => t.id);
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('timeslot_id, status')
      .in('timeslot_id', timeslotIds);
    
    if (appointmentsError) {
      console.error('Appointments query error:', appointmentsError);
      // If we can't get appointments, return empty to be safe
      return res.json({
        timeslots: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }
    
    // Create a set of timeslot IDs that have scheduled or confirmed appointments
    const unavailableTimeslotIds = new Set();
    (appointments || []).forEach(appointment => {
      if (['scheduled', 'confirmed'].includes(appointment.status)) {
        unavailableTimeslotIds.add(appointment.timeslot_id);
      }
    });
    
    // Filter out timeslots that have scheduled or confirmed appointments
    let availableTimeslots = timeslots.filter(timeslot => 
      !unavailableTimeslotIds.has(timeslot.id)
    );
    
    // Filter by specialization if needed (client-side filter)
    if (specialization && !doctorId) {
      availableTimeslots = availableTimeslots.filter(slot => 
        slot.doctor?.specialization?.toLowerCase().includes(specialization.toLowerCase())
      );
    }
    
    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const paginatedTimeslots = availableTimeslots.slice(from, to + 1);
    
    res.json({
      timeslots: paginatedTimeslots,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: availableTimeslots.length,
        pages: Math.ceil(availableTimeslots.length / limit)
      }
    });
  } catch (error) {
    console.error('Get available timeslots error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch available timeslots',
      details: error.message 
    });
  }
};

// Add feedback to appointment
export const addFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    
    const supabase = supabaseAdmin();
    
    // Find appointment
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check if appointment is completed
    if (appointment.status !== 'completed') {
      return res.status(400).json({ error: 'Feedback can only be added to completed appointments' });
    }
    
    // Check permissions
    if (
      (req.user.role === 'doctor' && appointment.doctor_id !== req.user.id) ||
      (req.user.role === 'pharma' && appointment.pharma_rep_id !== req.user.id)
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Add feedback
    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        feedback: {
          rating,
          comment,
          submitted_by: req.user.id,
          submitted_at: new Date().toISOString()
        }
      })
      .eq('id', id);
    
    if (updateError) {
      throw updateError;
    }
    
    res.json({
      message: 'Feedback added successfully'
    });
  } catch (error) {
    console.error('Add feedback error:', error);
    res.status(500).json({ 
      error: 'Failed to add feedback',
      details: error.message 
    });
  }
};

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const supabase = supabaseAdmin();
    const today = new Date().toISOString().split('T')[0];
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);

    // Build queries based on user role
    let appointmentFilter = '';
    if (req.user.role === 'doctor') {
      appointmentFilter = `doctor_id.eq.${req.user.id}`;
    } else if (req.user.role === 'pharma') {
      appointmentFilter = `pharma_rep_id.eq.${req.user.id}`;
    }

    // Get today's appointments
    let todayQuery = supabase
      .from('appointments')
      .select('*', { count: 'exact' })
      .eq('timeslots.date', today)
      .in('status', ['scheduled', 'confirmed']);
    
    if (appointmentFilter) {
      todayQuery = todayQuery.or(appointmentFilter);
    }

    const { count: todayCount } = await todayQuery;

    // Get week's appointments
    let weekQuery = supabase
      .from('appointments')
      .select('*', { count: 'exact' })
      .gte('timeslots.date', startOfWeek.toISOString().split('T')[0])
      .lte('timeslots.date', endOfWeek.toISOString().split('T')[0]);
    
    if (appointmentFilter) {
      weekQuery = weekQuery.or(appointmentFilter);
    }

    const { count: weekCount } = await weekQuery;

    // Get completed this week
    let completedQuery = supabase
      .from('appointments')
      .select('*', { count: 'exact' })
      .gte('timeslots.date', startOfWeek.toISOString().split('T')[0])
      .lte('timeslots.date', endOfWeek.toISOString().split('T')[0])
      .eq('status', 'completed');
    
    if (appointmentFilter) {
      completedQuery = completedQuery.or(appointmentFilter);
    }

    const { count: completedThisWeek } = await completedQuery;

    // Get available slots for today (if doctor)
    let availableSlots = 0;
    if (req.user.role === 'doctor') {
      const { count } = await supabase
        .from('timeslots')
        .select('*', { count: 'exact' })
        .eq('date', today)
        .eq('status', 'available')
        .eq('doctor_id', req.user.id);
      
      availableSlots = count || 0;
    }

    res.json({
      todayCount: todayCount || 0,
      weekCount: weekCount || 0,
      availableSlots,
      completedThisWeek: completedThisWeek || 0
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard statistics',
      details: error.message 
    });
  }
}; 