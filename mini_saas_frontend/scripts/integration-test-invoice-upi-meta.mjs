/**
 * Real integration test: Invoice -> UPI deep link -> Meta Cloud API reachability.
 *
 * Runs against the REAL Supabase project (NEXT_PUBLIC_SUPABASE_URL) using the
 * service-role key from .env.local (gitignored, never committed).
 *
 * What it actually verifies:
 *   1. Invoice creation writes to the real `invoices` table, including the
 *      columns added by migration 076 (recovery_stage, next_recovery_at,
 *      last_whatsapp_at) — proving the schema repair works end-to-end.
 *   2. UPI deep link: signs a token with the SAME logic as the app
 *      (src/lib/billzo/crypto.ts signUpiToken), builds the SAME upi://pay URL
 *      as src/app/api/pay/r/[token]/route.ts, then verifyUpiToken round-trips.
 *   3. Meta Cloud API: a health/reachability probe to graph.facebook.com
 *      (GET /v25.0/{phoneNumberId}) using the configured access token.
 *      This validates the token + endpoint WITHOUT sending any message to a
 *      customer (no template/spam, no real merchant contact).
 *
 * It does NOT send a WhatsApp message to any real customer. Sending would
 * require an approved template or a 24h window; that is out of scope for an
 * automated test and would risk contacting real users.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
for (const k of Object.keys(process.env)) if (env[k] === undefined) env[k] = process.env[k]

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

// exact copy of app crypto (src/lib/billzo/crypto.ts)
const UPI_SECRET = env.UPI_SIGNING_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret-change-in-prod'
function signUpiToken(p) {
  const data = Buffer.from(JSON.stringify(p)).toString('base64url')
  const sig = createHmac('sha256', UPI_SECRET).update(data).digest('hex')
  return `${data}.${sig}`
}
function verifyUpiToken(token) {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null
  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', UPI_SECRET).update(data).digest('hex')
  if (expected.length !== sig.length) return null
  try { if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null } catch { return null }
  try { return JSON.parse(Buffer.from(data, 'base64url').toString()) } catch { return null }
}

async function main() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { check('Supabase env present', false, 'missing URL or SERVICE_ROLE_KEY'); return finish() }
  check('Supabase env present', true)

  // Use PostgREST directly (Supabase REST API) with the service-role key.
  // Avoids the supabase-js RealtimeClient which needs `ws` on Node 20.
  const rest = (path, method, body) =>
    fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  const supabase = {
    from(table) {
      const base = `${url}/rest/v1/${table}`
      return {
        async insert(row) {
          const r = await fetch(base, {
            method: 'POST',
            headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify([row]),
          })
          const data = r.ok ? await r.json() : null
          return { error: r.ok ? null : (await r.json()) }
        },
        select(cols) {
          const doSingle = async (extra = '') => {
            const r = await fetch(`${base}?select=${encodeURIComponent(cols)}${extra}`, {
              headers: { apikey: key, Authorization: `Bearer ${key}` },
            })
            const arr = r.ok ? await r.json() : []
            return { data: arr[0] || null, error: r.ok ? null : (await r.json()) }
          }
          return {
            single() { return doSingle() },
            eq(col, val) { return { single: () => doSingle(`&${col}=eq.${encodeURIComponent(val)}`) } },
          }
        },
        async delete() {
          return {
            async eq(col, val) {
              const r = await fetch(`${base}?${col}=eq.${encodeURIComponent(val)}`, {
                method: 'DELETE',
                headers: { apikey: key, Authorization: `Bearer ${key}` },
              })
              return { error: r.ok ? null : (await r.json()) }
            },
          }
        },
      }
    },
  }

  // 1) Invoice creation on real DB
  const tenantId = env.TEST_TENANT_ID || 'test-tenant-001'
  const invoiceId = `itest_${Date.now()}`
  const upiId = env.TEST_UPI_ID || 'billzo@okhdfcbank'
  const amount = 500
  const now = new Date().toISOString()

  const insertRow = {
    id: invoiceId,
    tenant_id: tenantId,
    customer_id: 'itest_customer',
    customer_name: 'Integration Test Customer',
    customer_phone: env.TEST_RECIPIENT_PHONE || '9999999999',
    total: amount,
    paid_amount: 0,
    status: 'unpaid',
    due_date: now,
    created_at: now,
    updated_at: now,
    recovery_stage: 't0_soft',
    next_recovery_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    last_whatsapp_at: null,
    invoice_number: `ITEST-${Date.now()}`,
  }

  const { error: insErr } = await supabase.from('invoices').insert(insertRow)
  if (insErr) check('Invoice insert (real DB)', false, insErr.message)
  else check('Invoice insert (real DB)', true, `id=${invoiceId}, 076 cols written`)

  const { data: fetched, error: fetErr } = await supabase
    .from('invoices').select('id, recovery_stage, next_recovery_at, last_whatsapp_at, total')
    .eq('id', invoiceId).single()
  if (fetErr) check('Invoice fetch (076 cols)', false, fetErr.message)
  else check('Invoice fetch (076 cols)', true,
    `recovery_stage=${fetched.recovery_stage}, next_recovery_at=${!!fetched.next_recovery_at}, last_whatsapp_at=${fetched.last_whatsapp_at}`)

  // detect live-schema drift: migration 057 added recovery_state ENUM; is it live?
  const { data: rsCheck } = await supabase.from('invoices')
    .select('recovery_state').single().catch(() => ({ data: null }))
  const hasRecoveryState = rsCheck !== null && rsCheck !== undefined
  check('Live invoices has recovery_state (mig 057)', hasRecoveryState,
    hasRecoveryState ? 'present' : 'MISSING on live DB — migration 057 not applied; needs append-only 077')

  // Schema drift: compare live invoices columns vs what the app code expects.
  const { data: allCols } = await supabase.from('invoices').select('*').single().catch(() => ({ data: null }))
  const liveCols = allCols ? Object.keys(allCols) : []
  // Columns the application writes/reads on invoices (from code audit):
  const expectedCols = ['id','tenant_id','customer_id','customer_name','customer_phone','total','paid_amount',
    'status','due_date','created_at','updated_at','invoice_number','recovery_stage','next_recovery_at',
    'last_whatsapp_at','last_whatsapp_status','is_snoozed','snooze_until','outstanding_amount','is_disputed',
    'disputed_at','manual_interaction_at','sync_status','recovery_state','version','pdf_url','last_reminder_at',
    'reminder_count','payment_status','payment_amount','lifecycle_status','source_id','grand_total',
    'override_at','override_reason','override_send','override_warning_acked']
  const missing = expectedCols.filter(c => !liveCols.includes(c))
  check('No missing invoices columns vs app code', missing.length === 0,
    missing.length ? `LIVE DB MISSING: ${missing.join(', ')} — apply missing migrations (append-only)` : 'all expected cols present')

  // 2) UPI deep link
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
  const token = signUpiToken({ invoiceId, tenantId, amount, upiId, exp })
  const verified = verifyUpiToken(token)
  check('UPI token sign+verify round-trip', !!verified && verified.invoiceId === invoiceId && verified.amount === amount,
    verified ? `amount=${verified.amount}, upiId=${verified.upiId}` : 'verify returned null')

  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('BillZo')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Invoice ' + invoiceId)}`
  const upiOk = upiUrl.startsWith('upi://pay?pa=') && upiUrl.includes('cu=INR') && upiUrl.includes(`am=${amount.toFixed(2)}`)
  check('UPI deep link well-formed', upiOk, upiUrl)
  console.log('     UPI link:', upiUrl)

  // 3) Meta Cloud API reachability (no message sent)
  const metaToken = env.META_ACCESS_TOKEN
  const phoneNumberId = env.META_PHONE_NUMBER_ID
  if (!metaToken || !phoneNumberId) {
    check('Meta Cloud API reachable', false, 'META_ACCESS_TOKEN or META_PHONE_NUMBER_ID missing')
  } else {
    const apiVersion = 'v25.0'
    const probeUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`
    try {
      const res = await fetch(probeUrl, { headers: { Authorization: `Bearer ${metaToken}` } })
      const body = await res.json().catch(() => ({}))
      const tokenInvalid = res.status === 401 || (body && body.error && [190, 100, 200].includes(body.error.code))
      if (res.status === 200) check('Meta Cloud API reachable', true, `HTTP ${res.status} — token valid, WABA reachable`)
      else if (tokenInvalid) check('Meta Cloud API reachable', false,
        `HTTP ${res.status} — token invalid/expired. (This is the leaked token from the earlier security incident; rotate it in Meta Business Manager.) err=${JSON.stringify((body && body.error) || {}).slice(0, 160)}`)
      else check('Meta Cloud API reachable', false, `HTTP ${res.status} — ${JSON.stringify((body && body.error) || {}).slice(0, 160)}`)
    } catch (e) {
      check('Meta Cloud API reachable', false, `network error: ${e.message} (sandbox may block egress to graph.facebook.com)`)
    }
  }

  await (await supabase.from('invoices').delete()).eq('id', invoiceId)
  finish()
}

function finish() {
  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`)
  if (failed.length) { console.log('FAILURES:'); failed.forEach(f => console.log(' - ' + f.name + ': ' + f.detail)); process.exit(1) }
  else console.log('ALL INTEGRATION CHECKS PASSED.')
}

main()
