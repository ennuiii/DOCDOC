const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyResearchRLS() {
  console.log('🔒 Applying improved RLS policies for research sharing...');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../config/improved-research-rls.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
      .filter(stmt => !stmt.startsWith('SELECT')) // Skip verification queries for now
      .filter(stmt => stmt !== "SELECT 'Improved RLS policies created for research sharing!' as \"Status\"");

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`📋 Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { 
          sql_query: statement + ';' 
        });
        
        if (error) {
          console.warn(`⚠️ Warning for statement ${i + 1}:`, error.message);
          // Continue with other statements even if one fails
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.warn(`⚠️ Error executing statement ${i + 1}:`, err.message);
        // Continue with other statements
      }
    }

    // Verify the policies were created
    console.log('\n🔍 Verifying RLS policies...');
    
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('tablename, policyname, cmd')
      .in('tablename', ['research_documents', 'research_shares']);

    if (policiesError) {
      console.error('❌ Error fetching policies:', policiesError);
    } else {
      console.log('\n📋 Current RLS policies:');
      policies.forEach(policy => {
        console.log(`  ${policy.tablename}.${policy.policyname} (${policy.cmd})`);
      });
    }

    console.log('\n✅ RLS policies update completed!');
    console.log('🔄 Please test the research sharing functionality now.');

  } catch (error) {
    console.error('❌ Error applying RLS policies:', error);
  }
}

// Alternative approach using direct SQL execution
async function applyRLSAlternative() {
  console.log('🔄 Trying alternative approach...');
  
  const queries = [
    // Drop existing policies
    `DROP POLICY IF EXISTS "research_documents_owner_full_access" ON research_documents`,
    `DROP POLICY IF EXISTS "research_documents_public_read" ON research_documents`,
    `DROP POLICY IF EXISTS "research_shares_insert_by_owner" ON research_shares`,
    `DROP POLICY IF EXISTS "research_shares_owner_select" ON research_shares`,
    
    // Create new policies
    `CREATE POLICY "research_documents_owner_access" ON research_documents 
     FOR ALL USING (uploaded_by_id = auth.uid())`,
    
    `CREATE POLICY "research_documents_public_view" ON research_documents 
     FOR SELECT USING (is_public = true)`,
    
    `CREATE POLICY "research_shares_doctor_view" ON research_shares 
     FOR SELECT USING (doctor_id = auth.uid())`,
     
    `CREATE POLICY "research_shares_pharma_manage" ON research_shares 
     FOR ALL USING (
       auth.uid() IN (
         SELECT uploaded_by_id 
         FROM research_documents 
         WHERE id = research_id
       )
     )`
  ];

  for (let i = 0; i < queries.length; i++) {
    try {
      console.log(`📋 Executing query ${i + 1}/${queries.length}...`);
      
      // Use direct SQL execution
      const { error } = await supabase.rpc('exec_sql', { 
        sql_query: queries[i] 
      });
      
      if (error) {
        console.warn(`⚠️ Warning for query ${i + 1}:`, error.message);
      } else {
        console.log(`✅ Query ${i + 1} executed successfully`);
      }
    } catch (err) {
      console.warn(`⚠️ Error executing query ${i + 1}:`, err.message);
    }
  }
}

// Run the script
async function main() {
  console.log('🚀 Starting RLS policy update for research sharing...\n');
  
  try {
    await applyRLSAlternative();
  } catch (error) {
    console.error('❌ Failed to apply RLS policies:', error);
  }
  
  process.exit(0);
}

main(); 