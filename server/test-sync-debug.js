import fetch from 'node-fetch';

async function testMicrosoftSync() {
  try {
    console.log('🔄 Testing Microsoft sync endpoint...');
    
    // Get the user ID from environment or use the known one
    const userId = '7e66363e-2e1f-4805-a748-e0278e767007';
    
    console.log('📡 Calling sync endpoint with user ID:', userId);
    
    const response = await fetch('http://localhost:5000/api/integrations/microsoft/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });
    
    const responseText = await response.text();
    
    console.log('📡 Sync response status:', response.status);
    console.log('📡 Sync response headers:', Object.fromEntries(response.headers.entries()));
    console.log('📡 Sync response body:', responseText);
    
    if (response.ok) {
      console.log('✅ Sync completed successfully');
      console.log('💡 Check the server logs for detailed Microsoft sync debug info');
    } else {
      console.log('❌ Sync failed');
    }
    
  } catch (error) {
    console.error('❌ Error testing sync:', error.message);
  }
}

testMicrosoftSync(); 