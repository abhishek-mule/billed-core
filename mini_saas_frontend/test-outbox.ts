import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('Supabase URL:', supabaseUrl)
  console.log('Key (first 20):', supabaseKey.substring(0, 20) + '...')

  // Test 1: Check if outbox table exists
  console.log('\n--- Test 1: Check outbox table columns ---')
  const { data: cols, error: colsErr } = await supabase
    .from('outbox')
    .select('*')
    .limit(1)
  if (colsErr) {
    console.error('ERROR:', colsErr.message)
    console.error('Details:', JSON.stringify(colsErr, null, 2))
  } else {
    console.log('Columns found:', cols ? Object.keys(cols[0] || {}).join(', ') : 'no rows')
  }

  // Test 2: Try inserting a whatsapp.pair.requested event
  console.log('\n--- Test 2: Insert outbox event ---')
  const { data, error } = await supabase
    .from('outbox')
    .insert({
      type: 'whatsapp.pair.requested',
      tenant_id: 'test-tenant',
      entity_id: null,
      payload: {},
      causation_id: null,
      correlation_id: `pair:test:${Date.now()}`,
      idempotency_key: `whatsapp:pair:test-tenant:${Date.now()}`,
      version: 1,
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      attempts: 0,
    })
    .select('id')

  if (error) {
    console.error('INSERT ERROR:', error.message)
    console.error('Details:', JSON.stringify(error, null, 2))
  } else {
    console.log('SUCCESS! Inserted event id:', data?.[0]?.id)
  }
}

main().catch(console.error)
