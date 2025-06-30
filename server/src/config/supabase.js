import { createClient } from '@supabase/supabase-js';

let _supabaseAdmin = null;
let _supabaseClient = null;

const initializeSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // For server-side operations
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // For client-side operations

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
    );
  }

  // Server-side client with elevated permissions
  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Client-side compatible client (for shared logic)
  _supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
};

// Lazy getters that initialize on first access
export const supabaseAdmin = () => {
  if (!_supabaseAdmin) {
    initializeSupabase();
  }
  return _supabaseAdmin;
};

export const supabaseClient = () => {
  if (!_supabaseClient) {
    initializeSupabase();
  }
  return _supabaseClient;
};

export default supabaseClient; 