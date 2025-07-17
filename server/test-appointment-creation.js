import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function createTestAppointment() {
  try {
    console.log('🧪 Creating test appointment...');
    
    // First, let's get the connected user ID for Microsoft integration
    const { data: integrations, error: intError } = await supabase
      .from('user_integrations')
      .select('user_id, provider')
      .eq('provider', 'microsoft')
      .eq('status', 'connected')
      .limit(1);
      
    if (intError || !integrations || integrations.length === 0) {
      console.log('❌ No Microsoft integration found');
      return;
    }
    
    const userId = integrations[0].user_id;
    console.log('👤 Using user ID:', userId);
    
    // Create a timeslot first (required for appointments)
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 2); // 2 hours from now
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1); // 1 hour duration
    
    const timeslotData = {
      doctor_id: userId,
      date: startTime.toISOString().split('T')[0], // YYYY-MM-DD format
      start_time: startTime.toTimeString().split(' ')[0].substring(0, 5), // HH:MM format
      end_time: endTime.toTimeString().split(' ')[0].substring(0, 5), // HH:MM format
      duration: 60,
      status: 'available',
      type: 'pharma',
      max_bookings: 1,
      current_bookings: 0,
      notes: 'Test timeslot for Outlook sync'
    };
    
    console.log('⏰ Creating timeslot:', timeslotData);
    
    const { data: timeslot, error: timeslotError } = await supabase
      .from('timeslots')
      .insert(timeslotData)
      .select()
      .single();
      
    if (timeslotError) {
      console.log('❌ Error creating timeslot:', timeslotError);
      return;
    }
    
    console.log('✅ Timeslot created with ID:', timeslot.id);
    
    // Now create the appointment
    const testAppointment = {
      timeslot_id: timeslot.id,
      doctor_id: userId,
      pharma_rep_id: userId, // Using same user for simplicity
      status: 'scheduled',
      purpose: 'Test PharmaDOC Appointment - Outlook Sync',
      notes: 'This is a test appointment created to verify Outlook sync functionality',
      meeting_type: 'in-person',
      duration: 60
    };
    
    console.log('📅 Creating appointment:', {
      purpose: testAppointment.purpose,
      timeslot_id: testAppointment.timeslot_id
    });
    
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert(testAppointment)
      .select()
      .single();
      
    if (error) {
      console.log('❌ Error creating appointment:', error);
      return;
    }
    
    console.log('✅ Test appointment created with ID:', appointment.id);
    
    // Now test manual sync to Outlook
    console.log('\n🔄 Triggering sync to Outlook...');
    
    try {
      const response = await fetch('http://localhost:5000/api/integrations/microsoft/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer mock-token` // You might need actual auth here
        },
        body: JSON.stringify({ userId })
      });
      
      const result = await response.text();
      console.log('📡 Sync response status:', response.status);
      console.log('📡 Sync response:', result);
      
      if (response.ok) {
        console.log('✅ Sync triggered successfully');
        console.log('💡 Check your Outlook calendar now for the new appointment!');
      } else {
        console.log('❌ Sync failed with status:', response.status);
      }
    } catch (syncError) {
      console.log('❌ Error triggering sync:', syncError.message);
      console.log('💡 You might need to trigger sync manually from the UI');
    }
    
    // Check if the appointment got synced
    setTimeout(async () => {
      console.log('\n🔍 Checking if appointment was synced...');
      const { data: updatedAppointment } = await supabase
        .from('appointments')
        .select('outlook_event_id, google_event_id')
        .eq('id', appointment.id)
        .single();
        
      if (updatedAppointment) {
        console.log('📋 Sync status:');
        console.log('   Outlook Event ID:', updatedAppointment.outlook_event_id || 'Not synced');
        console.log('   Google Event ID:', updatedAppointment.google_event_id || 'Not synced');
      }
    }, 3000);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

createTestAppointment(); 