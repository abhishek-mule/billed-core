// ============================================================
// RECOVERY CREDITS — Frontend-side adapter.
//   * reconcileRecoveryCredits(): idempotent period-boundary
//     allocation, drained from the billing cron (POST
//     /api/billing/worker). No events, no worker redeploy — the
//     ledger unique indexes make every write exactly-once.
//   * recordRecoveryCreditPurchase(): one 'purchase' ledger entry
//     per paid Razorpay order (UNIQUE order_id backstop).
//   * recordRecoveryCreditRefund(): one 'refund' ledger entry per
//     refunded order (UNIQUE order_id backstop), after a successful
//     provider clawback.
//   * resumeCreditDeferredActions(): explicit merchant action that
//     re-arms credit-deferred actions (defer, never auto-resume).
//   * getRecoveryCreditBalancesForTenant(): UI read path.
//
// THE AUTHORITATIVE BILLING PERIOD lives on `subscriptions`
// (status='active'; single active row per tenant), NOT on tenants.
// Reconcile reads subscriptions as the input; it never invents a
// parallel period source.
//
// Every signed entry carries precise balance_after /
// pool_balance_after snapshots computed from a replay of the
// immutable ledger at write time — the CHECK (>=0) backstops stay
// truthful even if application logic is wrong.
// ============================================================

import { supabaseAdmin } from './supabase-admin'
import { billzoPlanOf, recoveryCreditMonthlyAllowance } from '@billzo/shared'
import { recoveryCreditPeriodPlan, RECOVERY_CREDITS_DEFERRED_REASON } from '@billzo/shared'
import type { RecoveryCreditBalances } from '@billzo/shared'

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505'
}

function isCheckViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23514'
}

/** One billing period = 30 days (create-subscription uses now + 30 days). */
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000
const MAX_PERIOD_ADVANCE_STEPS = 12

interface ActiveSubscription {
  id: string
  plan_code: string
  current_period_start: string | null
  current_period_end: string | null
}

type ReconcileSummary = { allocated: number; expired: number; skipped: number }

function emptySummary(): ReconcileSummary {
  return { allocated: 0, expired: 0, skipped: 0 }
}

/** Replay the ledger to get per-pool balances at a point in time. */
async function replayBalances(
  tenantId: string,
  pools: Array<'included' | 'purchased'> = ['included', 'purchased'],
  before?: string,
): Promise<RecoveryCreditBalances> {
  let query = supabaseAdmin.from('recovery_credit_ledger').select('pool, quantity').eq('tenant_id', tenantId)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error || !data) return { included: 0, purchased: 0 }

  const balances: RecoveryCreditBalances = { included: 0, purchased: 0 }
  for (const row of data as Array<{ pool: 'included' | 'purchased'; quantity: number }>) {
    if (!pools.includes(row.pool)) continue
    if (row.pool === 'included') balances.included += Number(row.quantity)
    else balances.purchased += Number(row.quantity)
  }
  return balances
}

async function replayFullBalances(tenantId: string): Promise<RecoveryCreditBalances> {
  const data = await replayBalances(tenantId)
  const includedOnly = await replayBalances(tenantId, ['included'])
  // replayBalances already sums both pools; includedOnly gives the included
  // portion. purchased = total - included.
  return { included: includedOnly.included, purchased: data.included + data.purchased - includedOnly.included }
}

/**
 * Load the tenant's authoritative active subscription. Subscriptions'
 * current_period_start/end are the input to allocation; this is deliberately
 * the ONLY period source the credits feature reads.
 */
async function loadActiveSubscription(tenantId: string): Promise<ActiveSubscription | null> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_code, current_period_start, current_period_end')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) return null
  return data as ActiveSubscription
}

/**
 * Reconcile monthly credit allocations for credit-enabled tenants.
 * For each tenant whose active subscription's current period has no
 * allocation row yet:
 *   * advance the period forward (30-day steps, capped) when it has lapsed,
 *     persisting the rolled-forward boundary back to `subscriptions`;
 *   * expire the residual included balance from before the new period
 *     (audited as a signed negative 'expiry' entry), then
 *   * allocate the plan's monthly included allowance for the new period.
 * Exactly-once is DB-enforced by the allocation/expiry partial unique indexes
 * so concurrent runs converge on one correct result.
 */
export async function reconcileRecoveryCredits(maxTenants = 200): Promise<ReconcileSummary> {
  let allocated = 0
  let expired = 0
  let skipped = 0

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, plan')
    .eq('recovery_credits_enabled', true)
    .limit(maxTenants)

  if (error || !tenants) return emptySummary()

  for (const tenant of tenants as Array<{ id: string; plan: string | null }>) {
    const sub = await loadActiveSubscription(tenant.id)
    if (!sub || !sub.current_period_start || !sub.current_period_end) {
      skipped++
      continue
    }

    const hasAllocation = await hasAllocationFor(tenant.id, sub.id, sub.current_period_start)
    const lapsed = new Date(sub.current_period_end).getTime() <= Date.now()

    if (hasAllocation && !lapsed) {
      skipped++
      continue
    }

    // Advance lapsed periods forward (subscription is authoritative; we keep
    // it in sync so the next cycle starts from a correct boundary). Capped so
    // a pathological gap can never loop forever.
    let { start, end } = {
      start: new Date(sub.current_period_start),
      end: new Date(sub.current_period_end),
    }
    let advanced = 0
    while (end.getTime() <= Date.now() && advanced < MAX_PERIOD_ADVANCE_STEPS) {
      start = new Date(end)
      end = new Date(end.getTime() + BILLING_PERIOD_MS)
      advanced++
    }
    if (advanced > 0) {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)
    }
    if (end.getTime() <= Date.now()) {
      // Still lapsed after the cap — this is a billing-health anomaly, not a
      // credits bug. Leave it for a later cycle rather than allocate blindly.
      skipped++
      continue
    }

    if (await hasAllocationFor(tenant.id, sub.id, start.toISOString())) {
      skipped++
      continue
    }

    const allowance = recoveryCreditMonthlyAllowance(billzoPlanOf(sub.plan_code))
    const periodStart = start.toISOString()
    const periodEnd = end.toISOString()

    // Residual included balance as of the boundary — replay of included
    // entries created before the new period began. Purchased credits carry
    // forward forever and are unaffected by a boundary.
    const beforeIncluded = await replayBalances(tenant.id, ['included'], periodStart)
    const purchased = (await replayFullBalances(tenant.id)).purchased

    const periodPlan = recoveryCreditPeriodPlan(beforeIncluded.included, allowance)

    if (periodPlan.expiryQuantity > 0) {
      const { error: expiryError } = await supabaseAdmin
        .from('recovery_credit_ledger')
        .insert({
          tenant_id: tenant.id,
          entry_type: 'expiry',
          pool: 'included',
          quantity: -periodPlan.expiryQuantity,
          balance_after: purchased,
          pool_balance_after: 0,
          subscription_id: sub.id,
          period_start: periodStart,
          period_end: periodEnd,
          reason: 'included_credits_expired_at_period_boundary',
        })
      if (expiryError) {
        if (!isUniqueViolation(expiryError)) {
          console.error('[RecoveryCredits] expiry insert failed', expiryError)
          continue
        }
      } else {
        expired++
      }
    }

    const { error: allocError } = await supabaseAdmin
      .from('recovery_credit_ledger')
      .insert({
        tenant_id: tenant.id,
        entry_type: 'allocation',
        pool: 'included',
        quantity: periodPlan.allocationQuantity,
        balance_after: purchased + periodPlan.allocationQuantity,
        pool_balance_after: periodPlan.allocationQuantity,
        subscription_id: sub.id,
        period_start: periodStart,
        period_end: periodEnd,
        reason: `monthly_included_allowance_${allowance}`,
      })

    if (allocError) {
      if (isUniqueViolation(allocError)) {
        skipped++
        continue
      }
      console.error('[RecoveryCredits] allocation insert failed', allocError)
      continue
    }
    allocated++
  }

  return { allocated, expired, skipped }
}

async function hasAllocationFor(tenantId: string, subscriptionId: string, periodStart: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('recovery_credit_ledger')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('subscription_id', subscriptionId)
    .eq('period_start', periodStart)
    .eq('entry_type', 'allocation')
    .maybeSingle()
  return Boolean(data)
}

export interface RecoveryCreditOrder {
  id: string
  razorpay_order_id: string
  razorpay_payment_id: string | null
  packet_code: string
  credits: number
  amount_paise: number
  currency: string
  status: string
}

/**
 * Record the 'purchase' ledger entry for a paid order (idempotent via the
 * UNIQUE order_id purchase index). Must be called only after server-side
 * Razorpay signature verification and amount matching. Snapshots are computed
 * from a replay so balance_after never has to be guessed.
 */
export async function recordRecoveryCreditPurchase(
  tenantId: string,
  order: RecoveryCreditOrder,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const before = await replayFullBalances(tenantId)
  const poolAfter = before.purchased + order.credits

  const { error } = await supabaseAdmin
    .from('recovery_credit_ledger')
    .insert({
      tenant_id: tenantId,
      entry_type: 'purchase',
      pool: 'purchased',
      quantity: order.credits,
      balance_after: before.included + poolAfter,
      pool_balance_after: poolAfter,
      order_id: order.razorpay_order_id,
      payment_id: order.razorpay_payment_id,
      reason: `purchased_packet_${order.packet_code}`,
    })

  if (error) {
    if (isUniqueViolation(error)) return { ok: true } // already recorded
    console.error('[RecoveryCredits] purchase ledger insert failed', error)
    return { ok: false, reason: error.message }
  }
  return { ok: true }
}

/**
 * Record the 'refund' ledger entry for a refunded order (idempotent via the
 * UNIQUE order_id refund index). Call only AFTER the provider clawback
 * succeeded AND the order row's balance still covers the refund — refunding a
 * credit that was already spent would push the purchased pool negative, which
 * the ledger CHECK rejects (treated here as credits_consumed for ops
 * escalation). Purchased credits carry forward forever, so 'purchased balance
 * >= order.credits' is the safe clawback precondition.
 */
export async function recordRecoveryCreditRefund(
  tenantId: string,
  order: RecoveryCreditOrder,
  reason = 'merchant_refund',
): Promise<{ ok: true } | { ok: true; alreadyRefunded: boolean } | { ok: false; reason: string }> {
  // Idempotency FIRST: a refund replay finds the existing refund row and
  // reports alreadyRefunded without touching the balance precondition, which
  // would otherwise see purchased=0 post-refund and wrongly report
  // credits_consumed (the exact-once refund unique index is the backstop).
  const { data: existing } = await supabaseAdmin
    .from('recovery_credit_ledger')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('entry_type', 'refund')
    .eq('order_id', order.razorpay_order_id)
    .maybeSingle()
  if (existing) return { ok: true, alreadyRefunded: true }

  const before = await replayFullBalances(tenantId)
  if (before.purchased < order.credits) {
    return { ok: false, reason: 'credits_consumed' }
  }

  const poolAfter = before.purchased - order.credits
  const { error } = await supabaseAdmin
    .from('recovery_credit_ledger')
    .insert({
      tenant_id: tenantId,
      entry_type: 'refund',
      pool: 'purchased',
      quantity: -order.credits,
      balance_after: before.included + poolAfter,
      pool_balance_after: poolAfter,
      order_id: order.razorpay_order_id,
      payment_id: order.razorpay_payment_id,
      reason,
    })

  if (error) {
    if (isUniqueViolation(error)) return { ok: true, alreadyRefunded: true }
    if (isCheckViolation(error)) return { ok: false, reason: 'credits_consumed' }
    console.error('[RecoveryCredits] refund ledger insert failed', error)
    return { ok: false, reason: error.message }
  }
  return { ok: true }
}

/**
 * Re-arm credit-deferred actions (status='deferred' with metadata.deferred_reason
 * = 'deferred_due_to_credits'). DEfer-is-never-auto-resume is honored here:
 * nothing in the system resumes these automatically — a merchant explicitly
 * repurchases credits or presses Panel's re-enable button. Re-scheduled actions
 * become due immediately (scheduler picks up status='scheduled'; a still-
 * exhausted tenant is re-deferred at dispatch, so this is always safe).
 * Returns the number of actions resumed.
 */
export async function resumeCreditDeferredActions(
  tenantId: string,
  actionIds?: string[],
): Promise<{ resumed: number }> {
  let query = supabaseAdmin
    .from('collection_actions')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .eq('status', 'deferred')

  if (actionIds && actionIds.length > 0) {
    query = query.in('id', actionIds)
  }

  const { data: deferred, error } = await query.limit(1000)
  if (error || !deferred) return { resumed: 0 }

  const resumedAt = new Date().toISOString()
  let resumed = 0
  for (const action of deferred as Array<{ id: string; metadata?: Record<string, unknown> | null }>) {
    const meta = { ...(action.metadata || {}) }
    if (meta.deferred_reason !== RECOVERY_CREDITS_DEFERRED_REASON) continue

    delete meta.deferred_reason
    delete meta.deferred_at

    const { error: updateError } = await supabaseAdmin
      .from('collection_actions')
      .update({
        status: 'scheduled',
        scheduled_at: resumedAt,
        resumed_at: resumedAt,
        metadata: meta,
        updated_at: resumedAt,
      })
      .eq('id', action.id)
      .eq('status', 'deferred')

    if (updateError) continue
    resumed++
  }
  return { resumed }
}

/** UI read path: reconstruct per-pool balances from the ledger. */
export async function getRecoveryCreditBalancesForTenant(
  tenantId: string,
): Promise<RecoveryCreditBalances> {
  return replayFullBalances(tenantId)
}

/** Authoritative current billing period end, from subscriptions (never tenants). */
export async function getRecoveryCreditCurrentPeriodEnd(
  tenantId: string,
): Promise<string | null> {
  const sub = await loadActiveSubscription(tenantId)
  return sub?.current_period_end || null
}