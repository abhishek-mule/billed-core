import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildRecoveryDecision, type RecoveryDecision } from './recovery-decision'
import { computeAutomationState, type AutomationState } from './recovery-evaluation'
import { resolvePolicy, type PlanContext } from '@/lib/recovery/planner'
import { nextBusinessSlot, DEFAULTS as DEFAULT_HOURS } from '@/lib/recovery/business-hours'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { getReminderQuota } from '@/lib/billzo/reminder-quota'

/**
 * P2 — Start Recovery confirmation.
 *
 * This is a projection of `buildRecoveryDecision` + the tenant's policy,
 * not a new engine. Preview is read-only. Confirm creates `collection_actions`
 * with `source='merchant'` (merchant-initiated, not auto-recovery-gated).
 *
 * Flow:
 *   Merchant clicks Start Recovery
 *     → POST /api/recovery/start/preview  (read-only)
 *     → Confirmation panel shows breakdown
 *     → Merchant confirms
 *     → POST /api/recovery/start/confirm  (writes collection_actions)
 *     → "N reminders queued"
 */

export type StartRecoveryPreviewItem = {
  customerId: string
  name: string
  outstanding: number
  invoiceIds: string[]
  maxOverdueDays: number
}

export type StartRecoveryPreviewBlocked = {
  customerId: string
  name: string
  reason: string
}

export type StartRecoveryPreviewNeedsAttention = {
  customerId: string
  name: string
  state: string
  reason: string
}

export type StartRecoveryPreviewPaused = {
  customerId: string
  name: string
  stopCondition: { kind: string; note: string | null }
}

export type StartRecoveryPreview = {
  generatedAt: string
  eligible: StartRecoveryPreviewItem[]
  needsAttention: StartRecoveryPreviewNeedsAttention[]
  blocked: StartRecoveryPreviewBlocked[]
  paused: StartRecoveryPreviewPaused[]
  policy: { policyId: string; steps: number } | null
  estimatedActions: number
  totalOutstanding: number
}

export type StartRecoveryResult = {
  queued: number
  skipped: number
  errors: number
  totalActionsCreated: number
  details: { customerId: string; created: number; error?: string }[]
}

const ACTIVE_STATES = ['active', 'overdue', 'partial_payment', 'promised', 'disputed']

const invoiceOutstanding = (i: any) =>
  Number(i.outstanding_amount) > 0
    ? Number(i.outstanding_amount)
    : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))

function arr_push(map: Map<string, any[]>, key: string, value: any) {
  const arr = map.get(key) || []
  arr.push(value)
  map.set(key, arr)
}

async function buildDeck(tenantId: string) {
  const now = new Date()

  const { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ACTIVE_STATES)
    .limit(100)

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id).filter(Boolean))]
  if (customerIds.length === 0) return { now, customerIds: [] as string[], cards: [] as never[], rows: { customers: [], invoices: [], actions: [], promises: [], waEvents: [] } }

  const [customersRes, invoicesRes, actionsRes, promisesRes, waRes] = await Promise.all([
    supabaseAdmin.from('customers').select('id, customer_name, phone').in('id', customerIds),
    supabaseAdmin
      .from('invoices')
      .select('id, customer_id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, created_at')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('collection_actions')
      .select('id, customer_id, action_type, status, completed_at, invoice_ids, reason, source, scheduled_at')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin.from('payment_promises').select('id, customer_id, promise_date, status').eq('tenant_id', tenantId).in('customer_id', customerIds).limit(500),
    supabaseAdmin
      .from('whatsapp_events')
      .select('customer_id, recovery_attempt_id, delivered_at, read_at, occurred_at, status, direction, message_preview')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(2000),
  ])

  return {
    now,
    customerIds,
    rows: {
      customers: customersRes.data || [],
      invoices: invoicesRes.data || [],
      actions: actionsRes.data || [],
      promises: promisesRes.data || [],
      waEvents: waRes.data || [],
    },
  }
}

/**
 * Get the preview of what Start Recovery would do — read-only.
 */
export async function getStartRecoveryPreview(tenantId: string): Promise<StartRecoveryPreview> {
  const { now, customerIds, rows } = await buildDeck(tenantId)
  if (customerIds.length === 0) {
    return { generatedAt: now.toISOString(), eligible: [], needsAttention: [], blocked: [], paused: [], policy: null, estimatedActions: 0, totalOutstanding: 0 }
  }

  const custMap = new Map(rows.customers.map((c: any) => [c.id, c]))
  const invByCust = new Map<string, any[]>()
  for (const inv of rows.invoices) arr_push(invByCust, inv.customer_id, inv)
  const actionsByCust = new Map<string, any[]>()
  for (const a of rows.actions) arr_push(actionsByCust, a.customer_id, a)
  const promisesByCust = new Map<string, any[]>()
  for (const p of rows.promises) arr_push(promisesByCust, p.customer_id, p)
  const waByCust = new Map<string, any[]>()
  for (const w of rows.waEvents) arr_push(waByCust, w.customer_id, w)

  const eligible: StartRecoveryPreviewItem[] = []
  const needsAttention: StartRecoveryPreviewNeedsAttention[] = []
  const blocked: StartRecoveryPreviewBlocked[] = []
  const paused: StartRecoveryPreviewPaused[] = []

  for (const custId of customerIds) {
    const cust = custMap.get(custId) || {}
    const custInvoices = invByCust.get(custId) || []
    if (custInvoices.length === 0) continue

    const outstanding = custInvoices.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)
    const openInvoiceIds = custInvoices.filter((i: any) => invoiceOutstanding(i) > 0).map((i: any) => i.id)
    if (outstanding <= 0 || openInvoiceIds.length === 0) continue

    const custActions = actionsByCust.get(custId) || []
    const activePromise = (promisesByCust.get(custId) || []).find((p: any) => p.status === 'active')
    const custWa = waByCust.get(custId) || []
    const inbound = custWa.filter((w: any) => w.direction === 'inbound')
    const latestInbound = inbound.sort((x: any, y: any) => +new Date(y.occurred_at || 0) - +new Date(x.occurred_at || 0))[0] || null

    const decision = buildRecoveryDecision({
      customerPhone: cust.phone ?? null,
      invoices: custInvoices.map((i: any) => ({ id: i.id, number: i.invoice_number, outstanding: invoiceOutstanding(i), dueDate: i.due_date, status: i.status, createdAt: i.created_at })),
      actions: custActions.map((a: any) => ({ id: a.id, actionType: a.action_type, status: a.status, invoiceIds: a.invoice_ids || [], completedAt: a.completed_at })),
      deliveryByAction: {},
      promises: (promisesByCust.get(custId) || []).map((p: any) => ({ id: p.id, promiseDate: p.promise_date, status: p.status, createdAt: p.created_at })),
      replies: inbound.map((w: any) => ({ at: w.occurred_at, preview: w.message_preview })),
    })

    const automation = computeAutomationState({
      custInvoices,
      custActions,
      activePromiseDate: activePromise?.promise_date ?? null,
      latestInbound,
      outstanding,
      now,
    })

    const maxOverdue = decision.invoices.length ? Math.max(...decision.invoices.map((i) => i.overdueDays)) : 0

    if (decision.state === 'blocked_phone' || decision.state === 'blocked_transport') {
      blocked.push({ customerId: custId, name: cust.customer_name || 'Customer', reason: decision.reason })
    } else if (decision.state === 'call') {
      needsAttention.push({ customerId: custId, name: cust.customer_name || 'Customer', state: decision.state, reason: decision.reason })
    } else if (decision.state === 'remind' && automation.stopCondition.kind !== 'none') {
      paused.push({ customerId: custId, name: cust.customer_name || 'Customer', stopCondition: automation.stopCondition })
    } else if (decision.state === 'remind' && cust.phone) {
      eligible.push({ customerId: custId, name: cust.customer_name || 'Customer', outstanding, invoiceIds: openInvoiceIds, maxOverdueDays: maxOverdue })
    }
  }

  const policy = await resolvePolicy(tenantId)
  const estimatedActions = policy ? eligible.length * policy.steps.length : eligible.length

  return {
    generatedAt: now.toISOString(),
    eligible,
    needsAttention,
    blocked,
    paused,
    policy: policy ? { policyId: policy.policyId, steps: policy.steps.length } : null,
    estimatedActions,
    totalOutstanding: eligible.reduce((s, e) => s + e.outstanding, 0),
  }
}

/**
 * Confirm Start Recovery — creates source='merchant' collection_actions
 * for each eligible customer. Idempotent: skips customers with an active
 * scheduled reminder already. Returns the count of newly queued actions.
 */
export async function confirmStartRecovery(tenantId: string): Promise<StartRecoveryResult> {
  const { now, customerIds, rows } = await buildDeck(tenantId)
  if (customerIds.length === 0) {
    return { queued: 0, skipped: 0, errors: 0, totalActionsCreated: 0, details: [] }
  }

  const policy = await resolvePolicy(tenantId)
  const quota = await getReminderQuota(tenantId)
  if (quota.exceeded) {
    return { queued: 0, skipped: customerIds.length, errors: 0, totalActionsCreated: 0, details: [] }
  }

  const custMap = new Map(rows.customers.map((c: any) => [c.id, c]))
  const invByCust = new Map<string, any[]>()
  for (const inv of rows.invoices) arr_push(invByCust, inv.customer_id, inv)
  const actionsByCust = new Map<string, any[]>()
  for (const a of rows.actions) arr_push(actionsByCust, a.customer_id, a)
  const promisesByCust = new Map<string, any[]>()
  for (const p of rows.promises) arr_push(promisesByCust, p.customer_id, p)
  const waByCust = new Map<string, any[]>()
  for (const w of rows.waEvents) arr_push(waByCust, w.customer_id, w)

  const details: StartRecoveryResult['details'] = []
  let queued = 0, skipped = 0, errors = 0, totalActionsCreated = 0

  for (const custId of customerIds) {
    const cust = custMap.get(custId) || {}
    const custInvoices = invByCust.get(custId) || []
    const openInvoiceIds = custInvoices.filter((i: any) => invoiceOutstanding(i) > 0).map((i: any) => i.id)
    if (openInvoiceIds.length === 0 || !cust.phone) { skipped++; continue }

    const custActions = actionsByCust.get(custId) || []
    const activePromise = (promisesByCust.get(custId) || []).find((p: any) => p.status === 'active')
    const custWa = waByCust.get(custId) || []
    const inbound = custWa.filter((w: any) => w.direction === 'inbound')
    const latestInbound = inbound.sort((x: any, y: any) => +new Date(y.occurred_at || 0) - +new Date(x.occurred_at || 0))[0] || null

    const decision = buildRecoveryDecision({
      customerPhone: cust.phone,
      invoices: custInvoices.map((i: any) => ({ id: i.id, number: i.invoice_number, outstanding: invoiceOutstanding(i), dueDate: i.due_date, status: i.status, createdAt: i.created_at })),
      actions: custActions.map((a: any) => ({ id: a.id, actionType: a.action_type, status: a.status, invoiceIds: a.invoice_ids || [], completedAt: a.completed_at })),
      deliveryByAction: {},
      promises: (promisesByCust.get(custId) || []).map((p: any) => ({ id: p.id, promiseDate: p.promise_date, status: p.status, createdAt: p.created_at })),
      replies: inbound.map((w: any) => ({ at: w.occurred_at, preview: w.message_preview })),
    })

    const automation = computeAutomationState({
      custInvoices, custActions,
      activePromiseDate: activePromise?.promise_date ?? null,
      latestInbound, outstanding: invoiceOutstanding(custInvoices[0]) * custInvoices.length, now,
    })

    if (decision.state !== 'remind' || !cust.phone || automation.stopCondition.kind !== 'none') { skipped++; continue }

    // Idempotency: skip if any active reminder attempt exists for this
    // customer already (any source) — avoids double-queueing on re-runs.
    const hasActive = custActions.some((a: any) =>
      a.action_type === 'reminder' && ['scheduled', 'processing', 'in_progress'].includes(a.status),
    )
    if (hasActive) { skipped++; continue }

    let created = 0
    if (policy) {
      for (const step of policy.steps) {
        const offsetMs = step.offsetDays * 24 * 60 * 60 * 1000
        const scheduled = nextBusinessSlot(new Date(now.getTime() + offsetMs), DEFAULT_HOURS)
        const actionId = `CA_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${step.sequence}`
        const { error } = await supabaseAdmin.from('collection_actions').insert({
          id: actionId,
          tenant_id: tenantId,
          customer_id: custId,
          invoice_ids: openInvoiceIds,
          action_type: step.actionType,
          status: 'scheduled',
          source: 'merchant',
          provider: step.channel,
          policy_id: policy.policyId,
          trigger_type: step.triggerType,
          template_name: step.templateName,
          scheduled_at: scheduled.toISOString(),
          reason: 'Start Recovery — merchant initiated',
          metadata: { origin: 'start_recovery', stepSequence: step.sequence },
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        if (!error) created++
      }
    } else {
      // No policy — schedule a single immediate reminder
      const actionId = `CA_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const { error } = await supabaseAdmin.from('collection_actions').insert({
        id: actionId,
        tenant_id: tenantId,
        customer_id: custId,
        invoice_ids: openInvoiceIds,
        action_type: 'reminder',
        status: 'scheduled',
        source: 'merchant',
        provider: 'whatsapp',
        trigger_type: 'MANUAL',
        scheduled_at: nextBusinessSlot(now, DEFAULT_HOURS).toISOString(),
        reason: 'Start Recovery — merchant initiated',
        metadata: { origin: 'start_recovery' },
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      if (!error) created++
    }

    if (created > 0) {
      queued++
      totalActionsCreated += created
      try {
        await writeOutboxEvent({
          type: 'recovery.started',
          tenantId,
          entityId: custId,
          payload: { actionsCreated: created, origin: 'start_recovery' },
          idempotencyKey: `start:${tenantId}:${custId}:${now.toISOString().slice(0, 10)}`,
        })
      } catch (err) {
        console.error('[StartRecovery] audit outbox write failed (non-fatal):', err)
      }
    } else {
      errors++
    }

    details.push({ customerId: custId, created, error: undefined })
  }

  return { queued, skipped, errors, totalActionsCreated, details }
}