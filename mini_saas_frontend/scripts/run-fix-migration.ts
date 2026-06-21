import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('Checking outbox column types...')

  // Step 1: Create a temporary SQL executor function
  const { error: createFnErr } = await supabase.rpc('exec_sql', { sql: '' }).single()
  if (createFnErr && createFnErr.message?.includes('function "exec_sql" does not exist')) {
    // Need to create the function first via raw SQL
    console.log('Creating exec_sql function...')
    const sql = `
      CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
      RETURNS VOID
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$ BEGIN EXECUTE sql; END; $$;
    `
    const { error } = await supabase.from('_exec_sql').insert({ sql }).select().single()
    if (error) {
      console.error('Cannot create function via REST. Please run this SQL in Supabase SQL Editor:')
      console.log(sql)
      return
    }
  }

  // Step 2: Find and fix UUID columns
  const findSql = `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outbox'
      AND column_name IN ('tenant_id', 'entity_id', 'causation_id', 'correlation_id', 'idempotency_key')
      AND data_type = 'uuid'
  `

  const { data: uuidCols, error: findErr } = await supabase.from('outbox').select(findSql).limit(0)
  if (findErr) {
    console.log('Checking information_schema directly...')
  }

  if (uuidCols && uuidCols.length > 0) {
    console.log('UUID columns found:', uuidCols.map((c: any) => c.column_name).join(', '))
  }

  // Step 3: Apply the fix
  const fixSql = `
    DO $$ DECLARE col_record RECORD; BEGIN
      FOR col_record IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'outbox'
          AND column_name IN ('tenant_id', 'entity_id', 'causation_id', 'correlation_id', 'idempotency_key')
          AND data_type = 'uuid'
      LOOP
        EXECUTE format('ALTER TABLE outbox ALTER COLUMN %I TYPE TEXT', col_record.column_name);
      END LOOP;
    END $$;
  `

  const { error: fixErr } = await supabase.rpc('exec_sql', { sql: fixSql })
  if (fixErr) {
    console.error('Migration failed:', fixErr.message)
    console.log('\nPlease run this SQL manually in your Supabase SQL Editor:')
    console.log('========================================')
    console.log(fixSql)
    console.log('========================================')
    return
  }

  console.log('Migration applied successfully!')
  console.log('All UUID columns in outbox table converted to TEXT.')
}

main().catch(console.error)
