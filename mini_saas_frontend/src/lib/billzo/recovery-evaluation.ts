import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildRecoveryDecision, type RecoveryDecision } from './recovery-decision'

/**
 * Recovery Evaluation — read-only projection of the recovery worker's
 * persistent automation state onto each open recovery case.
 *
 * This is NOT a decision engine and it WRITES NOTHING. It surfaces the state
 * that the recovery worker already persists so every surface can answer:
 *
 *   "What will BillZo do automatically, when, and what happens after the
 *    customer responds?"
 *
 * Sources (all existing, all written by the recovery worker/actions layer):
 *   - invoices.recovery_stage        — which reminder stage was reached
 *   - invoices.next_recovery_at      — when automation will next evaluate/send
 *   - invoices.last_whatsapp_at      — last automated message time
 *   - collection_actions (scheduled) — pending automation queue entries
 *   - whatsapp_events / promises     — stop-condition evidence (replied/promise/payment)
 *
 * TRUTHFULNESS: next_recovery_at is only presented as a future plan when it is
 * in the future. A stale (past) next_recovery_at is labelled "evaluation
 * overdue" — BillZo has not yet re-evaluated — never shown as a future plan.
 */

export type StopCondition = {
  kind: 'replied' | 'promise' | 'payment' | 'none'
  note: string | null
}

/**
 * AutomationState — what automation will (or won't) do for ONE customer.
 * Pure: derived solely from passed-in rows. No DB access, no writes.
 */
export type AutomationState = {
  stage: string
  nextEvaluationAt: string | null
  evaluationOverdue: boolean
  scheduledActions: {
    id: string
    actionType: string
    scheduledAt: string
    reason: string | null
  }[]
  stopCondition: StopCondition
  lastWhatsAppAt: string | null
}

type AutomationInput = {
  custInvoices: Record<string, any>[]
  custActions: Record<string, any>[]
  activePromiseDate: string | null
  latestInbound: { occurred_at?: string | null; message_preview?: string | null } | null
  outstanding: number
  now?: Date
}

export function computeAutomationState(input: AutomationInput): AutomationState {
  const now = input.now || new Date()

  // Worker's persisted automation state (strongest = furthest next_recovery_at)
  const open = input.custInvoices.filter((i: any) => {
    const out = Number(i.outstanding_amount) > 0
      ? Number(i.outstanding_amount)
      : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))
    return out > 0
  })
  const strongest = [...open].sort((a: any, b: any) => {
    const aF = new Date(a.next_recovery_at || 0).getTime()
    const bF = new Date(b.next_recovery_at || 0).getTime()
    return bF - aF
  })[0] || open[0]

  const nextEvaluationAt = strongest?.next_recovery_at || null
  const evaluationOverdue =
    !!nextEvaluationAt && new Date(nextEvaluationAt).getTime() < now.getTime()

  const scheduledActions = (input.custActions || [])
    .filter((a: any) => a.status === 'scheduled')
    .map((a: any) => ({
      id: a.id,
      actionType: a.action_type,
      scheduledAt: a.scheduled_at,
      reason: a.reason || null,
    }))
    .sort((x: any, y: any) => +new Date(x.scheduledAt) - +new Date(y.scheduledAt))

  let stopCondition: StopCondition
  if (input.outstanding <= 0) {
    stopCondition = { kind: 'payment', note: 'Payment received — recovery stopped' }
  } else if (input.activePromiseDate) {
    const d = new Date(input.activePromiseDate)
    stopCondition = {
      kind: 'promise',
      note: `Payment promised — automation paused until ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
    }
  } else if (input.latestInbound) {
    stopCondition = {
      kind: 'replied',
      note: input.latestInbound.message_preview || 'Customer replied — automation paused',
    }
  } else {
    stopCondition = { kind: 'none', note: null }
  }

  return {
    stage: strongest?.recovery_stage || 't0_soft',
    nextEvaluationAt,
    evaluationOverdue,
    scheduledActions,
    stopCondition,
    lastWhatsAppAt: strongest?.last_whatsapp_at || null,
  }
}

export type EvaluationUnit = {
  customerId: string
  customerName: string
  phone: string | null
  outstanding: number
  decision: RecoveryDecision
  automation: AutomationState
}

export type RecoveryEvaluation = {
  generatedAt: string
  units: EvaluationUnit[]
  totals: {
    customers: number
    outstanding: number
    scheduledActions: number
    pausedByReply: number
    pausedByPromise: number
    awaitingEvaluation: number
  }
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

export async function getRecoveryEvaluation(tenantId: string): Promise<RecoveryEvaluation> {
  const now = new Date()

  const { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ACTIVE_STATES)
    .limit(100)

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id).filter(Boolean))]
  if (customerIds.length === 0) {
    return {
      generatedAt: now.toISOString(),
      units: [],
      totals: {
        customers: 0, outstanding: 0, scheduledActions: 0,
        pausedByReply: 0, pausedByPromise: 0, awaitingEvaluation: 0,
      },
    }
  }

  const [customersRes, invoicesRes, actionsRes, promisesRes, waRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone, automation_mode')
      .in('id', customerIds),
    supabaseAdmin
      .from('invoices')
      .select(
        'id, customer_id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, created_at, recovery_stage, next_recovery_at, last_whatsapp_at',
      )
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('collection_actions')
      .select('id, customer_id, action_type, status, scheduled_at, completed_at, invoice_ids, reason')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('payment_promises')
      .select('id, customer_id, promise_date, status')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('whatsapp_events')
      .select('customer_id, recovery_attempt_id, delivered_at, read_at, occurred_at, status, direction, message_preview')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(2000),
  ])

  const customers = customersRes.data || []
  const invoices = invoicesRes.data || []
  const actions = actionsRes.data || []
  const promises = promisesRes.data || []
  const waEvents = waRes.data || []

  const custMap = new Map(customers.map((c: any) => [c.id, c]))
  const invByCust = new Map<string, any[]>()
  for (const inv of invoices) arr_push(invByCust, inv.customer_id, inv)
  const actionsByCust = new Map<string, any[]>()
  for (const a of actions) arr_push(actionsByCust, a.customer_id, a)
  const promisesByCust = new Map<string, any[]>()
  for (const p of promises) arr_push(promisesByCust, p.customer_id, p)
  const waByCust = new Map<string, any[]>()
  for (const w of waEvents) arr_push(waByCust, w.customer_id, w)

  const units: EvaluationUnit[] = []

  for (const custId of customerIds) {
    const cust = custMap.get(custId) || {}
    const custInvoices = invByCust.get(custId) || []
    if (custInvoices.length === 0) continue

    const outstanding = custInvoices.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)

    const activePromise = (promisesByCust.get(custId) || []).find((p: any) => p.status === 'active')
    const custWa = waByCust.get(custId) || []
    const inbound = custWa
      .filter((w: any) => w.direction === 'inbound')
      .sort((x: any, y: any) => +new Date(y.occurred_at || 0) - +new Date(x.occurred_at || 0))
    const latestInbound = inbound[0] || null

    const decision = buildRecoveryDecision({
      customerPhone: cust.phone ?? null,
      invoices: custInvoices.map((i: any) => ({
        id: i.id, number: i.invoice_number, outstanding: invoiceOutstanding(i),
        dueDate: i.due_date, status: i.status, createdAt: i.created_at,
      })),
      actions: (actionsByCust.get(custId) || []).map((a: any) => ({
        id: a.id, actionType: a.action_type, status: a.status,
        invoiceIds: a.invoice_ids || [], completedAt: a.completed_at,
      })),
      deliveryByAction: {},
      promises: (promisesByCust.get(custId) || []).map((p: any) => ({
        id: p.id, promiseDate: p.promise_date, status: p.status, createdAt: p.created_at,
      })),
      replies: inbound.map((w: any) => ({ at: w.occurred_at || w.created_at, preview: w.message_preview })),
    })

    units.push({
      customerId: custId,
      customerName: cust.customer_name || 'Customer',
      phone: cust.phone || null,
      outstanding,
      decision,
      automation: computeAutomationState({
        custInvoices,
        custActions: actionsByCust.get(custId) || [],
        activePromiseDate: activePromise?.promise_date || null,
        latestInbound,
        outstanding,
        now,
      }),
    })
  }

  const totals = {
    customers: units.length,
    outstanding: units.reduce((s, u) => s + u.outstanding, 0),
    scheduledActions: units.reduce((s, u) => s + u.automation.scheduledActions.length, 0),
    pausedByReply: units.filter((u) => u.automation.stopCondition.kind === 'replied').length,
    pausedByPromise: units.filter((u) => u.automation.stopCondition.kind === 'promise').length,
    awaitingEvaluation: units.filter((u) => u.automation.evaluationOverdue).length,
  }

  return { generatedAt: now.toISOString(), units, totals }
}