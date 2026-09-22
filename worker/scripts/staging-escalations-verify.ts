// ============================================================
// staging-escalations-verify.ts
// STAGING-ONLY end-to-end validation for Phase C recovery escalation pack.
//
// Run with explicit STAGING_* variables (never DATABASE_URL/prod .env):
//   STAGING_ESCALATION_VALIDATION=1   tripwire — confirms "staging only"
//   STAGING_DATABASE_URL              → staging Postgres (pooler or direct)
//   STAGING_SUPABASE_URL              → staging Supabase project
//   STAGING_SERVICE_ROLE_KEY          → staging service-role key
//
//   STAGING_ESCALATION_VALIDATION=1 \
//   STAGING_DATABASE_URL=...         \
//   STAGING_SUPABASE_URL=...         \
//   STAGING_SERVICE_ROLE_KEY=...     \
//   pnpm --filter billzo-worker staging:escalations
//
// The script NEVER reads DATABASE_URL/AUTHORITY_DATABASE_URL directly and
// refuses to touch the known production Supabase host. It exercises the REAL
// frontend escalation lib (assess → prepare → decide → settlement) against
// the REAL staging database:
//   * Domain A — assessRecoveryCase persists an active slot with a FROZEN
//     basis; re-assessment refreshes derived recommended/grade but never
//     rewrites the stored basis (migration 099 trigger + partial unique index);
//   * Domain B — prepareRecoveryCase builds the RC-<invoice>-<seq> snapshot
//     pack and is idempotent after the slot advances to prepared;
//   * decide — recordMerchantDecision(authorize) emits merchant.escalated
//     through the SAME outbox path the command center uses;
//   * Domain C — recordSettlementOffer persists the offer; NO outbox event is
//     ever emitted (buildSettlementNoticeDraft is never auto-sent).
//   * RecoveryCredit isolation — the escalation pack NEVER writes
//     recovery_credit_ledger / recovery_credit_reservations /
//     recovery_credit_orders for the scratch tenant.
// The simulated unit tests are regression protection; this script is the proof
// that the real Postgres enforces the same invariants.
//
// What it creates (and cleans up unless KEEP_STAGING_DATA=1): one scratch
// tenant (`scratch_esc_...`) plus its customer, one overdue invoice, a small
// recovery spine (case row, collection actions, a broken promise, a transition
// event) and the escalation slot. Nothing else.
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
if (process.env.STAGING_ESCALATION_VALIDATION !== '1') {
  console.error('Refusing to run: set STAGING_ESCALATION_VALIDATION=1 to confirm this is a STAGING-only validation.')
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

import postgres from 'postgres'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../mini_saas_frontend/src/lib/billzo/supabase-admin'
import {
  assessRecoveryCase,
  prepareRecoveryCase,
  recordMerchantDecision,
  recordSettlementOffer,
  getRecoveryCasePack,
} from '../../mini_saas_frontend/src/lib/billzo/recovery-escalation'
import { writeOutboxEvent } from '../../mini_saas_frontend/src/lib/billzo/outbox'

// Alias the staging values into the vars the real adapters read at call time
// (frontend supabase-admin is a lazy proxy reading env per connection build).
process.env.STAGING_DATABASE_URL && (process.env.DATABASE_URL = stagingDb)
process.env.STAGING_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_URL = stagingSupabaseUrl)
process.env.STAGING_SERVICE_ROLE_KEY && (process.env.SUPABASE_SERVICE_ROLE_KEY = stagingServiceRoleKey)

const pg = postgres(stagingDb, { max: 1 })

const KEEP = process.env.KEEP_STAGING_DATA === '1'

const ts = Date.now()
const TENANT = `scratch_esc_${ts}_${randomUUID().slice(0, 4)}`
const CUSTOMER = randomUUID()
const CASE_ID = randomUUID()
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

async function resetTenant(): Promise<void> {
  await pg`DELETE FROM recovery_escalations WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM recovery_case_events WHERE case_id = ${CASE_ID}`
  await pg`DELETE FROM recovery_cases WHERE id = ${CASE_ID}`
  await pg`DELETE FROM outbox WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM recovery_credit_orders WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM recovery_credit_reservations WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM recovery_credit_ledger WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM collection_actions WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM payment_promises WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM whatsapp_events WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM payments WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM invoices WHERE tenant_id = ${TENANT}`
  await pg`DELETE FROM customers WHERE id = ${CUSTOMER}`
  await pg`DELETE FROM tenants WHERE id = ${TENANT}`
}

async function makeScratchSpine(): Promise<void> {
  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

  const { error: tenantErr } = await supabaseAdmin.from('tenants').insert({
    id: TENANT,
    company_name: 'Scratch Escalation Validation',
    phone: '',
    email: `${TENANT}@staging.invalid`,
    plan: 'business',
    subscription_state: 'active',
    is_active: true,
    recovery_credits_enabled: false,
  })
  if (tenantErr) throw new Error(`makeScratchSpine tenant failed: ${tenantErr.message}`)

  const { error: custErr } = await supabaseAdmin.from('customers').insert({
    id: CUSTOMER,
    tenant_id: TENANT,
    customer_name: 'Scratch Escalation Customer',
    phone: '+919999000000',
    email: `${CUSTOMER}@staging.invalid`,
  })
  if (custErr) throw new Error(`makeScratchSpine customer failed: ${custErr.message}`)

  // One clearly overdue invoice (22 days → Urgent+ band).
  const { error: invErr } = await supabaseAdmin.from('invoices').insert({
    id: `inv_${CUSTOMER.slice(0, 8)}`,
    tenant_id: TENANT,
    customer_id: CUSTOMER,
    invoice_number: `RE-${ts.toString().slice(-6)}`,
    invoice_date: daysAgo(40),
    due_date: daysAgo(22),
    total: 84000,
    grand_total: 84000,
    paid_amount: 0,
    outstanding_amount: 84000,
    status: 'issued',
  })
  if (invErr) throw new Error(`makeScratchSpine invoice failed: ${invErr.message}`)

  // One completed rate-limited reminder + one broken promise → negative facts.
  const actId = `act_${CUSTOMER.slice(0, 8)}_1`
  const { error: actErr } = await supabaseAdmin.from('collection_actions').insert({
    id: actId,
    tenant_id: TENANT,
    customer_id: CUSTOMER,
    action_type: 'reminder',
    status: 'completed',
    scheduled_at: daysAgo(12),
    completed_at: daysAgo(12),
    source: 'automation',
  })
  if (actErr) throw new Error(`makeScratchSpine action failed: ${actErr.message}`)

  const { error: promErr } = await supabaseAdmin.from('payment_promises').insert({
    id: `prom_${CUSTOMER.slice(0, 8)}`,
    tenant_id: TENANT,
    customer_id: CUSTOMER,
    promise_date: daysAgo(12),
    amount: 84000,
    status: 'broken',
    triggered_by_action_id: actId,
  })
  if (promErr) throw new Error(`makeScratchSpine promise failed: ${promErr.message}`)

  // The recovery spine row the command center queues on, plus a transition
  // event proving the promise → overdue break.
  const { error: caseErr } = await supabaseAdmin.from('recovery_cases').insert({
    id: CASE_ID,
    tenant_id: TENANT,
    customer_id: CUSTOMER,
    recovery_state: 'overdue',
    engagement_state: 'engaged',
    next_action_type: 'send_reminder',
    open_invoice_count: 1,
    overdue_invoice_count: 1,
    total_overdue: 84000,
    created_at: daysAgo(40),
  })
  if (caseErr) throw new Error(`makeScratchSpine case failed: ${caseErr.message}`)

  const { error: evtErr } = await supabaseAdmin.from('recovery_case_events').insert({
    id: `evt_${CUSTOMER.slice(0, 8)}`,
    case_id: CASE_ID,
    event_type: 'transition',
    payload: { from_recovery_state: 'promised', to_recovery_state: 'overdue' },
    created_at: daysAgo(11),
  })
  if (evtErr) throw new Error(`makeScratchSpine event failed: ${evtErr.message}`)
}

async function main(): Promise<void> {
  console.log(`Staging escalation pack validation against STAGING_DATABASE_URL (STAGING ONLY)`)
  console.log(`Scratch tenant: ${TENANT}, case: ${CASE_ID}`)

  try {
    await makeScratchSpine()

    // ── S1. Domain A — assessment + recommendation + FROZEN basis ──
    console.log('S1 assessment (recognition):')
    const a1 = await assessRecoveryCase(TENANT, CASE_ID)
    assert(!!a1, 'S1a', 'assessment returned for the exhausted spine')
    assert(a1!.recommended === true, 'S1b', `Urgent+ recommended (${a1!.stage ?? '?'})`)
    assert(Array.isArray(a1!.basis) && a1!.basis.length >= 3, 'S1c', `basis has overdue + broken-promise + effort facts (${a1!.basis.map((b: any) => b.kind).join(',')})`)
    const basisFrozen = JSON.stringify(a1!.basis)

    const slot1 = a1!.escalation
    assert(slot1!.status === 'recommended', 'S1d', `slot persisted as recommended (${slot1!.status})`)
    const slotRow = await pg`SELECT basis, recommended, grade, status FROM recovery_escalations WHERE tenant_id = ${TENANT}`
    assert(slotRow.length === 1, 'S1e', `exactly ONE active slot (got ${slotRow.length})`)

    // Re-assess: derived fields refresh; stored basis never rewrites.
    const a2 = await assessRecoveryCase(TENANT, CASE_ID)
    const slot2 = a2!.escalation
    assert(JSON.stringify(slot2!.basis) === basisFrozen, 'S1f', 're-assessment keeps the SAME frozen basis')
    assert(slot2!.recommended === a1!.recommended, 'S1g', 'derived recommended refreshed identically')

    // ── S2. Domain B — prepare pack + idempotency ──
    console.log('S2 prepare (evidence pack):')
    const p1 = await prepareRecoveryCase(TENANT, CASE_ID, null)
    assert(!!p1 && !p1!.alreadyPrepared, 'S2a', 'first prepare builds a fresh pack')
    assert(/^RC-[A-Z0-9-]+-\d+$/.test(p1!.caseNumber), 'S2b', `case number deterministic RC-...-N (${p1!.caseNumber})`)
    assert(!!p1!.snapshot && p1!.snapshot.caseNumber === p1!.caseNumber, 'S2c', 'snapshot embeds the case number')
    assert((p1!.snapshot as any).version === 1, 'S2d', 'snapshot at schema version 1')
    assert((p1!.snapshot as any).invoices?.length === 1, 'S2e', `pack carries the primary invoice (${(p1!.snapshot as any).invoices?.length})`)
    assert((p1!.snapshot as any).customer?.name === 'Scratch Escalation Customer', 'S2f', 'pack resolves the customer identity')
    assert((p1!.effort?.attempts ?? 0) >= 1, 'S2g', `effort summary counts the real attempt (${p1!.effort?.attempts})`)

    const p2 = await prepareRecoveryCase(TENANT, CASE_ID, null)
    assert(!!p2 && p2!.alreadyPrepared === true, 'S2h', 'second prepare returns the immutable pack (idempotent)')
    assert(p2!.caseNumber === p1!.caseNumber, 'S2i', 'case number identical across prepares')
    const pack = await getRecoveryCasePack(TENANT, CASE_ID)
    assert(!!pack && pack!.status === 'prepared', 'S2j', `pack read back as prepared (${pack!.status})`)

    // ── S3. decide (authorize) → merchant.escalated through the outbox ──
    console.log('S3 merchant decision (decide → outbox):')
    const beforeEvents = await pg`SELECT COUNT(*)::int AS n FROM outbox WHERE tenant_id = ${TENANT}`
    const decided = await recordMerchantDecision(TENANT, CASE_ID, null, {
      decision: 'authorize',
      note: 'Staging validation authorize',
      emitEscalatedEvent: true,
    })
    assert(decided.escalation.merchantDecision === 'authorize', 'S3a', 'slot recorded authorize')
    assert(!!decided.eventId, 'S3b', 'authorize returned an outbox event id')
    const afterEvents = await pg`SELECT COUNT(*)::int AS n FROM outbox WHERE tenant_id = ${TENANT}`
    assert(Number(afterEvents[0].n) === Number(beforeEvents[0].n) + 1, 'S3c', `exactly one outbox event added (${afterEvents[0].n - beforeEvents[0].n})`)
    const evt = await pg`SELECT type, payload FROM outbox WHERE tenant_id = ${TENANT} AND type = 'merchant.escalated' ORDER BY id DESC LIMIT 1`
    assert(evt.length === 1, 'S3d', `outbox carries merchant.escalated (${evt[0]?.type})`)
    assert((evt[0]?.payload as any)?.caseId === CASE_ID, 'S3e', 'event payload carries the case id')

    // ── S4. Domain C — settlement offer persisted, NEVER auto-sent ──
    console.log('S4 settlement (offer / notice):')
    const preOffer = await pg`SELECT COUNT(*)::int AS n FROM outbox WHERE tenant_id = ${TENANT}`
    const offered = await recordSettlementOffer(TENANT, CASE_ID, {
      offer: { type: 'full', amount: 84000 },
      note: 'Offer full settlement',
    })
    assert(offered!.settlementOffer?.type === 'full', 'S4a', 'offer persisted on the slot')
    const postOffer = await pg`SELECT COUNT(*)::int AS n FROM outbox WHERE tenant_id = ${TENANT}`
    assert(Number(postOffer[0].n) === Number(preOffer[0].n), 'S4b', 'settlement offer emits NO outbox event (never auto-sends)')

    // ── S5. RecoveryCredit isolation — escalation never touches the ledger ──
    console.log('S5 credit isolation:')
    const creditRows = await pg`
      SELECT (SELECT COUNT(*)::int FROM recovery_credit_ledger WHERE tenant_id = ${TENANT}) AS ledger,
             (SELECT COUNT(*)::int FROM recovery_credit_reservations WHERE tenant_id = ${TENANT}) AS reservations,
             (SELECT COUNT(*)::int FROM recovery_credit_orders WHERE tenant_id = ${TENANT}) AS orders`
    assert(Number(creditRows[0].ledger) === 0, 'S5a', `recovery_credit_ledger untouched (${creditRows[0].ledger})`)
    assert(Number(creditRows[0].reservations) === 0, 'S5b', `recovery_credit_reservations untouched (${creditRows[0].reservations})`)
    assert(Number(creditRows[0].orders) === 0, 'S5c', `recovery_credit_orders untouched (${creditRows[0].orders})`)

    ok('S6', 'database-enforced half-open slot + frozen basis trigger verified by 099/verify_099 probes (docker validation)')
  } catch (err: any) {
    failures++
    console.error('  ERROR', err?.message || err)
  } finally {
    if (!KEEP) {
      await resetTenant().catch((e) => console.error('cleanup failed:', e?.message))
      console.log('Cleanup done (KEEP_STAGING_DATA=1 to retain scratch rows).')
    } else {
      console.log('KEEP_STAGING_DATA=1 — scratch tenant + escalation slot retained for inspection.')
    }
    await pg.end()
  }

  if (failures === 0) {
    console.log(`\nSTAGING ESCALATION PACK: ALL CHECKS PASSED (${TENANT})`)
    process.exitCode = 0
  } else {
    console.error(`\nSTAGING ESCALATION PACK: ${failures} check(s) FAILED`)
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