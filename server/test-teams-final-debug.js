import { supabaseAdmin } from './src/config/supabase.js';
import axios from 'axios';

async function testMicrosoftIntegration() {
  console.log('🔍 Testing Microsoft Integration...\n');

  try {
    const supabase = supabaseAdmin();
    
    // 1. Check for ANY Microsoft integrations (regardless of status)
    console.log('1. 📋 Checking ALL Microsoft integrations...');
    const { data: allIntegrations, error } = await supabase
      .from('integrations')
      .select('id, provider_email, scope, status, access_token, created_at, updated_at')
      .eq('provider', 'microsoft')
      .order('updated_at', { ascending: false });

    if (error) {
      console.log('❌ Database error:', error.message);
      return;
    }

    console.log(`📊 Found ${allIntegrations.length} Microsoft integration(s)`);
    
    if (allIntegrations.length === 0) {
      console.log('❌ No Microsoft integrations found at all!');
      console.log('🔍 This suggests the reconnection may have failed or data wasn\'t saved properly');
      return;
    }

    // Show all integrations
    allIntegrations.forEach((integration, index) => {
      console.log(`\n📋 Integration ${index + 1}:`);
      console.log(`   🆔 ID: ${integration.id}`);
      console.log(`   📧 Email: ${integration.provider_email}`);
      console.log(`   🔐 Scopes: ${integration.scope}`);
      console.log(`   📊 Status: ${integration.status}`);
      console.log(`   🕐 Created: ${integration.created_at}`);
      console.log(`   🕐 Updated: ${integration.updated_at}`);
      console.log(`   🎫 Token length: ${integration.access_token?.length || 0}`);
    });

    // Find the most recent connected one
    const connectedIntegration = allIntegrations.find(i => i.status === 'connected');
    
    if (!connectedIntegration) {
      console.log('\n❌ No CONNECTED Microsoft integrations found!');
      console.log('🔍 All integrations have non-connected status');
      return;
    }

    const integration = connectedIntegration;
    console.log(`\n✅ Using connected integration for: ${integration.provider_email}`);

    // 2. Decode JWT token
    console.log('\n2. 🎫 Decoding JWT token...');
    try {
      const tokenParts = integration.access_token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        console.log(`✅ Token issued for: ${payload.upn || payload.email}`);
        console.log(`🆔 App ID (aud): ${payload.aud}`);
        console.log(`🔐 Token scopes (scp): ${payload.scp}`);
        console.log(`⏰ Issued at: ${new Date(payload.iat * 1000).toISOString()}`);
        console.log(`⏰ Expires at: ${new Date(payload.exp * 1000).toISOString()}`);
        
        // Check if token is expired
        const now = Date.now() / 1000;
        if (payload.exp < now) {
          console.log('❌ Token is EXPIRED!');
          return;
        } else {
          console.log('✅ Token is still valid');
        }
      }
    } catch (e) {
      console.log(`❌ Could not decode token: ${e.message}`);
      return;
    }

    // 3. Test basic Graph API call (user profile)
    console.log('\n3. 👤 Testing basic Graph API call (user profile)...');
    try {
      const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`✅ User profile retrieved: ${userResponse.data.userPrincipalName}`);
    } catch (e) {
      console.log(`❌ User profile failed: ${e.response?.status} ${e.response?.statusText}`);
      console.log(`❌ Error: ${JSON.stringify(e.response?.data)}`);
      return;
    }

    // 4. Test OnlineMeetings permission specifically
    console.log('\n4. 🎥 Testing OnlineMeetings API access...');
    try {
      // First try to list existing meetings (less intrusive than creating)
      const meetingsResponse = await axios.get('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`✅ OnlineMeetings API accessible! Found ${meetingsResponse.data.value?.length || 0} meetings`);
    } catch (e) {
      console.log(`❌ OnlineMeetings API failed: ${e.response?.status} ${e.response?.statusText}`);
      console.log(`❌ Error: ${JSON.stringify(e.response?.data)}`);
      
      if (e.response?.data?.error?.code === 'Forbidden') {
        console.log('\n🔍 DIAGNOSIS: Permission issue - the OnlineMeetings.ReadWrite permission is not properly configured or consented in Azure');
      } else if (e.response?.data?.error?.code === 'AuthenticationError') {
        console.log('\n🔍 DIAGNOSIS: Authentication issue - there might be a problem with the Azure App Registration configuration');
      }
      return;
    }

    // 5. Try creating a test Teams meeting
    console.log('\n5. 🚀 Testing Teams meeting creation...');
    const meetingData = {
      subject: 'Test Teams Meeting - Debug',
      startTime: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      endTime: new Date(Date.now() + 120000).toISOString(),  // 2 minutes from now
      participants: {
        organizer: {
          upn: integration.provider_email
        }
      }
    };

    try {
      const createResponse = await axios.post('https://graph.microsoft.com/v1.0/me/onlineMeetings', meetingData, {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`✅ Teams meeting created successfully!`);
      console.log(`🔗 Join URL: ${createResponse.data.joinWebUrl}`);
      console.log(`🆔 Meeting ID: ${createResponse.data.id}`);
    } catch (e) {
      console.log(`❌ Teams meeting creation failed: ${e.response?.status} ${e.response?.statusText}`);
      console.log(`❌ Error: ${JSON.stringify(e.response?.data)}`);
      
      // Provide specific diagnosis
      if (e.response?.data?.error?.code === 'AuthenticationError') {
        console.log('\n🔍 DIAGNOSIS: This suggests the Azure App Registration is missing proper OnlineMeetings.ReadWrite permission or admin consent');
        console.log('\n📋 SOLUTION STEPS:');
        console.log('1. Go to Azure Portal → App Registrations → Your App');
        console.log('2. Click "API Permissions"');
        console.log('3. Ensure "OnlineMeetings.ReadWrite" is listed as DELEGATED permission');
        console.log('4. Click "Grant admin consent" button');
        console.log('5. Reconnect the Microsoft integration in PharmaDOC');
      }
    }

  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }
}

testMicrosoftIntegration().catch(console.error); 