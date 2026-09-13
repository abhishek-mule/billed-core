// ============================================================
// CREDIT LEDGER — Worker-side adapter for the recovery-credit
// ledger (migrations 096 + 097). Implements the
// reservation → execution → settlement/release model:
//
//   * RESERVE runs BEFORE the provider call, atomically under a
//     Postgres advisory lock keyed on the tenant. The effective
//     balance is the ledger replay MINUS credits already held by
//     ACTIVE reservations — so N concurrent dispatches for a
//     tenant can never reserve more credits than it actually has.
//     A reservation holds one credit ONLY while the action is in
//     flight.
//   * SETTLE runs AFTER a successful automated action. The
//     reservation is converted into a real signed 'consumption'
//     ledger entry (exactly-once via the partial unique index on
//     collection_action_id). Failed sends settle NOTHING.
//   * RELEASE frees an in-flight reservation when the action
//     failed or was abandoned — a credit is never charged for a
//     send that did not succeed.
//   * STALE sweep releases reservations that outlive their TTL
//     (e.g. a worker died mid-dispatch). Drained from the worker's
//     reminder scanner tick.
//
// One billable automated recovery action therefore has exactly
// one reserved credit before it may be dispatched; a failed
// execution simply returns it. balance_after / pool_balance_after
// CHECK (>= 0) remain the hard backstop even if application logic
// is wrong.
// ============================================================

import postgres from 'postgres'
import { supabaseAdmin } from '../billzo/supabase-admin'
import { createQueueLogger } from '../../../lib/queue-logger'
import {
  selectPoolForConsumption,
  recoveryCreditsExhausted,
  recoveryCreditsAvailable,
  RECOVERY_CREDITS_DEFERRED_REASON,
  type RecoveryCreditBalances,
  type RecoveryCreditPool,
} from '@billzo/shared'

const logger = createQueueLogger('credit-ledger')

/** In-flight reservations older than this are released by the stale sweep. */
export const RECOVERY_CREDIT_RESERVATION_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface ReserveRecoveryCreditInput {
  tenantId: string
  collectionActionId: string
}

export type ReserveRecoveryCreditResult =
  | { reserved: true; pool: RecoveryCreditPool }
  | { reserved: true; alreadyReserved: true; pool: RecoveryCreditPool | null }
  | { reserved: false; reason: string }

export interface SettleRecoveryCreditInput {
  tenantId: string
  collectionActionId: string
  reason?: string
}

export type SettleRecoveryCreditResult =
  | { settled: true }
  | { settled: true; alreadySettled: true }
  | { settled: false; reason: string }

// ============================================================
// postgres.js client (same pattern as queues/outbox.ts)
// ============================================================
let _creditSql: ReturnType<typeof postgres> | null = null

function getCreditPostgres(): ReturnType<typeof postgres> | null {
  const url = process.env.DATABASE_URL || process.env.AUTHORITY_DATABASE_URL
  if (!url) return null
  if (!_creditSql) _creditSql = postgres(url, { max: 1 })
  return _creditSql
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505'
}

async function readLedgerBalances(
  tx: any,
  tenantId: string,
): Promise<RecoveryCreditBalances> {
  const rows = await tx<Array<{ pool: 'included' | 'purchased'; quantity: number }>>`
    SELECT pool, quantity
    FROM recovery_credit_ledger
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at, id
  `
  let included = 0
  let purchased = 0
  for (const row of rows) {
    if (row.pool === 'included') included += row.quantity
    else purchased += row.quantity
  }
  return { included, purchased }
}

/** Credits already held by in-flight reservations for this tenant. */
async function readActiveReservationCounts(
  tx: any,
  tenantId: string,
  excludeActionId?: string,
): Promise<RecoveryCreditBalances> {
  const rows = await tx<Array<{ pool: 'included' | 'purchased'; collection_action_id: string }>>`
    SELECT pool, collection_action_id
    FROM recovery_credit_reservations
    WHERE tenant_id = ${tenantId} AND status = 'active'
  `
  let included = 0
  let purchased = 0
  for (const row of rows) {
    if (row.collection_action_id === excludeActionId) continue
    if (row.pool === 'included') included++
    else purchased++
  }
  return { included, purchased }
}

// ============================================================
// Public API
// ============================================================

/** True when the tenant participates in the credits model. Fail-closed. */
export async function isRecoveryCreditsEnabled(tenantId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('recovery_credits_enabled')
      .eq('id', tenantId)
      .maybeSingle()
    return data?.recovery_credits_enabled === true
  } catch (err: any) {
    logger.warn({ tenantId, error: err.message }, 'Credits-enabled check failed closed')
    return false
  }
}

/**
 * Reconstruct per-pool balances by replaying the immutable ledger. Ledger
 * volume per tenant is small (one row per successful action / period / order),
 * and replaying is provably correct given the balance CHECK constraints.
 */
export async function getRecoveryCreditBalances(tenantId: string): Promise<RecoveryCreditBalances> {
  const sql = getCreditPostgres()
  if (!sql) return { included: 0, purchased: 0 }
  return readLedgerBalances(sql, tenantId)
}

/**
 * RESERVE — atomically claim one credit BEFORE a dispatch, or refuse. Runs
 * under a per-tenant advisory lock so concurrent dispatches are serialised and
 * the effective balance (ledger − active reservations) can never be overbooked.
 *
 * Returns { reserved: false } when nothing is spendable — the caller must defer
 * the action rather than send it. A second reservation for the same action
 * (worker crashed between reserve and settle/release) is idempotent.
 */
export async function reserveRecoveryCredit(
  input: ReserveRecoveryCreditInput,
): Promise<ReserveRecoveryCreditResult> {
  const { tenantId, collectionActionId } = input
  const sql = getCreditPostgres()
  if (!sql) {
    logger.warn({ tenantId, collectionActionId }, 'No DATABASE_URL — cannot reserve recovery credit')
    return { reserved: false, reason: 'no_database' }
  }

  try {
    return await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`

      const balances = await readLedgerBalances(tx, tenantId)
      const held = await readActiveReservationCounts(tx, tenantId, collectionActionId)
      const available: RecoveryCreditBalances = {
        included: balances.included - held.included,
        purchased: balances.purchased - held.purchased,
      }

      if (recoveryCreditsExhausted(available)) {
        return { reserved: false, reason: RECOVERY_CREDITS_DEFERRED_REASON }
      }
      const pool = selectPoolForConsumption(available)
      if (!pool) {
        return { reserved: false, reason: RECOVERY_CREDITS_DEFERRED_REASON }
      }

      await tx`
        INSERT INTO recovery_credit_reservations (
          tenant_id, collection_action_id, pool, status, expires_at, created_at, updated_at
        ) VALUES (
          ${tenantId}, ${collectionActionId}, ${pool}, 'active',
          ${new Date(Date.now() + RECOVERY_CREDIT_RESERVATION_TTL_MS).toISOString()},
          NOW(), NOW()
        )
      `
      return { reserved: true, pool }
    })
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      // A reservation already exists for this action. Status tells us whether
      // the action already billed (settled ⇒ the send happened — refuse to
      // re-dispatch) or still owns its slot (active/released ⇒ proceed).
      const rows = await sql<Array<{ status: string; pool: RecoveryCreditPool }>>`
        SELECT status, pool FROM recovery_credit_reservations
        WHERE collection_action_id = ${collectionActionId} LIMIT 1
      `
      const existing = rows[0]
      if (existing && existing.status === 'settled') {
        return { reserved: false, reason: 'already_settled' }
      }
      return { reserved: true, alreadyReserved: true, pool: existing?.pool ?? null }
    }
    logger.error({ tenantId, collectionActionId, error: err.message }, 'Failed to reserve recovery credit')
    throw err
  }
}

/**
 * SETTLE — convert an in-flight reservation into a real 'consumption' ledger
 * entry AFTER a successful automated action. Idempotent (unique consumption
 * index ⇒ alreadySettled). If no reservation exists we fall back to a legacy-
 * safe consume so the successful send is still billed; the unique index keeps
 * it exactly-once in all cases.
 */
export async function settleRecoveryCredit(
  input: SettleRecoveryCreditInput,
): Promise<SettleRecoveryCreditResult> {
  const { tenantId, collectionActionId, reason } = input
  const sql = getCreditPostgres()
  if (!sql) {
    logger.warn({ tenantId, collectionActionId }, 'No DATABASE_URL — cannot settle recovery credit')
    return { settled: false, reason: 'no_database' }
  }

  try {
    return await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`

      const reservations = await tx<Array<{ status: string; pool: RecoveryCreditPool }>>`
        SELECT status, pool FROM recovery_credit_reservations
        WHERE collection_action_id = ${collectionActionId} LIMIT 1
      `
      const reservation = reservations[0]
      if (reservation?.status === 'settled') {
        return { settled: true, alreadySettled: true }
      }

      const balances = await readLedgerBalances(tx, tenantId)
      const pool = reservation?.pool ?? selectPoolForConsumption(balances)
      if (!pool || recoveryCreditsExhausted(balances)) {
        return { settled: false, reason: RECOVERY_CREDITS_DEFERRED_REASON }
      }

      const poolAfter = pool === 'included' ? balances.included - 1 : balances.purchased - 1
      await tx`
        INSERT INTO recovery_credit_ledger (
          tenant_id, entry_type, pool, quantity,
          balance_after, pool_balance_after,
          collection_action_id, reason
        ) VALUES (
          ${tenantId}, 'consumption', ${pool}, -1,
          ${recoveryCreditsAvailable(balances) - 1}, ${poolAfter},
          ${collectionActionId}, ${reason ?? 'automated_action_completed'}
        )
      `
      await tx`
        UPDATE recovery_credit_reservations
        SET status = 'settled', updated_at = NOW()
        WHERE collection_action_id = ${collectionActionId} AND status = 'active'
      `
      return { settled: true }
    })
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      logger.info({ tenantId, collectionActionId }, 'Recovery credit already settled for action')
      return { settled: true, alreadySettled: true }
    }
    logger.error({ tenantId, collectionActionId, error: err.message }, 'Failed to settle recovery credit')
    throw err
  }
}

/**
 * RELEASE — free an in-flight reservation because the action failed or was
 * abandoned. Idempotent: only an 'active' reservation is released, so a
 * released/settled row is left untouched.
 */
export async function releaseRecoveryCredit(collectionActionId: string): Promise<{ released: boolean }> {
  const sql = getCreditPostgres()
  if (!sql) return { released: false }
  try {
    const res = await sql`
      UPDATE recovery_credit_reservations
      SET status = 'released', updated_at = NOW()
      WHERE collection_action_id = ${collectionActionId} AND status = 'active'
    `
    return { released: (res?.count ?? 0) > 0 }
  } catch (err: any) {
    logger.error({ collectionActionId, error: err.message }, 'Failed to release recovery credit')
    throw err
  }
}

/**
 * Release stale in-flight reservations that outlived their TTL (worker died
 * mid-dispatch, job lost, etc.). Returns the number released. Safe to call on
 * every scanner tick — it only ever touches 'active' reservations past expiry.
 */
export async function releaseStaleRecoveryCreditReservations(now: Date = new Date()): Promise<number> {
  const sql = getCreditPostgres()
  if (!sql) return 0
  try {
    const res = await sql`
      UPDATE recovery_credit_reservations
      SET status = 'released', updated_at = NOW()
      WHERE status = 'active' AND expires_at < ${now.toISOString()}
    `
    return res?.count ?? 0
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Failed to release stale recovery credit reservations')
    return 0
  }
}