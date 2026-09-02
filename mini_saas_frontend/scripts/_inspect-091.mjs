import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key)

async function tryGet(table, extra = {}) {
  const { data, error } = await sb.from(table).select('*', { head: true, count: 'exact' }).limit(1)
  return { exists: !error, count: data, error: error?.message ?? null }
}

async function run() {
  console.log('URL host:', new URL(url).host.slice(0, 20) + '…')

  const tables = [
    'collection_actions',
    'whatsapp_events',
    'payment_promises',
    'payments',
    'recovery_cases',
    'recovery_outcomes',
    'invoices',
  ]
  for (const t of tables) {
    const r = await tryGet(t)
    console.log(`${t.padEnd(22)} exists=${r.exists}` + (r.count ? ` total_rows=${r.count}` : '') + (r.error ? ` err=${r.error.slice(0,60)}` : ''))
  }

  // Count orphaned whatsapp_events: recovery_attempt_id set but no matching collection_action
  // PostgREST can't do NOT EXISTS join easily; approximate by sampling distinct recovery_attempt_id.
  const { data: waIds, error: waErr } = await sb
    .from('whatsapp_events')
    .select('recovery_attempt_id')
    .not('recovery_attempt_id', 'is', null)

  const distinctIds = new Set((waIds || []).map((r) => r.recovery_attempt_id))
  console.log('\nwhatsapp_events with recovery_attempt_id (sampled first 1000):', (waIds || []).length, 'rows,', distinctIds.size, 'distinct attempt ids')

  // Check how many of those referenced actions actually exist
  let missing = 0
  if (distinctIds.size) {
    const ids = [...distinctIds]
    const { data: actions, error } = await sb.from('collection_actions').select('id').in('id', ids)
    const found = new Set((actions || []).map((a) => a.id))
    missing = ids.filter((id) => !found.has(id)).length
    console.log('referenced attempts missing from collection_actions:', missing, '/', ids.length, error ? `err=${error.message.slice(0,60)}` : '')
  }

  // payment_promises schema: does triggered_by_action_id exist?
  const { data: ppSample, error: ppErr } = await sb.from('payment_promises').select('*').limit(1)
  if (!ppErr && ppSample[0]) {
    console.log('\npayment_promises cols:', Object.keys(ppSample[0]).join(', '))
  } else if (ppErr) {
    console.log('payment_promises err:', ppErr.message.slice(0,80))
  }

  // invoices schema: does last_recovery_action_id exist?
  const { data: invSample, error: invErr } = await sb.from('invoices').select('*').limit(1)
  if (!invErr && invSample[0]) {
    console.log('invoices cols (has last_recovery_action_id?):', Object.keys(invSample[0]).includes('last_recovery_action_id'))
  } else if (invErr) console.log('invoices err:', invErr.message.slice(0,80))
}

run().catch((e) => console.error('FATAL', e))
