import { supabaseAdmin } from './src/config/supabase.js';
import { readFileSync } from 'fs';

async function applyMigration() {
  try {
    console.log('🔄 Starting database migration...');
    
    const supabase = supabaseAdmin();
    
    // Execute each SQL statement separately
    const migrations = [
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_by_id UUID REFERENCES users(id);`,
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_by_id UUID REFERENCES users(id);`,
      `CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_by ON appointments(confirmed_by_id);`,
      `CREATE INDEX IF NOT EXISTS idx_appointments_completed_by ON appointments(completed_by_id);`,
      `CREATE INDEX IF NOT EXISTS idx_appointments_cancelled_by ON appointments(cancelled_by_id);`
    ];
    
    for (const sql of migrations) {
      console.log('Executing:', sql);
      const { data, error } = await supabase.rpc('exec', { sql });
      
      if (error) {
        console.error('❌ Error executing SQL:', error);
        // Continue with other statements even if one fails
      } else {
        console.log('✅ SQL executed successfully');
      }
    }
    
    console.log('🎉 Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration(); 