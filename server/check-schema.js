import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkSchema() {
  try {
    console.log('🔍 Checking appointments table schema...');
    
    // Try to get one appointment to see the actual columns
    const { data: sample, error } = await supabase
      .from('appointments')
      .select('*')
      .limit(1);
      
    if (error) {
      console.log('❌ Error querying appointments:', error);
    } else {
      console.log('📋 Sample appointment data structure:');
      if (sample && sample.length > 0) {
        console.log('Available columns:', Object.keys(sample[0]));
      } else {
        console.log('No appointments exist yet');
        
        // Let's try to insert a minimal appointment to see what columns are required
        console.log('\n🧪 Testing minimal appointment creation...');
        
        const userId = '7e66363e-2e1f-4805-a748-e0278e767007';
        const startTime = new Date();
        startTime.setHours(startTime.getHours() + 2);
        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);
        
        const minimalAppointment = {
          title: 'Test Appointment',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: 'scheduled',
          doctor_id: userId,
          pharma_rep_id: userId
        };
        
        const { data: created, error: createError } = await supabase
          .from('appointments')
          .insert(minimalAppointment)
          .select()
          .single();
          
        if (createError) {
          console.log('❌ Error creating minimal appointment:', createError);
          console.log('💡 This tells us what columns are required');
        } else {
          console.log('✅ Minimal appointment created!');
          console.log('📋 Actual columns:', Object.keys(created));
          console.log('📅 Appointment details:', created);
        }
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

checkSchema(); 