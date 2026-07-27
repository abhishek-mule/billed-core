/**
 * Controlled Meta Cloud API send test.
 * Mirrors production meta-adapter.send path:
 *   POST https://graph.facebook.com/v25.0/{phoneNumberId}/messages
 *   Authorization: Bearer {accessToken}, body: text message.
 *
 * - Creates an idempotent `meta` messaging channel for test-tenant-001 from
 *   env creds (so meta-adapter would find it).
 * - Sends a WhatsApp text containing the UPI deep link + hosted pay URL to
 *   TEST_RECIPIENT_PHONE (from .env.local — never hardcoded here).
 * - Reports the Meta message id or error. No real customer is contacted.
 */
import { createHmac } from 'node:crypto'
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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY
const TENANT_ID = env.TEST_TENANT_ID || 'test-tenant-001'
const PHONE = (env.TEST_RECIPIENT_PHONE || '').replace(/\D/g, '')
const API_VERSION = 'v25.0'

function authHeaders() {
  return { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' }
}
async function pg(method, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null }
}

async function main() {
  if (!PHONE || PHONE.length < 10) { console.log('FAIL: TEST_RECIPIENT_PHONE not set in .env.local'); process.exit(1) }
  console.log(`Recipient: ${PHONE.slice(0, 2)}xxxxx${PHONE.slice(-2)} (masked)`)

  // 1) idempotent meta channel (id must be a valid UUID)
  const channelId = 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0'
  const channel = {
    id: channelId,
    tenant_id: TENANT_ID,
    channel_type: 'whatsapp',
    provider: 'meta',
    phone_number: PHONE,
    connection_state: 'connected',
    config: {
      accessToken: env.META_ACCESS_TOKEN,
      phoneNumberId: env.META_PHONE_NUMBER_ID,
      wabaId: env.META_WABA_ID,
    },
    is_active: true,
    priority: 10,
  }
  // upsert via delete+insert (idempotent across runs)
  await pg('DELETE', `messaging_channels?id=eq.${channelId}`)
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/messaging_channels`, {
    method: 'POST', headers: { ...authHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(channel),
  })
  console.log(ins.ok ? `PASS  meta channel ready (${channelId})` : `FAIL  channel create: ${await ins.text()}`)

  // 2) UPI deep link (signed token, same as app crypto)
  const UPI_SECRET = env.UPI_SIGNING_SECRET || SERVICE_ROLE || 'dev-secret'
  const invoiceId = `meta_test_${Date.now()}`
  const upiId = env.TEST_UPI_ID || 'billzo@okhdfcbank'
  const amount = 500
  const tokenPayload = { invoiceId, tenantId: TENANT_ID, amount, upiId, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }
  const data = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')
  const sig = createHmac('sha256', UPI_SECRET).update(data).digest('hex')
  const token = `${data}.${sig}`
  const appUrl = env.APP_URL || 'http://localhost:3000'
  const payLink = `${appUrl}/pay/r/${token}`
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('BillZo')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Invoice ' + invoiceId)}`

  const message =
    `Hi, you have ₹${(amount / 100).toLocaleString('en-IN')} pending.\n` +
    `Pay securely via UPI: ${upiUri}\n` +
    `Or here: ${payLink}`

  console.log('     message body:')
  console.log('     ' + message.split('\n').join('\n     '))

  // 3) send via Meta Graph API (exact adapter path)
  const url = `https://graph.facebook.com/${API_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: PHONE,
      type: 'text',
      text: { body: message, preview_url: true },
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (res.ok && json.messages && json.messages[0]) {
    console.log(`PASS  Meta message sent. message_id=${json.messages[0].id}`)
    console.log('      (Check your WhatsApp — you should receive the UPI payment link.)')
  } else {
    console.log(`FAIL  Meta send. HTTP ${res.status}`)
    console.log('      ' + JSON.stringify(json.error || json).slice(0, 400))
    process.exit(1)
  }
}

main()
