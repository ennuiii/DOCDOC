import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkAppointments() {
  try {
    console.log('🔍 Checking PharmaDOC appointments...');
    
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.log('❌ Error querying appointments:', error);
      return;
    }
    
    console.log('📅 PharmaDOC Appointments found:', appointments.length);
    
    if (appointments.length > 0) {
      appointments.forEach((apt, index) => {
        console.log(`${index + 1}. ID: ${apt.id}`);
        console.log(`   Title: ${apt.title || 'No title'}`);
        console.log(`   Start: ${apt.start_time}`);
        console.log(`   End: ${apt.end_time}`);
        console.log(`   Status: ${apt.status}`);
        console.log(`   Doctor: ${apt.doctor_id}`);
        console.log(`   Pharma Rep: ${apt.pharma_rep_id}`);
        console.log(`   Outlook Event ID: ${apt.outlook_event_id || 'None'}`);
        console.log(`   Google Event ID: ${apt.google_event_id || 'None'}`);
        console.log('   ---');
      });
    } else {
      console.log('ℹ️ No appointments found in PharmaDOC database');
      console.log('💡 This explains why nothing is syncing to Outlook!');
      console.log('💡 Try creating an appointment in PharmaDOC first.');
    }
    
    // Also check for user integrations
    console.log('\n🔍 Checking user integrations...');
    const { data: integrations, error: intError } = await supabase
      .from('user_integrations')
      .select('user_id, provider, status, auto_sync')
      .eq('status', 'connected');
      
    if (intError) {
      console.log('❌ Error querying integrations:', intError);
    } else {
      console.log('🔗 Connected integrations:', integrations.length);
      integrations.forEach(int => {
        console.log(`   User: ${int.user_id}, Provider: ${int.provider}, Auto-sync: ${int.auto_sync}`);
      });
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkAppointments(); 