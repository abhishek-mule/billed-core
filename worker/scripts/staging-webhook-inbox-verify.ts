// ============================================================
// staging-webhook-inbox-verify.ts
// STAGING-ONLY end-to-end validation for the G1/G2 webhook inbox
// (migration 100) + the real worker consumer (Step 6 gate).
//
// Run with explicit STAGING_* variables (never DATABASE_URL/prod .env):
//   STAGING_WEBHOOK_VALIDATION=1   tripwire — confirms "staging only"
//   STAGING_DATABASE_URL           → staging Postgres (pooler or direct)
//   STAGING_SUPABASE_URL           → staging Supabase project
//   STAGING_SERVICE_ROLE_KEY       → staging service-role key
//
//   STAGING_WEBHOOK_VALIDATION=1 \
//   STAGING_DATABASE_URL=...       \
//   STAGING_SUPABASE_URL=...       \
//   STAGING_SERVICE_ROLE_KEY=...   \
//   pnpm --filter billzo-worker staging:webhook-inbox
//
// The script NEVER reads DATABASE_URL/AUTHORITY_DATABASE_URL directly and
// refuses to touch the known production Supabase host. It makes a REAL staging
// webhook event enter the inbox with the REAL route ingestion path
// (normalizePayload -> sanitizeRaw -> buildInboxRows -> upsert), and drives it
// through the REAL worker consumer against the REAL staging database:
//
//   queued → claim+lease → processing
//     ├── success                         → done   (real processor reaches the
//     │                                       shared WhatsApp domain: pilot_events
//     │                                       + whatsapp_events + recovery_outcomes)
//     └── failure (deterministic)         → retry with exponential backoff
//            ├── attempts < 6 → queued + available_at (lease/backoff honored)
//            └── attempts = 6 → dead  → manual requeue → queued → claim → done
//
// Plus: duplicate provider events stay deduplicated, concurrent claims never
// overlap, lease/heartbeat and expired-lease reclaim hold, tenant resolution is
// strictly phone_number_id → whatsapp_connections → tenant_id, unresolved
// tenants are recorded unattributed (never guessed), and the script verifies
// it never touched a production host.
//
// What it creates (and cleans up unless KEEP_STAGING_DATA=1): one scratch
// tenant + whatsapp_connection, and inbox/pilot/event/outcome rows all keyed
// with the `staging:wh:` prefix / scratch phone ids. Nothing else.
//
// Deliberately excluded from the worker `tsc` build (see worker/tsconfig.json):
// it imports frontend source that lives outside the worker rootDir. Run via
// ts-node --transpile-only only.
// ============================================================

// Fail closed: the explicit tripwire + STAGING_DATABASE_URL mean this can never
// be pointed at a production database by accident.
const PROD_HOST = 'qdnmuoyqpqdewepzuezp.supabase.co'
const stagingDb = process.env.STAGING_DATABASE_URL
const stagingSupabaseUrl = process.env.STAGING_SUPABASE_URL
const stagingServiceRoleKey = process.env.STAGING_SERVICE_ROLE_KEY
if (process.env.STAGING_WEBHOOK_VALIDATION !== '1') {
  console.error('Refusing to run: set STAGING_WEBHOOK_VALIDATION=1 to confirm this is a STAGING-only validation.')
  process.exit(2)
}
if (!stagingDb || !stagingSupabaseUrl || !stagingServiceRoleKey) {
  console.error('Refusing to run: set STAGING_DATABASE_URL, STAGING_SUPABASE_URL and STAGING_SERVICE_ROLE_KEY (staging-only). The script never reads the production .env.')
  process.exit(2)
}
if (stagingDb.includes(PROD_HOST) || stagingSupabaseUrl.includes(PROD_HOST)) {
  console.error('Refusing to run: resolved target is the PRODUCTION Supabase host.')
  process.exit(2)
}
// Extra guard: the staging service-role JWT must be issued for the staging ref.
function jwtRef(token: string): string | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(Buffer.from(part, 'base64').toString('utf8'))
    return typeof claims.ref === 'string' ? claims.ref : null
  } catch {
    return null
  }
}
if (!/ktmzbesuqncoctgceypu/.test(stagingDb) || jwtRef(stagingServiceRoleKey) !== 'ktmzbesuqncoctgceypu') {
  console.error('Refusing to run: staging service key / DB URL are not for the staging project ref.')
  process.exit(2)
}

import postgres from 'postgres'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { normalizePayload, buildInboxRows } from '@billzo/shared/whatsapp'
import {
  drainWebhookInboxOnce,
  requeueWebhookEvent,
  MAX_WEBHOOK_ATTEMPTS,
  WEBHOOK_BACKOFF_BASE_MS,
} from '../src/lib/webhook/inbox-drain'
import type { WebhookEventProcessor } from '../src/lib/webhook/process-webhook-event'
import { createWebhookEventProcessor } from '../src/lib/webhook/process-webhook-event'

// Alias the staging values into the vars the real adapters read at call time
// (worker supabase-admin is a lazy proxy built on first access). Runs before
// any client is built.
process.env.DATABASE_URL = stagingDb
process.env.NEXT_PUBLIC_SUPABASE_URL = stagingSupabaseUrl
process.env.SUPABASE_SERVICE_ROLE_KEY = stagingServiceRoleKey

const pg = postgres(stagingDb, { max: 4 })

const KEEP = process.env.KEEP_STAGING_DATA === '1'
const WH_PREFIX = 'staging:wh:'

const ts = Date.now()
const SCRATCH_TENANT = `scratch_webhook_${ts}_${randomUUID().slice(0, 4)}`
const SCRATCH_PHONE = `staging_phone_${ts}_${randomUUID().slice(0, 4)}`
const UNKNOWN_PHONE = `staging_unknown_${ts}_${randomUUID().slice(0, 4)}`
const CONN_ID = randomUUID()

const WH = (suffix: string) => `${WH_PREFIX}${suffix}:${ts}`

let failures = 0

function ok(step: string, detail: string) {
  console.log(`  PASS  ${step} — ${detail}`)
}
function fail(step: string, detail: string) {
  failures++
  console.error(`  FAIL  ${step} — ${detail}`)
}
function assert(cond: boolean, step: string, detail: string) {
  if (cond) ok(step, detail)
  else fail(step, detail)
}

/** Meta-shaped raw envelope for one inbound text message. */
function rawEnvelope(phoneNumberId: string, msgId: string): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba_scratch',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: 'Scratch', phone_number_id: phoneNumberId },
              messages: [
                {
                  from: '919999000001',
                  id: msgId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Staging inbox verify' },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

function inboxRowFor(phoneNumberId: string, msgId: string, raw?: unknown) {
  const events = normalizePayload(raw ?? rawEnvelope(phoneNumberId, msgId))
  return buildInboxRows(events, 'meta', raw ?? rawEnvelope(phoneNumberId, msgId))
}

/** Ingest exactly like the thin webhook route: normalize → build → upsert. */
async function ingest(msgId: string, phoneNumberId: string, raw?: unknown) {
  const rows = inboxRowFor(phoneNumberId, msgId, raw)
  const { error } = await supabaseAdmin
    .from('webhook_inbox')
    .upsert(rows, { onConflict: 'provider,provider_event_id' })
  if (error) throw new Error(`ingest upsert failed: ${error.message}`)
  return rows[0]
}

/** The real worker processor bound to the staging client. */
const realProcessor = createWebhookEventProcessor(supabaseAdmin)

async function resetTenantCleanup(): Promise<void> {
  // Order matters: inbox/breadcrumb tables first, then connection, then tenant.
  await pg`DELETE FROM webhook_inbox WHERE provider_event_id LIKE ${WH_PREFIX + '%'} OR provider_event_id LIKE 'wamid_stg_%'`
  await pg`DELETE FROM pilot_events WHERE phone_number_id = ${SCRATCH_PHONE} OR phone_number_id = ${UNKNOWN_PHONE} OR tenant_id = ${SCRATCH_TENANT}`
  await pg`DELETE FROM recovery_outcomes WHERE tenant_id = ${SCRATCH_TENANT}`
  await pg`DELETE FROM whatsapp_events WHERE tenant_id = ${SCRATCH_TENANT}`
  await pg`DELETE FROM whatsapp_connections WHERE id = ${CONN_ID}`
  await pg`DELETE FROM tenants WHERE id = ${SCRATCH_TENANT}`
}

async function main(): Promise<void> {
  console.log(`Staging webhook/inbox validation against STAGING_DATABASE_URL (STAGING ONLY)`)
  console.log(`Scratch tenant: ${SCRATCH_TENANT}`)

  try {
    // W0. Preconditions: migration 100 is applied on staging (schema + RPC).
    const tbl = await pg`SELECT to_regclass('public.webhook_inbox') AS t`
    assert(tbl[0]?.t != null, 'W0a', 'webhook_inbox table exists (migration 100 applied)')
    const fn = await pg`SELECT 1 AS ok FROM pg_proc WHERE proname = 'claim_next_webhook_events'`
    assert(fn.length === 1, 'W0b', 'claim_next_webhook_events RPC exists')

    // Scratch tenant + connection so the webhook can resolve a tenant.
    const { error: tenantErr } = await supabaseAdmin.from('tenants').insert({
      id: SCRATCH_TENANT,
      company_name: 'Scratch Webhook Validation',
      phone: '',
      email: `${SCRATCH_TENANT}@staging.invalid`,
      plan: 'pro',
      recovery_credits_enabled: true,
      subscription_state: 'active',
      is_active: true,
    })
    if (tenantErr) throw new Error(`scratch tenant insert failed: ${tenantErr.message}`)
    const { error: connErr } = await supabaseAdmin.from('whatsapp_connections').insert({
      id: CONN_ID,
      tenant_id: SCRATCH_TENANT,
      waba_id: 'waba_scratch',
      phone_number_id: SCRATCH_PHONE,
      display_name: 'Staging Scratch',
      provider: 'meta',
      status: 'connected',
    })
    if (connErr) throw new Error(`scratch whatsapp_connection insert failed: ${connErr.message}`)

    // ── W1. INGEST + DEDUPE (route-equivalent, real normalization) ──
    console.log('W1 ingest + dedupe:')
    const A_ID = `wamid_stg_${randomUUID()}`
    const rowA = await ingest(A_ID, SCRATCH_PHONE)
    const rowsAfter1 = await pg`SELECT id, status, attempts FROM webhook_inbox WHERE provider_event_id = ${A_ID}`
    assert(rowsAfter1.length === 1 && rowsAfter1[0].status === 'queued', 'W1a', 'event entered the inbox as queued (route path: normalize → build → upsert)')
    await ingest(A_ID, SCRATCH_PHONE) // replay of the same provider event
    const rowsAfter2 = await pg`SELECT id, attempts FROM webhook_inbox WHERE provider_event_id = ${A_ID}`
    assert(rowsAfter2.length === 1, 'W1b', 'duplicate provider event re-ingested → still exactly one row (uq_webhook_inbox_provider_event)')

    // ── W2. CLAIM + PROCESS → DONE (real consumer, real domain landfall) ──
    console.log('W2 claim → process → done:')
    const stats2 = await drainWebhookInboxOnce({ client: supabaseAdmin, batchSize: 25, processEvent: realProcessor })
    assert(stats2.claimed === 1 && stats2.done === 1, 'W2a', `one row claimed & done (claimed=${stats2.claimed}, done=${stats2.done})`)
    const doneRow = await pg`SELECT status, attempts, last_error FROM webhook_inbox WHERE provider_event_id = ${A_ID}`
    assert(doneRow[0].status === 'done' && doneRow[0].last_error == null, 'W2b', `row terminal done, last_error cleared (status=${doneRow[0].status})`)

    // Tenant resolution: phone_number_id → whatsapp_connections → tenant_id.
    const pilot = await pg`SELECT tenant_id, customer_id, event_kind, attribution_result FROM pilot_events WHERE provider_message_id = ${A_ID}`
    assert(
      pilot.length === 1 && pilot[0].tenant_id === SCRATCH_TENANT && pilot[0].event_kind === 'customer_replied',
      'W2c',
      `pilot_events customer_replied attributed to the resolved tenant (attribution=${pilot[0].attribution_result})`,
    )
    const wsEvent = await pg`SELECT tenant_id, direction, message_type, message_origin, provider_message_id FROM whatsapp_events WHERE provider_message_id = ${A_ID}`
    assert(
      wsEvent.length === 1 && wsEvent[0].tenant_id === SCRATCH_TENANT && wsEvent[0].direction === 'inbound',
      'W2d',
      'shared domain landfall: whatsapp_events inbound row persisted',
    )
    const outcome = await pg`SELECT tenant_id, outcome_type, attribution_status FROM recovery_outcomes WHERE provider_message_id = ${A_ID}`
    assert(
      outcome.length === 1 && outcome[0].outcome_type === 'customer_replied' && outcome[0].attribution_status === 'unknown',
      'W2e',
      'shared domain: recovery_outcomes customer_replied with honest (unverified) attribution',
    )

    // ── W3. LEASE GATING: valid lease blocks reclaim; expired lease reclaims ──
    console.log('W3 lease semantics:')
    const B_ID = `wamid_stg_${randomUUID()}`
    await ingest(B_ID, SCRATCH_PHONE)
    const claimedB = await supabaseAdmin.rpc('claim_next_webhook_events', { p_limit: 25 })
    assert(claimedB.error == null && Array.isArray(claimedB.data) && claimedB.data.length === 1, 'W3a', 'claim RPC returns the fresh row (queued → processing)')
    const bState = await pg`SELECT status, available_at FROM webhook_inbox WHERE provider_event_id = ${B_ID}`
    assert(bState[0].status === 'processing' && new Date(bState[0].available_at).getTime() > Date.now(), 'W3b', 'claimed row processing with a 5-minute lease (available_at in the future)')
    const statsNo = await drainWebhookInboxOnce({ client: supabaseAdmin, batchSize: 25, processEvent: realProcessor })
    assert(statsNo.claimed === 0, 'W3c', 'valid lease is honored — the consumer claims nothing while the row is processing')
    await pg`UPDATE webhook_inbox SET available_at = NOW() - INTERVAL '1 second' WHERE provider_event_id = ${B_ID}` // simulate a crash-timeout lease expiry
    const statsB = await drainWebhookInboxOnce({ client: supabaseAdmin, batchSize: 25, processEvent: realProcessor })
    assert(statsB.claimed === 1 && statsB.done === 1, 'W3d', 'expired lease is reclaimed and processed to done (crash recovery)')

    // ── W4. UNATTRIBUTED: unknown phone_number_id → never guessed ──
    console.log('W4 unattributed safety:')
    const U_ID = `wamid_stg_${randomUUID()}`
    await ingest(U_ID, UNKNOWN_PHONE)
    const statsU = await drainWebhookInboxOnce({ client: supabaseAdmin, batchSize: 25, processEvent: realProcessor })
    assert(statsU.done === 1, 'W4a', 'unattributed event still acks (done) — no domain guess, no throw')
    const unattr = await pg`SELECT tenant_id, event_kind, attribution_result, phone_number_id FROM pilot_events WHERE provider_message_id = ${U_ID}`
    assert(
      unattr.length === 1 && unattr[0].tenant_id == null && unattr[0].event_kind === 'unattributed_webhook' && unattr[0].attribution_result === 'unattributed',
      'W4b',
      'pilot_events unattributed_webhook with tenant_id NULL — the consumer never guesses the tenant',
    )

    // ── W5. FAILURE → RETRY/BACKOFF → DEAD → MANUAL REQUEUE (real G2) ──
    console.log('W5 G2 retry/dead/requeue lifecycle:')
    const F_ID = `wamid_stg_fail_${randomUUID()}`
    const failProcessor: WebhookEventProcessor = async (ev, raw) => {
      if (ev.messages?.[0]?.id === F_ID) throw new Error('staging:wh:deterministic-failure')
      return realProcessor(ev, raw) // non-target rows pass through to the real domain
    }
    await ingest(F_ID, SCRATCH_PHONE)
    const fRow = await pg`SELECT id FROM webhook_inbox WHERE provider_event_id = ${F_ID}`
    const F_ROW_ID = fRow[0].id
    const orderPrefix = 'W5'

    for (let attempt = 1; attempt <= MAX_WEBHOOK_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        // The backoff window is real; simulate time passing for the next retry.
        await pg`UPDATE webhook_inbox SET available_at = NOW() - INTERVAL '1 second' WHERE id = ${F_ROW_ID}`
      }
      const st = await drainWebhookInboxOnce({ client: supabaseAdmin, batchSize: 25, processEvent: failProcessor })
      const stRow = await pg`SELECT status, attempts, available_at, last_error FROM webhook_inbox WHERE id = ${F_ROW_ID}`

      if (attempt < MAX_WEBHOOK_ATTEMPTS) {
        assert(st.requeued === 1, `${orderPrefix}${attempt}a`, `failure #${attempt} → requeued with backoff (stats.requeued=${st.requeued})`)
        assert(stRow[0].status === 'queued' && stRow[0].attempts === attempt, `${orderPrefix}${attempt}b`, `attempts=${stRow[0].attempts}, status=${stRow[0].status}`)
        assert(stRow[0].last_error?.includes('staging:wh:deterministic-failure'), `${orderPrefix}${attempt}c`, 'last_error retained with the failure reason')
        if (attempt === 1) {
          const delayMs = new Date(stRow[0].available_at).getTime() - Date.now()
          const expectedBase = WEBHOOK_BACKOFF_BASE_MS
          assert(delayMs > expectedBase * 0.75 && delayMs < expectedBase * 2, `${orderPrefix}1d`, `backoff honored (available_at = base ${expectedBase}ms ahead, measured ~${delayMs}ms)`)
        }
        if (attempt === 2) {
          // Backoff must gate reclaim: the row is queued but not due yet.
          const early = await supabaseAdmin.rpc('claim_next_webhook_events', { p_limit: 25 })
          const earlyIds = (early.data ?? []) as Array<{ provider_event_id?: string }>
          assert(!earlyIds.some((r) => r.provider_event_id === `${F_ID}`), `${orderPrefix}2e`, `queued-but-not-due row is NOT claimed (backoff/available_at honored by the RPC)`)
        }
      } else {
        assert(st.dead === 1, `${orderPrefix}c`, `final failure → dead (stats.dead=${st.dead})`)
        assert(stRow[0].status === 'dead' && stRow[0].attempts === MAX_WEBHOOK_ATTEMPTS, `${orderPrefix}d`, `status=${stRow[0].status}, attempts=${stRow[0].attempts}`)
        assert(stRow[0].last_error?.length > 0, `${orderPrefix}e`, 'last_error retained on the dead row')
      }
    }

    // Dead rows are excluded from normal claiming (no infinite replay).
    const deadClaim = await supabaseAdmin.rpc('claim_next_webhook_events', { p_limit: 25 })
    const deadClaimed = (deadClaim.data ?? []) as Array<{ provider_event_id?: string }>
    assert(!deadClaimed.some((r) => r.provider_event_id === `${F_ID}`), `${orderPrefix}f`, 'dead row is never re-claimed automatically')

    // Manual requeue → back to queued → claim → real process → done.
    const requeued = await requeueWebhookEvent(F_ROW_ID as string, { client: supabaseAdmin })
    assert(requeued === true, `${orderPrefix}g`, 'requeueWebhookEvent resurrects the dead row (manual DLQ action)')
    const rqRow = await pg`SELECT status, attempts, available_at FROM webhook_inbox WHERE id = ${F_ROW_ID}`
    assert(rqRow[0].status === 'queued' && rqRow[0].attempts === 0, `${orderPrefix}h`, `requeue resets to queued + attempts=0 (attempts=${rqRow[0].attempts})`)
    const finalStats = await drainWebhookInboxOnce({ client: supabaseAdmin, batchSize: 25, processEvent: realProcessor })
    assert(finalStats.done === 1, `${orderPrefix}i`, 'requeued row is claimed and processed to done by the real consumer')

    // ── W6. CONCURRENT CLAIMS → ZERO OVERLAP (real SKIP LOCKED) ──
    console.log('W6 concurrent claims:')
    for (let i = 1; i <= 5; i++) {
      await pg`INSERT INTO webhook_inbox (provider, provider_event_id, provider_event_type, phone_number_id, payload)
               VALUES ('meta', ${WH(`conc:${i}`)}, 'customer_message', ${SCRATCH_PHONE}, ${JSON.stringify({ eventType: 'customer_message', phoneNumberId: SCRATCH_PHONE, messages: [{ id: `conc_${i}`, from: '919999000001', type: 'text', text: { body: 'conc' } }] })})`
    }
    const [claimX, claimY] = await Promise.all([
      supabaseAdmin.rpc('claim_next_webhook_events', { p_limit: 25 }),
      supabaseAdmin.rpc('claim_next_webhook_events', { p_limit: 25 }),
    ])
    const idsX = (claimX.data ?? []) as Array<{ provider_event_id?: string }>
    const idsY = (claimY.data ?? []) as Array<{ provider_event_id?: string }>
    const all = [...idsX, ...idsY].map((r) => r.provider_event_id).filter((v): v is string => !!v)
    const distinct = new Set(all)
    assert(idsX.length + idsY.length === 5, 'W6a', `two concurrent workers claimed 5 rows total (${idsX.length}+${idsY.length})`)
    assert(distinct.size === all.length, 'W6b', `zero overlap — no row claimed twice (${idsX.length}+${idsY.length} claimed, ${distinct.size} distinct)`)
    await pg`DELETE FROM webhook_inbox WHERE provider_event_id LIKE ${WH_PREFIX + 'conc:%'}`

    // ── W7. NO PRODUCTION CONTACT ──
    console.log('W7 production isolation:')
    assert(!stagingDb.includes(PROD_HOST) && !stagingSupabaseUrl.includes(PROD_HOST), 'W7', 'confirmed target is staging; script never reads DATABASE_URL/prod .env')
  } catch (err: any) {
    failures++
    console.error('  ERROR', err?.message || err)
  } finally {
    if (!KEEP) {
      await resetTenantCleanup().catch((e) => console.error('cleanup failed:', e?.message))
      console.log('Cleanup done (KEEP_STAGING_DATA=1 to retain scratch rows).')
    } else {
      console.log('KEEP_STAGING_DATA=1 — scratch tenant + inbox/domain rows retained for inspection.')
    }
    await pg.end()
  }

  if (failures === 0) {
    console.log(`\nSTAGING WEBHOOK/INBOX: ALL CHECKS PASSED (scratch ${SCRATCH_TENANT})`)
    process.exitCode = 0
  } else {
    console.error(`\nSTAGING WEBHOOK/INBOX: ${failures} check(s) FAILED`)
    process.exitCode = 1
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err: any) => {
    console.error('UNHANDLED:', err?.message || err)
    process.exit(1)
  },
)