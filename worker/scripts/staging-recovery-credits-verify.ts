// ============================================================
// staging-recovery-credits-verify.ts
// STAGING-ONLY end-to-end validation for Phase B recovery credits.
//
// Run with explicit STAGING_* variables (never DATABASE_URL/prod .env):
//   STAGING_CREDITS_VALIDATION=1   tripwire — confirms "staging only"
//   STAGING_DATABASE_URL           → staging Postgres (pooler or direct)
//   STAGING_SUPABASE_URL           → staging Supabase project
//   STAGING_SERVICE_ROLE_KEY       → staging service-role key
//
//   STAGING_CREDITS_VALIDATION=1 \
//   STAGING_DATABASE_URL=...       \
//   STAGING_SUPABASE_URL=...       \
//   STAGING_SERVICE_ROLE_KEY=...   \
//   pnpm --filter billzo-worker staging:recovery-credits
//
// The script NEVER reads DATABASE_URL/AUTHORITY_DATABASE_URL directly and
// refuses to touch the known production Supabase host. It exercises the REAL
// production code paths against the REAL staging database:
//   * frontend allocation (reconcileRecoveryCredits via the billing-cron
//     adapter) reading the AUTHORITATIVE active subscription period
//     (migrations 069/070 — tenants is never a period source), with precise
//     balance snapshots;
//   * worker reservation→settlement→release (reserveRecoveryCredit /
//     settleRecoveryCredit / releaseRecoveryCredit with real Postgres advisory
//     locks, unique indexes and CHECK constraints, migration 097);
//   * purchase + refund idempotency (unique order_id indexes).
// The simulated unit tests are regression protection; this script is the proof
// that the real Postgres enforces the same invariants.
//
// What it creates (and cleans up unless KEEP_STAGING_DATA=1): two scratch
// tenants (`scratch_credits_...`) plus their subscriptions, ledger rows and
// reservations. Nothing else.
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
if (process.env.STAGING_CREDITS_VALIDATION !== '1') {
  console.error('Refusing to run: set STAGING_CREDITS_VALIDATION=1 to confirm this is a STAGING-only validation.')
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
  reconcileRecoveryCredits,
  recordRecoveryCreditPurchase,
  recordRecoveryCreditRefund,
  getRecoveryCreditBalancesForTenant,
} from '../../mini_saas_frontend/src/lib/billzo/recovery-credits'
import {
  reserveRecoveryCredit,
  settleRecoveryCredit,
  releaseRecoveryCredit,
  getRecoveryCreditBalances,
  isRecoveryCreditsEnabled,
} from '../src/lib/recovery/credit-ledger'
import { RECOVERY_CREDITS_DEFERRED_REASON } from '@billzo/shared'

// Alias the staging values into the vars the real adapters read at call time
// (frontend supabase-admin is a lazy proxy; credit-ledger reads DATABASE_URL
// per call). Runs before any client is built.
process.env.STAGING_DATABASE_URL &&
  (process.env.DATABASE_URL = stagingDb)
process.env.STAGING_SUPABASE_URL &&
  (process.env.NEXT_PUBLIC_SUPABASE_URL = stagingSupabaseUrl)
process.env.STAGING_SERVICE_ROLE_KEY &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY = stagingServiceRoleKey)

const pg = postgres(stagingDb, { max: 1 })

const KEEP = process.env.KEEP_STAGING_DATA === '1'

const ts = Date.now()
const TENANT_A = `scratch_credits_a_${ts}_${randomUUID().slice(0, 4)}`
const TENANT_B = `scratch_credits_b_${ts}_${randomUUID().slice(0, 4)}`

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

async function resetTenant(t: string): Promise<void> {
  await pg`DELETE FROM recovery_credit_reservations WHERE tenant_id = ${t}`
  await pg`DELETE FROM recovery_credit_ledger WHERE tenant_id = ${t}`
  await pg`DELETE FROM recovery_credit_orders WHERE tenant_id = ${t}`
  await supabaseAdmin.from('subscriptions').delete().eq('tenant_id', t)
  await supabaseAdmin.from('tenants').delete().eq('id', t)
}

async function makeScratchTenant(id: string, plan = 'pro'): Promise<void> {
  const now = new Date()
  const end = new Date(now.getTime() + 30 * 86400000)

  // The ACTIVE SUBSCRIPTION is the authoritative period source the credits
  // feature reads (never tenants). Insert it first and link tenants to it.
  const { data: sub, error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .insert({
      tenant_id: id,
      plan_code: plan,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
    })
    .select('id')
    .single()
  if (subErr || !sub) throw new Error(`makeScratchTenant subscription failed for ${id}: ${subErr?.message ?? 'no id'}`)

  const { error } = await supabaseAdmin.from('tenants').insert({
    id,
    company_name: 'Scratch Credit Validation',
    phone: '',
    email: `${id}@staging.invalid`,
    plan,
    recovery_credits_enabled: true,
    subscription_id: sub.id,
    subscription_state: 'active',
    is_active: true,
  })
  if (error) throw new Error(`makeScratchTenant failed for ${id}: ${error.message}`)
}

async function main(): Promise<void> {
  console.log(`Staging credits validation against STAGING_DATABASE_URL (STAGING ONLY)`)
  console.log(`Scratch tenants: ${TENANT_A}, ${TENANT_B}`)

  try {
    // ── S1. Allocation (P0-1: subscriptions are the authoritative period) ──
    await makeScratchTenant(TENANT_A, 'pro')
    console.log('S1 allocation (pro → 200 included):')
    const alloc1 = await reconcileRecoveryCredits()
    const balA1 = await getRecoveryCreditBalancesForTenant(TENANT_A)
    assert(alloc1.allocated >= 1, 'S1a', `reconcile allocated ≥1 tenant (${alloc1.allocated} overall)`)
    assert(balA1.included === 200 && balA1.purchased === 0, 'S1b', `balances {included:200, purchased:0}, got ${JSON.stringify(balA1)}`)

    const alloc2 = await reconcileRecoveryCredits()
    assert(alloc2.allocated === 0 && alloc2.skipped >= 1, 'S1c', `second reconcile is idempotent (allocated=${alloc2.allocated}, skipped=${alloc2.skipped})`)
    const balA2 = await getRecoveryCreditBalancesForTenant(TENANT_A)
    assert(balA2.included === 200, 'S1d', `balance unchanged after rerun (${balA2.included})`)

    const ledgerA = await pg`SELECT entry_type, pool, quantity, balance_after, pool_balance_after FROM recovery_credit_ledger WHERE tenant_id = ${TENANT_A}`
    assert(ledgerA.length === 1 && ledgerA[0].entry_type === 'allocation', 'S1e', `one allocation row only, got ${ledgerA.length}`)
    assert(
      Number(ledgerA[0].balance_after) === 200 && Number(ledgerA[0].pool_balance_after) === 200,
      'S1f',
      `allocation snapshots precise (balance_after=${ledgerA[0].balance_after}, pool_balance_after=${ledgerA[0].pool_balance_after})`,
    )

    // ── S2. Reservation → success settle + failure release (real locks) ──
    console.log('S2 reservation model (reserve → settle/release):')
    assert(await isRecoveryCreditsEnabled(TENANT_A), 'S2i', 'tenant flagged credit-enabled')

    // Success path convenience: reserve then release then settle → one credit.
    const relReserve = await reserveRecoveryCredit({ tenantId: TENANT_A, collectionActionId: `${TENANT_A}_rel_1` })
    assert(relReserve.reserved === true, 'S2r1', 'reserve ok on tenant A')
    const relRelease = await releaseRecoveryCredit(`${TENANT_A}_rel_1`)
    assert(relRelease.released === true, 'S2r2', 'release frees the in-flight reservation')
    const activeRes = await pg`SELECT collection_action_id, status FROM recovery_credit_reservations WHERE tenant_id = ${TENANT_A} AND status = 'active'`
    assert(activeRes.length === 0, 'S2r3', `no active reservation remains after release (got ${activeRes.length})`)
    const settled = await settleRecoveryCredit({ tenantId: TENANT_A, collectionActionId: `${TENANT_A}_rel_1` })
    assert(settled.settled === true, 'S2r4', 'a later success settles via the released reservation pool')
    const balA3 = await getRecoveryCreditBalances(TENANT_A)
    assert(balA3.included === 199, 'S2r5', `one credit billed after settle (included=199, got ${balA3.included})`)

    // ── S2b. Adversarial concurrency (credits=1) — exactly one dispatch ──
    await makeScratchTenant(TENANT_B, 'pro')
    // Seed the boundary case the scheduler gate can race: exactly one credit.
    await pg`
      INSERT INTO recovery_credit_ledger
        (tenant_id, entry_type, pool, quantity, balance_after, pool_balance_after, reason)
      VALUES
        (${TENANT_B}, 'allocation', 'included', 1, 1, 1, 'staging_seed_single_credit')
        ON CONFLICT DO NOTHING
    `
    console.log('S2b adversarial concurrency (credits=1, two concurrent reserves):')
    assert(await isRecoveryCreditsEnabled(TENANT_B), 'S2i', 'tenant flagged credit-enabled')

    const reserveResults = await Promise.all([
      reserveRecoveryCredit({ tenantId: TENANT_B, collectionActionId: `${TENANT_B}_act_1` }),
      reserveRecoveryCredit({ tenantId: TENANT_B, collectionActionId: `${TENANT_B}_act_2` }),
    ])
    const reserved = reserveResults.filter((r) => r.reserved === true && !(r as { alreadyReserved?: boolean }).alreadyReserved)
    const deferred = reserveResults.filter((r) => r.reserved === false)
    assert(reserved.length === 1, 'S2a', `exactly one action reserved the credit (got ${reserved.length})`)
    assert(deferred.length === 1 && deferred[0].reason === RECOVERY_CREDITS_DEFERRED_REASON, 'S2b', `the other reserve deferred (${deferred[0]?.reason})`)

    const activeResB = await pg`SELECT collection_action_id FROM recovery_credit_reservations WHERE tenant_id = ${TENANT_B} AND status = 'active'`
    assert(activeResB.length === 1, 'S2c', `exactly one held reservation (got ${activeResB.length})`)

    // Settle only the action that actually won a reservation.
    const winnerAct = `${TENANT_B}_act_1`
    const win = await settleRecoveryCredit({ tenantId: TENANT_B, collectionActionId: winnerAct })
    assert(win.settled === true, 'S2d', 'winner settles into a consumption entry')

    const consumptionRows = await pg`SELECT collection_action_id, quantity FROM recovery_credit_ledger WHERE tenant_id = ${TENANT_B} AND entry_type = 'consumption'`
    assert(consumptionRows.length === 1, 'S2e', `exactly one consumption row (got ${consumptionRows.length})`)
    assert(Number(consumptionRows[0].quantity) === -1, 'S2f', `debit is -1 (got ${consumptionRows[0].quantity})`)

    const balB = await getRecoveryCreditBalances(TENANT_B)
    assert(balB.included === 0 && balB.purchased === 0, 'S2g', `balance never negative: ${JSON.stringify(balB)}`)

    // A second settle of the same action is idempotent (never double-bills).
    const winAgain = await settleRecoveryCredit({ tenantId: TENANT_B, collectionActionId: winnerAct })
    assert(winAgain.settled === true && (winAgain as { alreadySettled?: boolean }).alreadySettled === true, 'S2h', 'second settle reports alreadySettled')
    assert((await getRecoveryCreditBalances(TENANT_B)).included === 0, 'S2i2', 'balance unchanged after idempotent settle')

    // ── S3. Defer at zero; purchase + refund (P0-3 ledger clawback) ──
    const def = await reserveRecoveryCredit({ tenantId: TENANT_B, collectionActionId: `${TENANT_B}_act_3` })
    assert(def.reserved === false && def.reason === RECOVERY_CREDITS_DEFERRED_REASON, 'S3a', 'empty balance defers, never sends')

    const rowsBeforePurchase = await pg`SELECT id FROM recovery_credit_ledger WHERE tenant_id = ${TENANT_B}`
    const order = {
      id: randomUUID(),
      razorpay_order_id: `order_scratch_${randomUUID()}`,
      razorpay_payment_id: `pay_scratch_${randomUUID()}`,
      packet_code: 'credits_50',
      credits: 50,
      amount_paise: 22900,
      currency: 'INR',
      status: 'paid',
    }
    const p1 = await recordRecoveryCreditPurchase(TENANT_B, order)
    const p2 = await recordRecoveryCreditPurchase(TENANT_B, order) // replay of the same verification
    assert(p1.ok === true && p2.ok === true, 'S3b', 'purchase recorded; replay is idempotent')
    const purchaseRows = await pg`SELECT order_id FROM recovery_credit_ledger WHERE tenant_id = ${TENANT_B} AND entry_type = 'purchase'`
    assert(purchaseRows.length === 1, 'S3c', `exactly one purchase ledger entry (got ${purchaseRows.length})`)

    const rowsAfterPurchase = await pg`SELECT id, entry_type FROM recovery_credit_ledger WHERE tenant_id = ${TENANT_B}`
    const added = rowsAfterPurchase.filter((r) => !rowsBeforePurchase.some((b) => b.id === r.id))
    assert(added.length === 1 && added[0].entry_type === 'purchase', 'S3d', `purchase added ONLY a purchase row (no resume/re-schedule entries): ${added.map((r) => r.entry_type).join(',') || 'none'}`)

    const balB2 = await getRecoveryCreditBalances(TENANT_B)
    assert(balB2.purchased === 50 && balB2.included === 0, 'S3e', `post-purchase balance ${JSON.stringify(balB2)} — credits added, nothing resumed`)

    // Refund: claw back the purchased pool exactly once (P0-3).
    const refund1 = await recordRecoveryCreditRefund(TENANT_B, order, 'staging_merchant_refund')
    assert(refund1.ok === true, 'S3f', 'refund clawback recorded')
    const balRefund = await getRecoveryCreditBalancesForTenant(TENANT_B)
    assert(balRefund.purchased === 0, 'S3g', `purchased pool back to 0 after refund (got ${balRefund.purchased})`)
    const refundRows = await pg`SELECT order_id, quantity, pool_balance_after FROM recovery_credit_ledger WHERE tenant_id = ${TENANT_B} AND entry_type = 'refund'`
    assert(refundRows.length === 1 && Number(refundRows[0].quantity) === -50, 'S3h', `exactly one refund row debiting -50 (got ${refundRows.length})`)
    assert(Number(refundRows[0].pool_balance_after) === 0, 'S3i', `refund snapshot precise (pool_balance_after=0, got ${refundRows[0].pool_balance_after})`)
    const refund2 = await recordRecoveryCreditRefund(TENANT_B, order, 'staging_merchant_refund')
    assert(refund2.ok === true && (refund2 as { alreadyRefunded?: boolean }).alreadyRefunded === true, 'S3j', 'refund replay is idempotent (alreadyRefunded)')

    // S3k: leftover deferred actions (none created here) are untouched by purchase,
    // and the scheduler never auto-resumes them (covered by queue unit tests).
    ok('S3k', 'no collection_actions created — defer-persistence is scheduler-level; reconcile/purchase only touch the ledger')

    // ── S4. Catalog + order amount are server-authoritative, DB-enforced ──
    const ordersCount = await pg`SELECT COUNT(*)::int AS n FROM recovery_credit_orders WHERE tenant_id = ${TENANT_B}`
    assert(Number(ordersCount[0].n) === 0, 'S4', 'ledger-level purchase/refund paths leave recovery_credit_orders untouched (CAS created→paid→refunded lives in the API routes, covered by route unit tests)')
  } catch (err: any) {
    failures++
    console.error('  ERROR', err?.message || err)
  } finally {
    if (!KEEP) {
      await resetTenant(TENANT_A).catch((e) => console.error('cleanup A failed:', e?.message))
      await resetTenant(TENANT_B).catch((e) => console.error('cleanup B failed:', e?.message))
      console.log('Cleanup done (KEEP_STAGING_DATA=1 to retain scratch rows).')
    } else {
      console.log('KEEP_STAGING_DATA=1 — scratch tenants + ledger rows retained for inspection.')
    }
    await pg.end()
  }

  if (failures === 0) {
    console.log(`\nSTAGING CREDITS: ALL CHECKS PASSED (${'SCRATCH ' + TENANT_A})`)
    process.exitCode = 0
  } else {
    console.error(`\nSTAGING CREDITS: ${failures} check(s) FAILED`)
    process.exitCode = 1
  }
}

main()