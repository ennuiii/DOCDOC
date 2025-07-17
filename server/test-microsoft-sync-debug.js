#!/usr/bin/env node

/**
 * Microsoft Sync Debug Test Script
 * Tests the import and basic instantiation of Microsoft sync services
 */

console.log('🔍 [TEST] Starting Microsoft Sync Debug Test...');

async function testMicrosoftSyncImports() {
  try {
    console.log('🔍 [TEST] Testing import statements...');
    
    // Test Microsoft OAuth Provider import
    console.log('🔍 [TEST] Importing MicrosoftOAuthProvider...');
    const MicrosoftOAuthProvider = (await import('./src/integrations/providers/microsoft/MicrosoftOAuthProvider.js')).default;
    console.log('✅ [TEST] MicrosoftOAuthProvider imported successfully');
    
    // Test Outlook Calendar Sync Service import
    console.log('🔍 [TEST] Importing OutlookCalendarSyncService...');
    const OutlookCalendarSyncService = (await import('./src/integrations/services/OutlookCalendarSyncService.js')).default;
    console.log('✅ [TEST] OutlookCalendarSyncService imported successfully');
    
    // Test Microsoft Graph Webhook Service import
    console.log('🔍 [TEST] Importing MicrosoftGraphWebhookService...');
    const { MicrosoftGraphWebhookService } = await import('./src/integrations/services/MicrosoftGraphWebhookService.js');
    console.log('✅ [TEST] MicrosoftGraphWebhookService imported successfully');
    
    console.log('🔍 [TEST] Testing service instantiation...');
    
    // Test OAuth Provider instantiation
    console.log('🔍 [TEST] Creating MicrosoftOAuthProvider instance...');
    const oauthProvider = new MicrosoftOAuthProvider();
    console.log('✅ [TEST] MicrosoftOAuthProvider instance created');
    console.log('🔍 [TEST] OAuth Provider details:', {
      providerId: oauthProvider.providerId,
      providerName: oauthProvider.providerName,
      baseUrl: oauthProvider.baseUrl,
      scopesCount: oauthProvider.scopes?.length || 0
    });
    
    // Test Sync Service instantiation
    console.log('🔍 [TEST] Creating OutlookCalendarSyncService instance...');
    const syncService = new OutlookCalendarSyncService();
    console.log('✅ [TEST] OutlookCalendarSyncService instance created');
    console.log('🔍 [TEST] Sync Service details:', {
      graphUrl: syncService.graphUrl,
      betaGraphUrl: syncService.betaGraphUrl,
      hasSyncStates: syncService.syncStates instanceof Map,
      hasSyncIntervals: syncService.syncIntervals instanceof Map
    });
    
    // Test Webhook Service instantiation
    console.log('🔍 [TEST] Creating MicrosoftGraphWebhookService instance...');
    const webhookService = new MicrosoftGraphWebhookService();
    console.log('✅ [TEST] MicrosoftGraphWebhookService instance created');
    console.log('🔍 [TEST] Webhook Service details:', {
      graphUrl: webhookService.graphUrl,
      betaGraphUrl: webhookService.betaGraphUrl,
      hasActiveSubscriptions: webhookService.activeSubscriptions instanceof Map
    });
    
    console.log('✅ [TEST] All Microsoft sync services imported and instantiated successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ [TEST] Microsoft sync test failed:', {
      message: error.message,
      stack: error.stack
    });
    return false;
  }
}

async function testEnvironmentVariables() {
  console.log('🔍 [TEST] Testing environment variables...');
  
  const envChecks = {
    MICROSOFT_CLIENT_ID: !!process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: !!process.env.MICROSOFT_CLIENT_SECRET,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV || 'not set'
  };
  
  console.log('🔍 [TEST] Environment variables status:', envChecks);
  
  const requiredVars = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn('⚠️ [TEST] Missing environment variables:', missingVars);
    console.warn('⚠️ [TEST] Microsoft sync may not work properly without these variables');
    return false;
  } else {
    console.log('✅ [TEST] All required environment variables are present');
    return true;
  }
}

async function runTests() {
  console.log('🔍 [TEST] =================================');
  console.log('🔍 [TEST] MICROSOFT SYNC DEBUG TEST SUITE');
  console.log('🔍 [TEST] =================================');
  
  const envTest = await testEnvironmentVariables();
  const importTest = await testMicrosoftSyncImports();
  
  console.log('🔍 [TEST] =================================');
  console.log('🔍 [TEST] TEST RESULTS SUMMARY');
  console.log('🔍 [TEST] =================================');
  console.log('🔍 [TEST] Environment variables:', envTest ? '✅ PASS' : '❌ FAIL');
  console.log('🔍 [TEST] Import and instantiation:', importTest ? '✅ PASS' : '❌ FAIL');
  
  if (envTest && importTest) {
    console.log('🎉 [TEST] All tests passed! Microsoft sync should work correctly.');
    process.exit(0);
  } else {
    console.log('❌ [TEST] Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [TEST] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
runTests().catch(error => {
  console.error('❌ [TEST] Test suite failed:', error);
  process.exit(1);
}); 