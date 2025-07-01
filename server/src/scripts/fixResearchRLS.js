import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
import('dotenv').then(dotenv => dotenv.config());

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials. Please check your .env file.');
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixResearchRLS() {
  console.log('🔧 Fixing RLS policies for research sharing (resolving infinite recursion)...');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../config/fixed-research-rls.sql');
    
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL file not found: ${sqlPath}`);
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements and execute them
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.toLowerCase().includes('select ')) {
        // Skip verification queries for this script
        continue;
      }

      try {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
        await supabase.rpc('exec_sql', { sql: statement + ';' });
      } catch (error) {
        // Some errors are expected (e.g., dropping non-existent policies)
        if (error.message.includes('policy') && error.message.includes('does not exist')) {
          console.log(`ℹ️  Policy didn't exist (expected): ${error.message}`);
          continue;
        }
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        console.error(`Statement: ${statement}`);
        throw error;
      }
    }

    console.log('✅ Fixed RLS policies applied successfully!');
    console.log('🔍 Research sharing should now work without infinite recursion.');
    
    // Test the fix by attempting a simple query
    console.log('🧪 Testing research documents query...');
    const { data, error } = await supabase
      .from('research_documents')
      .select('id, title, created_at')
      .limit(5);

    if (error) {
      console.error('❌ Test query failed:', error);
    } else {
      console.log(`✅ Test query successful! Found ${data.length} documents.`);
    }

  } catch (error) {
    console.error('❌ Failed to apply fixed RLS policies:', error.message);
    console.error('📝 You may need to apply the SQL manually via Supabase dashboard.');
    process.exit(1);
  }
}

// Handle the promise properly
fixResearchRLS().catch(error => {
  console.error('❌ Script execution failed:', error);
  process.exit(1);
}); 