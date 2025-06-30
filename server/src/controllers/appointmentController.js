import Appointment from '../models/Appointment.js';
import Timeslot from '../models/Timeslot.js';
import User from '../models/User.js';
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
    
    // Build query based on user role
    const query = {};
    
    if (req.user.role === 'doctor') {
      query.doctor = req.user._id;
    } else if (req.user.role === 'pharma') {
      query.pharmaRep = req.user._id;
    } else if (req.user.role === 'staff') {
      // Staff can see their assigned doctor's appointments
      query.doctor = req.user.profile.assignedDoctor;
    }
    
    // Apply filters
    if (status) {
      query.status = status;
    }
    
    if (doctorId && req.user.role === 'admin') {
      query.doctor = doctorId;
    }
    
    if (pharmaRepId && req.user.role === 'admin') {
      query.pharmaRep = pharmaRepId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query['timeslot.date'] = {};
      if (startDate) {
        query['timeslot.date'].$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query['timeslot.date'].$lte = end;
      }
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Execute query with population
    const appointments = await Appointment.find(query)
      .populate({
        path: 'timeslot',
        select: 'date startTime endTime duration'
      })
      .populate({
        path: 'doctor',
        select: 'email profile.firstName profile.lastName profile.clinicName profile.specialization'
      })
      .populate({
        path: 'pharmaRep',
        select: 'email profile.firstName profile.lastName profile.companyName'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Appointment.countDocuments(query);
    
    res.json({
      appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
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
    
    const appointment = await Appointment.findById(id)
      .populate('timeslot')
      .populate({
        path: 'doctor',
        select: 'email profile.firstName profile.lastName profile.clinicName profile.specialization'
      })
      .populate({
        path: 'pharmaRep',
        select: 'email profile.firstName profile.lastName profile.companyName'
      });
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check access permissions
    if (
      req.user.role === 'doctor' && appointment.doctor._id.toString() !== req.user._id.toString() ||
      req.user.role === 'pharma' && appointment.pharmaRep._id.toString() !== req.user._id.toString()
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
    
    // Find and validate timeslot
    const timeslot = await Timeslot.findById(timeslotId).populate('doctor');
    if (!timeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    if (!timeslot.canBeBooked()) {
      return res.status(400).json({ error: 'Timeslot is not available for booking' });
    }
    
    // Create appointment
    const appointment = new Appointment({
      timeslot: timeslotId,
      doctor: timeslot.doctor._id,
      pharmaRep: req.user._id,
      purpose,
      products: products || [],
      notes,
      meetingType: meetingType || 'in-person',
      duration: timeslot.duration
    });
    
    await appointment.save();
    
    // Populate references for response
    await appointment.populate([
      { path: 'timeslot' },
      { path: 'doctor', select: 'email profile.firstName profile.lastName profile.clinicName' },
      { path: 'pharmaRep', select: 'email profile.firstName profile.lastName profile.companyName' }
    ]);
    
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
    const {
      purpose,
      products,
      notes,
      meetingType,
      meetingLink
    } = req.body;
    
    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check permissions
    if (
      req.user.role === 'doctor' && appointment.doctor.toString() !== req.user._id.toString() ||
      req.user.role === 'pharma' && appointment.pharmaRep.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Only allow updates for scheduled or confirmed appointments
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({ error: 'Cannot update appointment in current status' });
    }
    
    // Update fields
    if (purpose !== undefined) appointment.purpose = purpose;
    if (products !== undefined) appointment.products = products;
    if (notes !== undefined) appointment.notes = notes;
    if (meetingType !== undefined) appointment.meetingType = meetingType;
    if (meetingLink !== undefined) appointment.meetingLink = meetingLink;
    
    await appointment.save();
    
    // Populate for response
    await appointment.populate([
      { path: 'timeslot' },
      { path: 'doctor', select: 'email profile.firstName profile.lastName profile.clinicName' },
      { path: 'pharmaRep', select: 'email profile.firstName profile.lastName profile.companyName' }
    ]);
    
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
    
    // Find appointment
    const appointment = await Appointment.findById(id).populate('timeslot');
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check permissions
    if (
      req.user.role === 'doctor' && appointment.doctor.toString() !== req.user._id.toString() ||
      req.user.role === 'pharma' && appointment.pharmaRep.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Cancel appointment
    await appointment.cancel(req.user._id, reason);
    
    res.json({
      message: 'Appointment cancelled successfully',
      appointment
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
    
    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Only doctors can confirm appointments
    if (req.user.role !== 'doctor' || appointment.doctor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the assigned doctor can confirm appointments' });
    }
    
    // Confirm appointment
    await appointment.confirm();
    
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
    
    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check permissions
    if (
      req.user.role === 'doctor' && appointment.doctor.toString() !== req.user._id.toString() ||
      req.user.role === 'pharma' && appointment.pharmaRep.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Complete appointment
    await appointment.complete();
    
    res.json({
      message: 'Appointment marked as completed',
      appointment
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
    
    // Build query
    const query = {
      status: 'available',
      type: { $in: ['pharma', 'general'] }
    };
    
    // Filter by doctor
    if (doctorId) {
      query.doctor = doctorId;
    }
    
    // Filter by specialization
    if (specialization && !doctorId) {
      // Find doctors with this specialization
      const doctors = await User.find({
        role: 'doctor',
        'profile.specialization': specialization
      }).select('_id');
      
      query.doctor = { $in: doctors.map(d => d._id) };
    }
    
    // Date filters
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = { $gte: targetDate, $lt: nextDay };
    } else if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    } else {
      // Default to future dates only
      query.date = { $gte: new Date() };
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Execute query
    const [timeslots, total] = await Promise.all([
      Timeslot.find(query)
        .populate({
          path: 'doctor',
          select: 'email profile.firstName profile.lastName profile.clinicName profile.specialization profile.licenseNumber'
        })
        .sort({ date: 1, startTime: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Timeslot.countDocuments(query)
    ]);
    
    res.json({
      timeslots,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
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
    
    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Check if appointment is completed
    if (appointment.status !== 'completed') {
      return res.status(400).json({ error: 'Feedback can only be added to completed appointments' });
    }
    
    // Check permissions
    if (
      req.user.role === 'doctor' && appointment.doctor.toString() !== req.user._id.toString() ||
      req.user.role === 'pharma' && appointment.pharmaRep.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Add feedback
    appointment.feedback = {
      rating,
      comment,
      submittedBy: req.user._id,
      submittedAt: new Date()
    };
    
    await appointment.save();
    
    res.json({
      message: 'Feedback added successfully',
      appointment
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
export const getDashboardStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user._id;

    // Build query based on user role
    const query = {};
    if (req.user.role === 'doctor') {
      query.doctor = userId;
    } else if (req.user.role === 'pharma') {
      query.pharmaRep = userId;
    }

    // Add date range if provided
    if (startDate || endDate) {
      query['timeslot.date'] = {};
      if (startDate) query['timeslot.date'].$gte = startDate;
      if (endDate) query['timeslot.date'].$lte = endDate;
    }

    // Get appointment statistics
    const appointments = await Appointment.find(query)
      .populate('timeslot', 'date startTime endTime')
      .lean();

    // Calculate statistics
    const stats = {
      total: appointments.length,
      byStatus: {
        scheduled: appointments.filter(a => a.status === 'scheduled').length,
        confirmed: appointments.filter(a => a.status === 'confirmed').length,
        completed: appointments.filter(a => a.status === 'completed').length,
        cancelled: appointments.filter(a => a.status === 'cancelled').length,
        noShow: appointments.filter(a => a.status === 'no-show').length,
      },
      byMeetingType: {
        inPerson: appointments.filter(a => a.meetingType === 'in-person').length,
        virtual: appointments.filter(a => a.meetingType === 'virtual').length,
        phone: appointments.filter(a => a.meetingType === 'phone').length,
      },
      completionRate: appointments.length > 0 
        ? Math.round((appointments.filter(a => a.status === 'completed').length / appointments.length) * 100)
        : 0,
      averageRating: appointments
        .filter(a => a.feedback?.rating)
        .reduce((sum, a) => sum + a.feedback.rating, 0) / 
        (appointments.filter(a => a.feedback?.rating).length || 1),
    };

    // Add doctor-specific stats
    if (req.user.role === 'doctor') {
      // Get unique pharma companies
      const uniqueCompanies = new Set();
      appointments.forEach(a => {
        if (a.pharmaRep?.profile?.companyName) {
          uniqueCompanies.add(a.pharmaRep.profile.companyName);
        }
      });
      stats.uniqueCompanies = uniqueCompanies.size;

      // Get product categories
      const productCategories = new Set();
      appointments.forEach(a => {
        a.products?.forEach(p => {
          if (p.category) productCategories.add(p.category);
        });
      });
      stats.productCategories = Array.from(productCategories);
    }

    res.json({
      success: true,
      stats,
      dateRange: { startDate, endDate },
    });
  } catch (error) {
    next(error);
  }
}; 