import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role key to bypass RLS
);

async function debugAppointmentSync() {
  const userId = '7e66363e-2e1f-4805-a748-e0278e767007'; // Your user ID
  
  console.log('🔍 Debugging appointment sync for user:', userId);
  console.log('🔧 Environment check:');
  console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
  console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');
  
  // Test basic Supabase connection
  console.log('\n🔗 Testing Supabase connection...');
  try {
    const { data: testData, error: testError } = await supabase
      .from('appointments')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.log('❌ Supabase connection failed:', testError.message);
      return;
    } else {
      console.log('✅ Supabase connection successful');
    }
  } catch (err) {
    console.log('❌ Supabase connection error:', err.message);
    return;
  }
  
  // Default timeframe (same as in GoogleCalendarSyncService)
  const now = new Date();
  const timeframe = {
    start: new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)), // 30 days ago
    end: new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)) // 90 days future
  };
  
  console.log('📅 Timeframe:', {
    start: timeframe.start.toISOString(),
    end: timeframe.end.toISOString()
  });
  
  // Query exactly like in GoogleCalendarSyncService
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      *,
      timeslot:timeslots!timeslot_id (
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
        email
      ),
      pharma_rep:users!pharma_rep_id (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
    .eq('status', 'confirmed')
    .not('timeslot_id', 'is', null)
    .gte('timeslot.date', timeframe.start.toISOString().split('T')[0])
    .lte('timeslot.date', timeframe.end.toISOString().split('T')[0])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching appointments:', error);
    return;
  }

  console.log(`📋 Found ${appointments?.length || 0} appointments`);
  
  if (appointments && appointments.length > 0) {
    appointments.forEach((apt, index) => {
      console.log(`\n📌 Appointment ${index + 1}:`);
      console.log('  ID:', apt.id);
      console.log('  Status:', apt.status);
      console.log('  Purpose:', apt.purpose);
      console.log('  Created:', apt.created_at);
      console.log('  Timeslot Date:', apt.timeslot?.date);
      console.log('  Timeslot Time:', `${apt.timeslot?.start_time} - ${apt.timeslot?.end_time}`);
      console.log('  Doctor:', `${apt.doctor?.first_name} ${apt.doctor?.last_name}`, apt.doctor?.email);
      console.log('  Pharma Rep:', `${apt.pharma_rep?.first_name} ${apt.pharma_rep?.last_name}`, apt.pharma_rep?.email);
      console.log('  Duration:', apt.duration, 'minutes');
      console.log('  Meeting Type:', apt.meeting_type);
    });
  } else {
    console.log('\n🔍 No appointments found. Let\'s check why...');
    
    // Check all appointments for this user
    const { data: allApts } = await supabase
      .from('appointments')
      .select('*')
      .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`);
      
    console.log(`📊 Total appointments for user: ${allApts?.length || 0}`);
    
    // Debug: Check total appointments in table
    const { data: totalApts } = await supabase
      .from('appointments')
      .select('id, doctor_id, pharma_rep_id, status, purpose')
      .limit(10);
    console.log(`🗂️ Total appointments in entire table: ${totalApts?.length || 0}`);
    
    if (totalApts && totalApts.length > 0) {
      totalApts.forEach(apt => {
        console.log(`  - ${apt.id}: doctor_id=${apt.doctor_id}, pharma_rep_id=${apt.pharma_rep_id}, status=${apt.status}`);
      });
    }
    
    // Debug: Check specific user ID format
    const { data: exactMatch } = await supabase
      .from('appointments')
      .select('id, doctor_id, pharma_rep_id, status')
      .eq('doctor_id', userId)
      .limit(5);
    console.log(`🎯 Direct doctor_id match: ${exactMatch?.length || 0}`);
    
    if (exactMatch && exactMatch.length > 0) {
      exactMatch.forEach(apt => {
        console.log(`  - ${apt.id}: doctor_id=${apt.doctor_id}, status=${apt.status}`);
      });
    }
    
    // Check confirmed appointments
    const { data: confirmedApts } = await supabase
      .from('appointments')
      .select('*')
      .or(`doctor_id.eq.${userId},pharma_rep_id.eq.${userId}`)
      .eq('status', 'confirmed');
      
    console.log(`✅ Confirmed appointments: ${confirmedApts?.length || 0}`);
    
    if (confirmedApts && confirmedApts.length > 0) {
      confirmedApts.forEach(apt => {
        console.log(`  - ${apt.id}: created ${apt.created_at}, in timeframe: ${
          apt.created_at >= timeframe.start.toISOString() && 
          apt.created_at <= timeframe.end.toISOString()
        }`);
      });
    }
  }
}

debugAppointmentSync().catch(console.error); 