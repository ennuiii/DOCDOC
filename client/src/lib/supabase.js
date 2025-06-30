import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug environment variables
console.log('🔧 Supabase Environment Debug:');
console.log('URL:', supabaseUrl);
console.log('Key (first 20 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + '...' : 'undefined');
console.log('All VITE env vars:', Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')));

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('Available env vars:', import.meta.env);
  throw new Error(
    'Missing Supabase environment variables. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

export default supabase; 