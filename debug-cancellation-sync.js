const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './server/.env' });

const AutoSyncService = require('./server/src/services/autoSyncService.js');

async function debugCancellationSync() {
    console.log('🧪 Debug: Cancellation Sync Process');
    console.log('=====================================');
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    try {
        // 1. Look for any appointment that can be tested (confirmed/scheduled)
        console.log('\n📋 Step 1: Finding testable appointments...');
        const { data: testableAppointments, error } = await supabase
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
            .in('status', ['scheduled', 'confirmed'])
            .not('timeslot_id', 'is', null)
            .limit(10);

        if (error) throw error;
        
        console.log(`   Found ${testableAppointments.length} testable appointments`);
        
        if (testableAppointments.length === 0) {
            console.log('❌ No testable appointments found');
            return;
        }

        // 2. Show appointments with their calendar event status
        console.log('\n📋 Step 2: Checking calendar events for appointments:');
        for (const appointment of testableAppointments) {
            const { data: calendarEvents } = await supabase
                .from('calendar_events')
                .select('*')
                .eq('appointment_id', appointment.id);
                
            console.log(`   ${appointment.id}: ${appointment.status} | Events: ${calendarEvents.length}`);
            console.log(`     - Purpose: ${appointment.purpose}`);
            console.log(`     - Date: ${appointment.timeslot?.date} ${appointment.timeslot?.start_time}`);
            
            if (calendarEvents.length > 0) {
                calendarEvents.forEach(event => {
                    console.log(`     - Calendar Event: ${event.external_event_id} (${event.title})`);
                });
            }
        }

        // 3. Check for cancelled appointments
        console.log('\n❌ Step 3: Finding cancelled appointments...');
        const { data: cancelledAppointments } = await supabase
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
            .eq('status', 'cancelled')
            .not('timeslot_id', 'is', null)
            .limit(5);

        console.log(`   Found ${cancelledAppointments.length} cancelled appointments`);
        
        for (const appointment of cancelledAppointments) {
            const { data: calendarEvents } = await supabase
                .from('calendar_events')
                .select('*')
                .eq('appointment_id', appointment.id);
                
            console.log(`   ${appointment.id}: CANCELLED | Events: ${calendarEvents.length}`);
            console.log(`     - Purpose: ${appointment.purpose}`);
            console.log(`     - Cancelled at: ${appointment.cancelled_at}`);
            
            if (calendarEvents.length > 0) {
                calendarEvents.forEach(event => {
                    console.log(`     - Calendar Event: ${event.external_event_id}`);
                    console.log(`       Title: ${event.title}`);
                    console.log(`       Sync Status: ${event.sync_status}`);
                });
            }
        }

        // 4. Test auto-sync service for cancelled appointments
        console.log('\n🔄 Step 4: Testing auto-sync for cancelled appointments...');
        
        if (cancelledAppointments.length > 0) {
            const testAppointment = cancelledAppointments[0];
            console.log(`   Testing with appointment: ${testAppointment.id}`);
            
            const autoSyncService = new AutoSyncService();
            
            try {
                console.log(`   🚀 Triggering auto-sync...`);
                const syncResult = await autoSyncService.triggerAppointmentSync(testAppointment.id, 'cancelled');
                
                console.log(`   📊 Auto-sync result:`, {
                    success: syncResult.success,
                    totalSyncs: syncResult.results?.length || 0,
                    successful: syncResult.results?.filter(r => r.success)?.length || 0,
                    failed: syncResult.results?.filter(r => !r.success)?.length || 0
                });

                // Check if calendar event was updated
                const { data: updatedCalendarEvents } = await supabase
                    .from('calendar_events')
                    .select('*')
                    .eq('appointment_id', testAppointment.id);
                
                console.log(`   📅 Calendar events after sync:`);
                updatedCalendarEvents.forEach(event => {
                    console.log(`     - ${event.external_event_id}: ${event.title}`);
                    console.log(`       Last synced: ${event.last_synced_at}`);
                });

            } catch (error) {
                console.error(`   ❌ Auto-sync failed:`, error.message);
            }
        }

        // 5. Check user integrations
        console.log('\n🔗 Step 5: Checking user integrations...');
        const { data: integrations } = await supabase
            .from('user_integrations')
            .select(`
                *,
                user:users!user_id (
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .eq('provider', 'google-calendar')
            .eq('status', 'connected');

        console.log(`   Found ${integrations.length} connected Google Calendar integrations:`);
        integrations.forEach(integration => {
            console.log(`     - User: ${integration.user.email}`);
            console.log(`       Integration ID: ${integration.id}`);
            console.log(`       Auto-sync: ${integration.auto_sync ? 'ENABLED' : 'DISABLED'}`);
            console.log(`       Last sync: ${integration.last_sync_at || 'NEVER'}`);
        });

        console.log('\n✅ Debug Complete');
        console.log('=================');
        console.log('🔍 Key things to check:');
        console.log('   1. Are cancelled appointments showing [CANCELLED] in their calendar event titles?');
        console.log('   2. Is auto-sync enabled for the user integrations?');
        console.log('   3. Are there any errors in the sync process?');
        console.log('   4. Check your Google Calendar to see if events are marked as cancelled vs deleted');

    } catch (error) {
        console.error('❌ Debug error:', error);
    }
}

// Run the debug
debugCancellationSync(); 