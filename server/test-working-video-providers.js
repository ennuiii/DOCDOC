#!/usr/bin/env node

/**
 * Test script to verify working video meeting providers
 * This shows which providers work without admin consent barriers
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './src/config/supabase.js';

console.log('🧪 Testing Video Meeting Providers for Multi-Tenant SaaS\n');

async function testVideoProviders() {
  const supabase = supabaseAdmin();
  
  const results = {
    google_meet: { available: false, reason: '', adminConsentRequired: false },
    zoom: { available: false, reason: '', adminConsentRequired: false },
    microsoft_teams: { available: false, reason: '', adminConsentRequired: true }
  };

  // Test 1: Check for Google integrations
  console.log('1. 🔍 Checking Google Meet Integration...');
  try {
    const { data: googleIntegrations, error } = await supabase
      .from('integrations')
      .select('id, provider_email, status, scope')
      .eq('provider', 'google')
      .eq('status', 'connected');

    if (error) {
      results.google_meet.reason = `Database error: ${error.message}`;
    } else if (googleIntegrations && googleIntegrations.length > 0) {
      results.google_meet.available = true;
      results.google_meet.reason = `${googleIntegrations.length} connected Google account(s)`;
      console.log('   ✅ Google Meet: WORKING');
      console.log(`   📊 Connected accounts: ${googleIntegrations.length}`);
      googleIntegrations.forEach(integration => {
        console.log(`   📧 ${integration.provider_email} (${integration.status})`);
      });
    } else {
      results.google_meet.reason = 'No connected Google accounts found';
      console.log('   ⚠️  Google Meet: No connections found');
    }
  } catch (error) {
    results.google_meet.reason = `Test failed: ${error.message}`;
    console.log('   ❌ Google Meet: Test failed');
  }

  console.log('');

  // Test 2: Check for Zoom integrations  
  console.log('2. 🔍 Checking Zoom Integration...');
  try {
    const { data: zoomIntegrations, error } = await supabase
      .from('integrations')
      .select('id, provider_email, status, scope')
      .eq('provider', 'zoom')
      .eq('status', 'connected');

    if (error) {
      results.zoom.reason = `Database error: ${error.message}`;
    } else if (zoomIntegrations && zoomIntegrations.length > 0) {
      results.zoom.available = true;
      results.zoom.reason = `${zoomIntegrations.length} connected Zoom account(s)`;
      console.log('   ✅ Zoom: WORKING');
      console.log(`   📊 Connected accounts: ${zoomIntegrations.length}`);
      zoomIntegrations.forEach(integration => {
        console.log(`   📧 ${integration.provider_email} (${integration.status})`);
      });
    } else {
      results.zoom.reason = 'No connected Zoom accounts found';
      console.log('   ⚠️  Zoom: No connections found');
    }
  } catch (error) {
    results.zoom.reason = `Test failed: ${error.message}`;
    console.log('   ❌ Zoom: Test failed');
  }

  console.log('');

  // Test 3: Microsoft Teams (show the limitation)
  console.log('3. 🔍 Checking Microsoft Teams Integration...');
  try {
    const { data: msIntegrations, error } = await supabase
      .from('integrations')
      .select('id, provider_email, status, scope')
      .eq('provider', 'microsoft')
      .eq('status', 'connected');

    if (error) {
      results.microsoft_teams.reason = `Database error: ${error.message}`;
    } else if (msIntegrations && msIntegrations.length > 0) {
      results.microsoft_teams.available = true;
      results.microsoft_teams.reason = `${msIntegrations.length} connected Microsoft account(s) - BUT requires admin consent per tenant`;
      console.log('   ⚠️  Microsoft Teams: Connected but LIMITED');
      console.log(`   📊 Connected accounts: ${msIntegrations.length}`);
      console.log('   🚫 LIMITATION: Each user\'s tenant admin must grant OnlineMeetings.ReadWrite consent');
      msIntegrations.forEach(integration => {
        console.log(`   📧 ${integration.provider_email} (${integration.status})`);
      });
    } else {
      results.microsoft_teams.reason = 'No connected Microsoft accounts found';
      console.log('   ⚠️  Microsoft Teams: No connections found');
    }
  } catch (error) {
    results.microsoft_teams.reason = `Test failed: ${error.message}`;
    console.log('   ❌ Microsoft Teams: Test failed');
  }

  console.log('');
  console.log('📋 SUMMARY FOR MULTI-TENANT SAAS:');
  console.log('=====================================');
  
  const workingProviders = Object.entries(results)
    .filter(([_, config]) => config.available && !config.adminConsentRequired);
  
  const limitedProviders = Object.entries(results)
    .filter(([_, config]) => config.available && config.adminConsentRequired);

  if (workingProviders.length > 0) {
    console.log('✅ READY TO USE (No admin consent required):');
    workingProviders.forEach(([provider, config]) => {
      console.log(`   • ${provider.toUpperCase()}: ${config.reason}`);
    });
  } else {
    console.log('❌ No fully working providers found');
  }

  if (limitedProviders.length > 0) {
    console.log('\\n⚠️  LIMITED USE (Requires tenant admin consent):');
    limitedProviders.forEach(([provider, config]) => {
      console.log(`   • ${provider.toUpperCase()}: ${config.reason}`);
    });
  }

  console.log('\\n💡 RECOMMENDATIONS:');
  console.log('===================');
  
  if (workingProviders.length >= 2) {
    console.log('🎯 EXCELLENT: You have multiple working providers!');
    console.log('   → Focus on Google Meet + Zoom for maximum coverage');
    console.log('   → Consider Teams only for enterprise customers');
  } else if (workingProviders.length === 1) {
    console.log('🆗 GOOD: You have one working provider');
    console.log('   → Consider adding more providers for redundancy');
  } else {
    console.log('⚠️  NEEDS WORK: Set up Google Meet or Zoom integration');
    console.log('   → These work immediately without admin consent');
  }

  console.log('\\n📚 NEXT STEPS:');
  console.log('==============');
  console.log('1. ✅ Keep Google Meet (works great for consumers)');
  console.log('2. ✅ Keep Zoom (works great for business users)');
  console.log('3. ⚠️  Use Teams only for enterprise customers who can get admin consent');
  console.log('4. 🤔 Consider WebRTC only if you need custom features');

  return results;
}

// Run the test
testVideoProviders()
  .then(results => {
    console.log('\\n🏁 Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\\n💥 Test failed:', error.message);
    process.exit(1);
  }); 