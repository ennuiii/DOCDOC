#!/usr/bin/env node

/**
 * Zoom Integration Debug Script
 * 
 * This script helps debug Zoom OAuth integration by:
 * 1. Checking environment variables
 * 2. Testing ZoomOAuthProvider initialization
 * 3. Generating test OAuth URLs
 * 4. Validating configuration
 */

import dotenv from 'dotenv';
import ZoomOAuthProvider from './src/integrations/providers/zoom/ZoomOAuthProvider.js';

// Load environment variables
dotenv.config();

console.log('🔍 ========== ZOOM INTEGRATION DEBUG SCRIPT ==========');
console.log('🔍 Starting Zoom integration diagnostic...\n');

// 1. Check Environment Variables
console.log('📋 STEP 1: Environment Variables Check');
console.log('=====================================');

const requiredEnvVars = [
    'ZOOM_CLIENT_ID',
    'ZOOM_CLIENT_SECRET', 
    'ZOOM_REDIRECT_URI',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
];

const missingVars = [];
const presentVars = [];

requiredEnvVars.forEach(varName => {
    if (process.env[varName]) {
        presentVars.push(varName);
        if (varName.includes('SECRET') || varName.includes('KEY')) {
            console.log(`✅ ${varName}: SET (hidden for security)`);
        } else {
            console.log(`✅ ${varName}: ${process.env[varName]}`);
        }
    } else {
        missingVars.push(varName);
        console.log(`❌ ${varName}: NOT SET`);
    }
});

console.log(`\n📊 Summary: ${presentVars.length}/${requiredEnvVars.length} required variables set`);

if (missingVars.length > 0) {
    console.log(`❌ Missing variables: ${missingVars.join(', ')}`);
    console.log('\n🔧 To fix this:');
    console.log('1. Create a .env file in your project root');
    console.log('2. Add the missing variables:');
    missingVars.forEach(varName => {
        console.log(`   ${varName}=your_${varName.toLowerCase()}_here`);
    });
    console.log('\n📖 See ZOOM_INTEGRATION_SETUP.md for detailed instructions');
    process.exit(1);
}

// 2. Test ZoomOAuthProvider Initialization
console.log('\n🔧 STEP 2: ZoomOAuthProvider Initialization Test');
console.log('===============================================');

let zoomProvider;
try {
    console.log('🔍 Attempting to initialize ZoomOAuthProvider...');
    zoomProvider = new ZoomOAuthProvider();
    console.log('✅ ZoomOAuthProvider initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize ZoomOAuthProvider:', error.message);
    console.error('💡 This usually indicates missing or invalid environment variables');
    process.exit(1);
}

// 3. Test OAuth URL Generation
console.log('\n🌐 STEP 3: OAuth URL Generation Test');
console.log('===================================');

try {
    console.log('🔍 Generating test OAuth URL...');
    
    const testUserId = 'test-user-123';
    const testScopes = ['meeting:write', 'meeting:read', 'user:read'];
    
    const authResult = zoomProvider.generateAuthUrl(testUserId, testScopes);
    
    console.log('✅ OAuth URL generated successfully');
    console.log('\n📋 OAuth URL Details:');
    console.log('====================');
    console.log(`🔗 Auth URL: ${authResult.authUrl}`);
    console.log(`🔐 State Preview: ${authResult.state.substring(0, 20)}...`);
    console.log(`📋 Scopes: ${authResult.scopes.join(', ')}`);
    
    // Parse URL to show components
    const url = new URL(authResult.authUrl);
    console.log('\n🔍 URL Components:');
    console.log('==================');
    console.log(`🌐 Base URL: ${url.origin}${url.pathname}`);
    console.log(`🔑 Client ID: ${url.searchParams.get('client_id')}`);
    console.log(`🔄 Redirect URI: ${url.searchParams.get('redirect_uri')}`);
    console.log(`📋 Scope: ${url.searchParams.get('scope')}`);
    console.log(`🔐 State: ${url.searchParams.get('state')?.substring(0, 20)}...`);
    console.log(`📝 Response Type: ${url.searchParams.get('response_type')}`);
    
} catch (error) {
    console.error('❌ Failed to generate OAuth URL:', error.message);
    console.error('📍 Stack trace:', error.stack);
    process.exit(1);
}

// 4. Validation Summary
console.log('\n✅ STEP 4: Validation Summary');
console.log('=============================');
console.log('🎉 All Zoom integration components are working correctly!');
console.log('\n🚀 Next Steps:');
console.log('1. Visit http://localhost:3000/integrations');
console.log('2. Click "Connect Zoom"');
console.log('3. Check server logs for detailed debug information');
console.log('4. Sign in to your Zoom account when redirected');
console.log('5. Grant permissions to PharmaDOC');
console.log('\n📝 Debug Logging:');
console.log('- Look for 🔍 [ZOOM DEBUG] messages in server logs');
console.log('- OAuth flow errors will show as ❌ [ZOOM ERROR] messages');
console.log('- Callback details will show in ========== ZOOM OAUTH CALLBACK ==========');

console.log('\n🔍 ========== DEBUG SCRIPT COMPLETED =========='); 