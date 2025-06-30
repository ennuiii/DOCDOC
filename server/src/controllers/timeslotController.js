import Timeslot from '../models/Timeslot.js';
import User from '../models/User.js';

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
    
    // Build query
    const query = {};
    
    // Filter by doctor
    if (doctorId) {
      query.doctor = doctorId;
    } else if (req.user.role === 'doctor') {
      // Doctors can only see their own timeslots
      query.doctor = req.user._id;
    } else if (req.user.role === 'staff') {
      // Staff can see their assigned doctor's timeslots
      query.doctor = req.user.profile.assignedDoctor;
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
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    // Type filter
    if (type) {
      query.type = type;
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Execute query
    const [timeslots, total] = await Promise.all([
      Timeslot.find(query)
        .populate('doctor', 'email profile.firstName profile.lastName profile.clinicName')
        .populate('appointment')
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
    
    const timeslot = await Timeslot.findById(id)
      .populate('doctor', 'email profile.firstName profile.lastName profile.clinicName')
      .populate('appointment');
    
    if (!timeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    // Check access permissions
    if (req.user.role === 'doctor' && timeslot.doctor._id.toString() !== req.user._id.toString()) {
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
      recurringRule
    } = req.body;
    
    // Only doctors can create timeslots
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Only doctors can create timeslots' });
    }
    
    // Parse and validate date
    const slotDate = new Date(date);
    slotDate.setHours(0, 0, 0, 0);
    
    // Check if date is in the past
    if (slotDate < new Date().setHours(0, 0, 0, 0)) {
      return res.status(400).json({ error: 'Cannot create timeslots in the past' });
    }
    
    // Check for overlapping timeslots
    const hasOverlap = await Timeslot.checkOverlap(
      req.user._id,
      slotDate,
      startTime,
      endTime
    );
    
    if (hasOverlap) {
      return res.status(400).json({ 
        error: 'Timeslot overlaps with existing timeslot' 
      });
    }
    
    // Create timeslot
    const timeslot = new Timeslot({
      doctor: req.user._id,
      date: slotDate,
      startTime,
      endTime,
      type: type || 'pharma',
      maxBookings: maxBookings || 1,
      notes,
      recurringRule: recurringRule || { type: 'none' }
    });
    
    await timeslot.save();
    
    // Handle recurring timeslots
    let recurringSlots = [];
    if (recurringRule && recurringRule.type !== 'none' && recurringRule.endDate) {
      const endDate = new Date(recurringRule.endDate);
      recurringSlots = await timeslot.generateRecurring(endDate);
      
      if (recurringSlots.length > 0) {
        await Timeslot.insertMany(recurringSlots);
      }
    }
    
    // Populate doctor info
    await timeslot.populate('doctor', 'email profile.firstName profile.lastName profile.clinicName');
    
    res.status(201).json({
      message: 'Timeslot created successfully',
      timeslot,
      recurringCreated: recurringSlots.length
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
    const {
      date,
      startTime,
      endTime,
      type,
      maxBookings,
      notes,
      status
    } = req.body;
    
    // Find timeslot
    const timeslot = await Timeslot.findById(id);
    if (!timeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    // Check ownership
    if (req.user.role === 'doctor' && timeslot.doctor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if timeslot is already booked
    if (timeslot.status === 'booked' && status !== 'cancelled') {
      return res.status(400).json({ 
        error: 'Cannot modify booked timeslot. You can only cancel it.' 
      });
    }
    
    // Update fields
    if (date !== undefined) {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      
      // Check if new date is in the past
      if (newDate < new Date().setHours(0, 0, 0, 0)) {
        return res.status(400).json({ error: 'Cannot set timeslot date in the past' });
      }
      
      timeslot.date = newDate;
    }
    
    if (startTime !== undefined) timeslot.startTime = startTime;
    if (endTime !== undefined) timeslot.endTime = endTime;
    
    // Check for overlaps if time or date changed
    if (date !== undefined || startTime !== undefined || endTime !== undefined) {
      const hasOverlap = await Timeslot.checkOverlap(
        timeslot.doctor,
        timeslot.date,
        timeslot.startTime,
        timeslot.endTime,
        timeslot._id
      );
      
      if (hasOverlap) {
        return res.status(400).json({ 
          error: 'Updated timeslot would overlap with existing timeslot' 
        });
      }
    }
    
    if (type !== undefined) timeslot.type = type;
    if (maxBookings !== undefined) timeslot.maxBookings = maxBookings;
    if (notes !== undefined) timeslot.notes = notes;
    if (status !== undefined) timeslot.status = status;
    
    await timeslot.save();
    await timeslot.populate('doctor', 'email profile.firstName profile.lastName profile.clinicName');
    
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
    
    // Find timeslot
    const timeslot = await Timeslot.findById(id);
    if (!timeslot) {
      return res.status(404).json({ error: 'Timeslot not found' });
    }
    
    // Check ownership
    if (req.user.role === 'doctor' && timeslot.doctor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if timeslot is booked
    if (timeslot.status === 'booked') {
      return res.status(400).json({ 
        error: 'Cannot delete booked timeslot. Cancel it first.' 
      });
    }
    
    // Delete timeslot
    await timeslot.deleteOne();
    
    // If it's a parent recurring timeslot, optionally delete all instances
    if (req.query.deleteRecurring === 'true' && !timeslot.isRecurringInstance) {
      await Timeslot.deleteMany({ parentTimeslot: timeslot._id });
    }
    
    res.json({
      message: 'Timeslot deleted successfully'
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
      return res.status(400).json({ error: 'Invalid timeslots array' });
    }
    
    const createdSlots = [];
    const errors = [];
    
    for (let i = 0; i < timeslots.length; i++) {
      const slotData = timeslots[i];
      
      try {
        // Parse date
        const slotDate = new Date(slotData.date);
        slotDate.setHours(0, 0, 0, 0);
        
        // Check for overlap
        const hasOverlap = await Timeslot.checkOverlap(
          req.user._id,
          slotDate,
          slotData.startTime,
          slotData.endTime
        );
        
        if (hasOverlap) {
          errors.push({
            index: i,
            error: 'Overlaps with existing timeslot',
            data: slotData
          });
          continue;
        }
        
        // Create timeslot
        const timeslot = new Timeslot({
          doctor: req.user._id,
          date: slotDate,
          startTime: slotData.startTime,
          endTime: slotData.endTime,
          type: slotData.type || 'pharma',
          maxBookings: slotData.maxBookings || 1,
          notes: slotData.notes
        });
        
        await timeslot.save();
        createdSlots.push(timeslot);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: slotData
        });
      }
    }
    
    res.status(201).json({
      message: `Created ${createdSlots.length} timeslots`,
      created: createdSlots,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Bulk create timeslots error:', error);
    res.status(500).json({ 
      error: 'Failed to create timeslots',
      details: error.message 
    });
  }
}; 