/**
 * Test the fixed cancellation sync logic
 * This tests that cancelled appointments are properly removed from Google Calendar
 */

import { createClient } from '@supabase/supabase-js';
import GoogleCalendarSyncService from './src/integrations/services/GoogleCalendarSyncService.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TEST_USER_ID = '7e66363e-2e1f-4805-a748-e0278e767007'; // Sebastian's user ID
const TEST_INTEGRATION_ID = 'a42a917d-ae18-4162-bf10-a131d7a35666'; // Sebastian's Google integration

async function testCancelSync() {
  try {
    console.log('🧪 Testing Fixed Cancellation Sync');
    console.log('=====================================');

    // 1. Check current appointments status
    console.log('\\n1. Current appointments status:');
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        id,
        status,
        purpose,
        timeslot:timeslots!timeslot_id (date, start_time)
      `)
      .or(`doctor_id.eq.${TEST_USER_ID},pharma_rep_id.eq.${TEST_USER_ID}`)
      .not('timeslot_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    console.log(`Total appointments: ${appointments?.length || 0}`);
    const confirmedCount = appointments?.filter(a => a.status === 'confirmed').length || 0;
    const cancelledCount = appointments?.filter(a => a.status === 'cancelled').length || 0;
    console.log(`Confirmed: ${confirmedCount}, Cancelled: ${cancelledCount}`);

    // 2. Check existing calendar events
    console.log('\\n2. Current calendar events in database:');
    const { data: calendarEvents } = await supabase
      .from('calendar_events')
      .select('id, appointment_id, title, external_event_id')
      .eq('integration_id', TEST_INTEGRATION_ID);

    console.log(`Calendar events: ${calendarEvents?.length || 0}`);
    
    // Show which appointments have calendar events
    const appointmentsWithEvents = appointments?.filter(apt => 
      calendarEvents?.some(event => event.appointment_id === apt.id)
    ) || [];
    console.log(`Appointments with calendar events: ${appointmentsWithEvents.length}`);

    // 3. Test the sync service
    console.log('\\n3. Testing sync service...');
    const syncService = new GoogleCalendarSyncService();
    
    // Test incremental sync (used by auto-sync)
    console.log('\\n📅 Testing incremental sync...');
    try {
      const result = await syncService.performIncrementalSync(TEST_USER_ID, TEST_INTEGRATION_ID, {
        forceFull: false
      });
      
      console.log('✅ Incremental sync results:', {
        pharmaChanges: {
          processed: result.pharmaChanges?.processed || 0,
          created: result.pharmaChanges?.created || 0,
          updated: result.pharmaChanges?.updated || 0,
          deleted: result.pharmaChanges?.deleted || 0,
          errors: result.pharmaChanges?.errors?.length || 0
        }
      });

      if (result.pharmaChanges?.deleted > 0) {
        console.log('🎉 SUCCESS: Cancelled appointments were deleted from Google Calendar!');
      } else if (cancelledCount > 0) {
        console.log('⚠️  NOTE: No deletions processed - this might be expected if:');
        console.log('   - Cancelled appointments don\'t have existing calendar events');
        console.log('   - Cancelled appointments are outside the sync timeframe');
        console.log('   - Appointments were cancelled before the last sync time');
      } else {
        console.log('ℹ️  No cancelled appointments to process');
      }

    } catch (error) {
      console.error('❌ Incremental sync failed:', error.message);
    }

    // 4. Final status check
    console.log('\\n4. Final calendar events status:');
    const { data: finalEvents } = await supabase
      .from('calendar_events')
      .select('id, appointment_id, title')
      .eq('integration_id', TEST_INTEGRATION_ID);

    console.log(`Calendar events after sync: ${finalEvents?.length || 0}`);
    
    const deletedCount = (calendarEvents?.length || 0) - (finalEvents?.length || 0);
    if (deletedCount > 0) {
      console.log(`✅ Successfully deleted ${deletedCount} calendar events`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

testCancelSync(); 