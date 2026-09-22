// ============================================================
// recovery-escalation.ts — Phase C Recovery Escalation Pack
// ============================================================
//
// Three domains, one table (recovery_escalations), per Rev 2 spec:
//   A. Recovery Decision  — assessment -> recommendation -> merchant decision
//   B. Recovery Case      — prepare (evidence snapshot, RC-#), GET, export
//   C. Settlement Workflow— settlement offer + draft notice (never sends)
//
// The pure rule math lives in @billzo/shared recovery/escalation.ts; this
// module is the runtime adapter that reads the live recovery spine
// (recovery_cases -> customer -> invoices -> collection_actions ->
// whatsapp_events -> payment_promises -> recovery_sessions -> payments) and
// writes/reads recovery_escalations through supabaseAdmin.
//
// Invariants this code preserves (mirrored mechanically by migration 099):
//   * exactly one ACTIVE escalation per case; settled/cancelled releases it
//   * basis IS frozen once written (evidence the merchant was shown)
//   * snapshot IS immutable after prepare (never rewritten)
//   * no-causal-evidence: an unverified link renders Unknown, never attributed
//   * Recovery Credits are NEVER touched by escalation code
// ============================================================

import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import {
  escalationDecision,
  escalationStageFromDays,
  buildEffortSummary,
  buildPackEvidence,
  type AttributionFidelity,
  type EscalationBasisItem,
  type RecoveryEscalationDecision,
  type EscalationStage,
  type MerchantDecision,
  type RecoveryEffortSummary,
  type SettlementOffer,
  type EscalationStatus,
} from '@billzo/shared'

// ---------------------------------------------------------------------------
// Types — the Assessment / Pack contracts the API routes and UI consume
// ---------------------------------------------------------------------------

export interface RecoveryAssessment {
  caseId: string
  customerId: string
  customerName: string | null
  phone: string | null
  recommended: boolean
  /** INTERNAL ONLY — ordering. Only surfaced behind ?debug=true. */
  grade: number
  basis: EscalationBasisItem[]
  stage: EscalationStage
  nextMove: string
  effortSummary: RecoveryEffortSummary
  escalation: EscalationRow | null
  generatedAt: string
}

export interface EscalationRow {
  id: string
  tenantId: string
  caseId: string
  customerId: string
  primaryInvoiceId: string
  status: EscalationStatus
  recommended: boolean
  grade: number
  basis: EscalationBasisItem[]
  merchantDecision: MerchantDecision | null
  merchantNote: string | null
  settlementOffer: SettlementOffer | null
  snapshot: RecoveryCaseSnapshot | null
  preparedBy: string | null
  preparedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RecoveryCaseSnapshot {
  version: 1
  caseNumber: string
  asOf: string
  merchantName: string | null
  customer: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    gstin: string | null
    address: string | null
  }
  primaryInvoice: PackInvoice
  invoices: PackInvoice[]
  outstanding: number
  invoiceCount: number
  maxOverdueDays: number
  effort: RecoveryEffortSummary
  evidence: {
    communications: PackCommunication[]
    promises: PackPromise[]
    payments: PackPayment[]
    actions: PackAction[]
  }
  timeline: PackTimelineItem[]
  completeness: {
    invoices: boolean
    payments: boolean
    whatsapp: boolean
    promises: boolean
    calls: boolean
    timeline: boolean
  }
  attributionNote: string
}

export interface PackInvoice {
  id: string
  number: string
  date: string | null
  due: string | null
  amount: number
  paid: number
  outstanding: number
  status: string | null
}

export interface PackCommunication {
  fidelity: AttributionFidelity
  kind: string
  summary: string
  occurredAt: string | null
  sourceId: string | null
  customerPhone: string | null
  customerName: string | null
}

export interface PackPromise {
  id: string
  promiseDate: string | null
  amount: number
  status: string | null
  triggeredByActionId: string | null
}

export interface PackPayment {
  id: string
  invoiceId: string | null
  amount: number
  method: string | null
  status: string | null
  paidAt: string | null
  orderId: string | null
}

export interface PackAction {
  id: string
  actionType: string
  status: string | null
  scheduledAt: string | null
  completedAt: string | null
  source: string | null
}

export interface PackTimelineItem {
  eventType: string
  occurredAt: string
  sourceId: string | null
}

export interface PreparedRecoveryCase {
  alreadyPrepared: boolean
  status: EscalationStatus
  caseNumber: string
  escalationId: string
  preparedAt: string | null
  snapshot: RecoveryCaseSnapshot | null
  /** True when prepare was blocked because the case does not meet the bar. */
  notRecommended?: boolean
}

export interface SettlementNoticeDraft {
  generatedAt: string
  subject: string
  body: string
  /** The merchant MUST review, edit, and send through their own channel. */
  neverAutoSent: true
}

function mapEscalationRow(r: any): EscalationRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    caseId: r.case_id,
    customerId: r.customer_id,
    primaryInvoiceId: r.primary_invoice_id,
    status: r.status as EscalationStatus,
    recommended: r.recommended,
    grade: r.grade,
    basis: (r.basis as EscalationBasisItem[]) || [],
    merchantDecision: r.merchant_decision as MerchantDecision | null,
    merchantNote: r.merchant_note ?? null,
    settlementOffer: r.settlement_offer ?? null,
    snapshot: r.snapshot ?? null,
    preparedBy: r.prepared_by ?? null,
    preparedAt: r.prepared_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Evidence loaders (live recovery spine)
// ---------------------------------------------------------------------------

interface EvidenceBundle {
  customer: any
  invoices: any[]
  actions: any[]
  waEvents: any[]
  promises: any[]
  sessions: any[]
  payments: any[]
  timeline: any[]
  caseRow: any
}

async function loadCaseEvidence(tenantId: string, caseId: string): Promise<EvidenceBundle | null> {
  const { data: caseRow, error: caseErr } = await supabaseAdmin
    .from('recovery_cases')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', caseId)
    .maybeSingle()
  if (caseErr || !caseRow) return null

  const customerId = caseRow.customer_id
  if (!customerId) return null

  const [cust, invoices, actions, promises, sessions, payments, timeline] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from('invoices')
      .select(
        'id, customer_id, invoice_number, invoice_date, date, due_date, total, grand_total, paid_amount, outstanding_amount, status, gstin, created_at',
      )
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .limit(500),
    supabaseAdmin
      .from('collection_actions')
      .select('id, action_type, status, scheduled_at, completed_at, source, metadata')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .limit(1000),
    supabaseAdmin
      .from('payment_promises')
      .select('id, promise_date, amount, status, triggered_by_action_id, notes, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .limit(500),
    supabaseAdmin
      .from('recovery_sessions')
      .select('id, outcome, started_at, ended_at, notes')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .limit(500),
    supabaseAdmin
      .from('payments')
      .select('id, invoice_id, amount, payment_method, status, paid_at, razorpay_order_id, metadata')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'paid')
      .limit(500),
    supabaseAdmin
      .from('recovery_case_events')
      .select('id, event_type, payload, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })
      .limit(1000),
  ])

  const rawActions = actions.data || []
  const actionIds = rawActions.map((a: any) => a.id).filter(Boolean)

  const { data: waEvents } = actionIds.length
    ? await supabaseAdmin
        .from('whatsapp_events')
        .select(
          'id, customer_id, invoice_id, direction, status, occurred_at, delivered_at, read_at, message_preview, recovery_attempt_id, billzo_message_id',
        )
        .eq('tenant_id', tenantId)
        .in('recovery_attempt_id', actionIds)
        .limit(2000)
    : { data: [] as any[] }

  return {
    customer: cust.data || null,
    invoices: invoices.data || [],
    actions: rawActions,
    waEvents: waEvents || [],
    promises: promises.data || [],
    sessions: sessions.data || [],
    payments: payments.data || [],
    timeline: timeline.data || [],
    caseRow,
  }
}

function outstandingAmount(i: any): number {
  const outstanding = Number(i.outstanding_amount)
  if (Number.isFinite(outstanding) && outstanding > 0) return outstanding
  return Math.max(0, Number(i.grand_total ?? i.total ?? 0) - (Number(i.paid_amount) || 0))
}

function daysOverdue(due: string | null): number {
  if (!due) return 0
  const days = Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000)
  return days > 0 ? days : 0
}

function caseInvoiceNumber(i: any): string {
  return String(i.invoice_number ?? '').trim() || i.id.slice(-8).toUpperCase()
}

// ---------------------------------------------------------------------------
// Domain A — Recovery Decision
// ---------------------------------------------------------------------------

export function escalationNextMove(
  recommendation: { recommended: boolean; stage: EscalationStage },
  escalation: EscalationRow | null,
): string {
  if (escalation?.status === 'prepared' || escalation?.status === 'notified') {
    return escalation.snapshot?.caseNumber
      ? `Recovery Case ${escalation.snapshot.caseNumber} prepared`
      : 'Recovery Case prepared'
  }
  if (escalation?.merchantDecision === 'offer_plan') return 'Offer payment plan'
  if (escalation?.merchantDecision === 'pause') return 'Recovery paused'
  if (escalation?.merchantDecision === 'decline') return 'Recovery declined'
  if (recommendation.recommended) return 'Prepare Recovery Case'
  if (recommendation.stage === 'critical' || recommendation.stage === 'urgent') {
    return 'Continue automated recovery'
  }
  return 'Monitoring'
}

function buildInput(e: EvidenceBundle) {
  const relevantInvoices = e.invoices.filter((i: any) => outstandingAmount(i) > 0)
  const outstanding = relevantInvoices.reduce((s: number, i: any) => s + outstandingAmount(i), 0)
  const maxOverdueDays = relevantInvoices.length
    ? Math.max(...relevantInvoices.map((i: any) => daysOverdue(i.due_date)))
    : 0

  // Broken promises: canonical transition log (promised -> overdue), topped up by
  // payment_promises marked broken when the decision-log lane is empty.
  const transitionBroken = e.timeline.filter(
    (t: any) =>
      t.event_type === 'transition' &&
      String(t.payload?.from_recovery_state) === 'promised' &&
      String(t.payload?.to_recovery_state) === 'overdue',
  ).length
  const promiseBroken = e.promises.filter((p: any) => p.status === 'broken').length
  const brokenPromises = Math.max(transitionBroken, promiseBroken)

  // Ignored reminders: outbound sent/delivered/read since the case's last activity
  // (mirrors get_priority_cases ignored_reminders).
  const lastActivity = e.caseRow.last_activity_at ?? e.caseRow.created_at
  const ignoredReminders = e.waEvents.filter(
    (w: any) =>
      w.direction === 'outbound' &&
      ['sent', 'delivered', 'read'].includes(w.status) &&
      (!lastActivity || new Date(w.occurred_at).getTime() > new Date(lastActivity).getTime()),
  ).length

  // Unanswered calls: recorded no-answer sessions, topped up by non-cancelled
  // call/visit actions when the sessions lane is empty.
  const unAnsweredSessions = e.sessions.filter((s: any) => s.outcome === 'no_answer').length
  const callActions = e.actions.filter((a: any) =>
    ['call', 'follow_up_call', 'visit'].includes(a.action_type ?? ''),
  )
  const unansweredCalls = Math.max(
    unAnsweredSessions,
    callActions.filter((a: any) => a.status !== 'cancelled').length,
  )

  const hasActiveArrangement = e.promises.some(
    (p: any) => p.status === 'active' && new Date(p.promise_date).getTime() > Date.now(),
  )

  return {
    relevantInvoices,
    outstanding,
    maxOverdueDays,
    brokenPromises,
    ignoredReminders,
    unansweredCalls,
    hasActiveArrangement,
  }
}

function buildEffortFromEvidence(e: EvidenceBundle): RecoveryEffortSummary {
  const events: Array<{ channel: any; occurredAt: string }> = []

  for (const w of e.waEvents) {
    if (
      w.direction === 'outbound' &&
      ['sent', 'delivered', 'read'].includes(w.status) &&
      w.occurred_at
    ) {
      events.push({ channel: 'whatsapp', occurredAt: w.occurred_at })
    }
  }
  for (const a of e.actions) {
    const t = a.action_type ?? ''
    if (t.includes('follow')) {
      if (a.completed_at || a.scheduled_at) {
        events.push({ channel: 'followups', occurredAt: a.completed_at || a.scheduled_at })
      }
    } else if (t === 'call' || t === 'follow_up_call') {
      if (a.completed_at || a.scheduled_at) {
        events.push({ channel: 'calls', occurredAt: a.completed_at || a.scheduled_at })
      }
    }
  }
  for (const s of e.sessions) {
    if (s.outcome === 'no_answer' && s.started_at) {
      events.push({ channel: 'calls', occurredAt: s.started_at })
    }
  }
  for (const p of e.promises) {
    if (p.created_at) events.push({ channel: 'promises', occurredAt: p.promise_date || p.created_at })
  }
  for (const pay of e.payments) {
    if (pay.paid_at) events.push({ channel: 'payments', occurredAt: pay.paid_at })
  }

  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const window =
    events.length > 0
      ? { start: events[0].occurredAt, end: events[events.length - 1].occurredAt }
      : { start: new Date().toISOString(), end: new Date().toISOString() }

  return buildEffortSummary(events, window)
}

// ---------------------------------------------------------------------------
// Domain A (cont.) — Assessment + slot persistence
// ---------------------------------------------------------------------------

async function getActiveEscalation(
  tenantId: string,
  caseId: string,
): Promise<EscalationRow | null> {
  const { data } = await supabaseAdmin
    .from('recovery_escalations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('case_id', caseId)
    .not('status', 'in', '(settled,cancelled)')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data ? mapEscalationRow(data) : null
}

/** Refresh the slot's recommended/grade (derived) — basis stays frozen. */
async function withRefreshedDerived(
  existing: EscalationRow,
  decision: RecoveryEscalationDecision,
): Promise<EscalationRow> {
  if (existing.status === 'settled' || existing.status === 'cancelled') return existing
  const target = (decision.recommended ? 'recommended' : 'assessed') as EscalationStatus
  if (
    existing.status === target &&
    existing.recommended === decision.recommended &&
    existing.grade === decision.grade
  ) {
    return existing
  }
  const { data: updated } = await supabaseAdmin
    .from('recovery_escalations')
    .update({
      status: target,
      recommended: decision.recommended,
      grade: decision.grade,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .maybeSingle()
  return updated ? mapEscalationRow(updated) : existing
}

/**
 * Assess a recovery case (Domain A). On first assessment this persists an
 * active escalation slot in recovery_escalations (status assessed/recommended,
 * basis FROZEN). Later assessments refresh recommended/grade but never rewrite
 * the stored basis — that is the evidence the merchant was shown.
 */
export async function assessRecoveryCase(
  tenantId: string,
  caseId: string,
): Promise<RecoveryAssessment | null> {
  const e = await loadCaseEvidence(tenantId, caseId)
  if (!e) return null

  const input = buildInput(e)
  const decision = escalationDecision({
    overdueDays: input.maxOverdueDays,
    outstanding: input.outstanding,
    invoiceCount: input.relevantInvoices.length,
    brokenPromises: input.brokenPromises,
    ignoredReminders: input.ignoredReminders,
    unansweredCalls: input.unansweredCalls,
    hasActiveArrangement: input.hasActiveArrangement,
  })

  const effortSummary = buildEffortFromEvidence(e)
  let escalation = await getActiveEscalation(tenantId, caseId)

  if (!escalation) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('recovery_escalations')
      .insert({
        tenant_id: tenantId,
        case_id: caseId,
        customer_id: e.caseRow.customer_id,
        primary_invoice_id: input.relevantInvoices[0]?.id ?? e.invoices[0]?.id ?? null,
        status: decision.recommended ? 'recommended' : 'assessed',
        recommended: decision.recommended,
        grade: decision.grade,
        basis: decision.basis,
      })
      .select()
      .maybeSingle()

    if (insertErr) {
      // Race lost on the partial-unique slot -> another request created it first.
      const raced = await getActiveEscalation(tenantId, caseId)
      if (raced) {
        escalation = await withRefreshedDerived(raced, decision)
      } else {
        throw insertErr
      }
    } else {
      escalation = mapEscalationRow(inserted)
    }
  } else {
    if (existingBasisEmpty(escalation) && decision.basis.length > 0) {
      // Slot exists with a default empty basis — safe to persist the first basis.
      const { data: updated } = await supabaseAdmin
        .from('recovery_escalations')
        .update({
          basis: decision.basis,
          status: decision.recommended ? 'recommended' : 'assessed',
          recommended: decision.recommended,
          grade: decision.grade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', escalation.id)
        .select()
        .maybeSingle()
      if (updated) escalation = mapEscalationRow(updated)
    } else {
      escalation = await withRefreshedDerived(escalation, decision)
    }
  }

  return {
    caseId,
    customerId: e.caseRow.customer_id,
    customerName: e.customer?.customer_name ?? null,
    phone: e.customer?.phone ?? null,
    recommended: decision.recommended,
    grade: decision.grade,
    basis: escalation.basis && escalation.basis.length ? escalation.basis : decision.basis,
    stage: escalationStageFromDays(input.maxOverdueDays),
    nextMove: escalationNextMove(
      { recommended: decision.recommended, stage: escalationStageFromDays(input.maxOverdueDays) },
      escalation,
    ),
    effortSummary,
    escalation,
    generatedAt: new Date().toISOString(),
  }
}

function existingBasisEmpty(escalation: EscalationRow): boolean {
  return !Array.isArray(escalation.basis) || escalation.basis.length === 0
}

// ---------------------------------------------------------------------------
// Merchant decision (decide) — records decision; authorize emits the event
// ---------------------------------------------------------------------------

export interface MerchantDecisionInput {
  decision: MerchantDecision
  note?: string | null
  /** Emit merchant.escalated when decision = authorize (the authorization record). */
  emitEscalatedEvent?: boolean
}

/**
 * Record the merchant's decision on the escalation slot (Domain A). A merchant
 * can pause / offer a plan / decline without advancing the pack status. Only
 * authorize emits merchant.escalated — through the SAME outbox path the command
 * center slash-commands use (recovery/page.tsx).
 */
export async function recordMerchantDecision(
  tenantId: string,
  caseId: string,
  _actorId: string | null,
  input: MerchantDecisionInput,
): Promise<{ escalation: EscalationRow; eventId?: string }> {
  let escalation = await getActiveEscalation(tenantId, caseId)
  if (!escalation) {
    const assessment = await assessRecoveryCase(tenantId, caseId)
    escalation = assessment?.escalation ?? null
    if (!escalation) throw new Error('Recovery case not found')
  }

  const { data: updated } = await supabaseAdmin
    .from('recovery_escalations')
    .update({
      merchant_decision: input.decision,
      merchant_note: input.note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', escalation.id)
    .select()
    .maybeSingle()
  escalation = updated ? mapEscalationRow(updated) : escalation

  if (input.decision === 'authorize' && input.emitEscalatedEvent) {
    const eventId = await writeOutboxEvent({
      type: 'merchant.escalated',
      tenantId,
      entityId: caseId,
      payload: {
        customerId: escalation.customerId,
        caseId,
        escalationId: escalation.id,
        merchantDecision: input.decision,
        merchantNote: input.note ?? null,
        merchantAction: input.note ?? 'Merchant authorized escalation',
      },
    })
    return { escalation, eventId }
  }

  return { escalation }
}

// ---------------------------------------------------------------------------
// Domain B — Recovery Case (evidence pack, customer-level)
// ---------------------------------------------------------------------------

function buildCompleteness(e: EvidenceBundle) {
  const hasCalls =
    e.sessions.length > 0 || e.actions.some((a: any) => (a.action_type ?? '').includes('call'))
  return {
    invoices: e.invoices.some((i: any) => outstandingAmount(i) > 0),
    payments: e.payments.length > 0,
    whatsapp: e.waEvents.some((w: any) => w.direction === 'outbound'),
    promises: e.promises.length > 0,
    calls: hasCalls,
    timeline: e.timeline.length > 0,
  }
}

function toPackInvoice(i: any): PackInvoice {
  return {
    id: i.id,
    number: caseInvoiceNumber(i),
    date: i.invoice_date || i.created_at || null,
    due: i.due_date || null,
    amount: Number(i.grand_total ?? i.total ?? 0),
    paid: Number(i.paid_amount) || 0,
    outstanding: outstandingAmount(i),
    status: i.status ?? null,
  }
}

function buildSnapshot(
  e: EvidenceBundle,
  input: ReturnType<typeof buildInput>,
  effort: RecoveryEffortSummary,
  merchantName: string | null,
  seq: number,
): RecoveryCaseSnapshot {
  const relevant = input.relevantInvoices.map(toPackInvoice)

  const primaryInvoice = [...relevant].sort(
    (a, b) => daysOverdue(b.due) - daysOverdue(a.due) || b.outstanding - a.outstanding,
  )[0]

  // Customer-level pack: primary invoice first, then the rest newest-first.
  const invoices = primaryInvoice
    ? [
        primaryInvoice,
        ...relevant
          .filter((r: any) => r.id !== primaryInvoice.id)
          .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))),
      ]
    : relevant

  const communications = buildPackEvidence(
    e.waEvents
      .filter((w: any) => w.direction === 'outbound')
      .sort((a: any, b: any) => String(a.occurred_at ?? '').localeCompare(String(b.occurred_at ?? '')))
      .map((w: any) => ({
        attributedCustomerId:
          w.customer_id && (!e.customer || w.customer_id === e.customer.id) ? w.customer_id : null,
        hasActionId: Boolean(w.billzo_message_id) || Boolean(w.recovery_attempt_id),
        source: (w.status ? 'provider' : 'whatsapp') as 'whatsapp' | 'provider',
        kind: 'reminder_sent',
        summary: `Outbound reminder: ${w.status ?? 'recorded'}`,
        occurredAt: w.occurred_at ?? null,
        sourceId: w.billzo_message_id || w.recovery_attempt_id || null,
      })),
    { name: e.customer?.customer_name ?? null, phone: e.customer?.phone ?? null },
  )

  const timeline: PackTimelineItem[] = e.timeline.map((t: any) => ({
    eventType: t.event_type,
    occurredAt: t.created_at,
    sourceId: t.source_event_id ?? t.id,
  }))

  return {
    version: 1 as const,
    caseNumber: `RC-${primaryInvoice?.number ?? 'CASE'}-${seq}`,
    asOf: new Date().toISOString(),
    merchantName,
    customer: {
      id: e.customer?.id ?? '',
      name: e.customer?.customer_name ?? null,
      phone: e.customer?.phone ?? null,
      email: e.customer?.email ?? null,
      gstin: e.invoices.find((i: any) => i.gstin)?.gstin ?? null,
      address: e.customer?.billing_address ?? e.customer?.shipping_address ?? null,
    },
    primaryInvoice:
      primaryInvoice ??
      ({ id: '', number: 'CASE', date: null, due: null, amount: 0, paid: 0, outstanding: 0, status: null } as PackInvoice),
    invoices,
    outstanding: input.outstanding,
    invoiceCount: relevant.length,
    maxOverdueDays: input.maxOverdueDays,
    effort,
    evidence: {
      communications,
      promises: e.promises.map((p: any) => ({
        id: p.id,
        promiseDate: p.promise_date ?? p.created_at ?? null,
        amount: Number(p.amount) || 0,
        status: p.status ?? null,
        triggeredByActionId: p.triggered_by_action_id ?? null,
      })),
      payments: e.payments.map((pay: any) => ({
        id: pay.id,
        invoiceId: pay.invoice_id ?? null,
        amount: Number(pay.amount) || 0,
        method: pay.payment_method ?? null,
        status: pay.status ?? null,
        paidAt: pay.paid_at ?? null,
        orderId: pay.razorpay_order_id ?? null,
      })),
      actions: e.actions.map((a: any) => ({
        id: a.id,
        actionType: a.action_type ?? '',
        status: a.status ?? null,
        scheduledAt: a.scheduled_at ?? null,
        completedAt: a.completed_at ?? null,
        source: a.source ?? null,
      })),
    },
    timeline,
    completeness: buildCompleteness(e),
    attributionNote:
      'Every linkage states its confidence. Unknown (no action_id stored) events render without customer attribution (Phase 1.5 093 backfill outcome).',
  }
}

function buildCaseNumber(primaryInvoiceNumber: string | null, seq: number): string {
  const clean = (primaryInvoiceNumber || 'CASE').replace(/[^A-Za-z0-9-]/g, '').slice(0, 12)
  return `RC-${clean}-${seq}`
}

/**
 * Prepare the Recovery Case (Domain B). Idempotent via the partial unique index:
 * a second prepare for the same ACTIVE slot returns the already-prepared pack.
 * Re-prepare is only allowed after the slot is cancelled/settled.
 *
 * `override` permits preparing a case BillZo does not recommend (explicit
 * merchant override — the pack is still evidence-backed).
 */
export async function prepareRecoveryCase(
  tenantId: string,
  caseId: string,
  _actorId: string | null,
  opts: { override?: boolean } = {},
): Promise<PreparedRecoveryCase | null> {
  const e = await loadCaseEvidence(tenantId, caseId)
  if (!e) return null

  const input = buildInput(e)
  const decision = escalationDecision({
    overdueDays: input.maxOverdueDays,
    outstanding: input.outstanding,
    invoiceCount: input.relevantInvoices.length,
    brokenPromises: input.brokenPromises,
    ignoredReminders: input.ignoredReminders,
    unansweredCalls: input.unansweredCalls,
    hasActiveArrangement: input.hasActiveArrangement,
  })

  const effort = buildEffortFromEvidence(e)
  let escalation = await getActiveEscalation(tenantId, caseId)

  // Already prepared -> return the immutable pack (snapshot never rewrites).
  if (escalation?.status === 'prepared' || escalation?.status === 'notified') {
    return {
      alreadyPrepared: true,
      status: escalation.status,
      caseNumber: escalation.snapshot?.caseNumber ?? 'RC-...',
      escalationId: escalation.id,
      preparedAt: escalation.preparedAt,
      snapshot: escalation.snapshot,
    }
  }
  // A slot in a final state must be released before re-preparing.
  if (escalation && (escalation.status === 'settled' || escalation.status === 'cancelled')) {
    escalation = null
  }

  if (!decision.recommended && !opts.override) {
    return {
      alreadyPrepared: false,
      status: 'assessed',
      caseNumber: '',
      escalationId: '',
      preparedAt: null,
      snapshot: null,
      notRecommended: true,
    }
  }

  // Deterministic per-invoice sequence (no global counter race).
  const primaryInvoiceId = input.relevantInvoices[0]?.id ?? e.invoices[0]?.id ?? null
  const primaryInvoice = e.invoices.find((i: any) => i.id === primaryInvoiceId) ?? null

  const { count } = await supabaseAdmin
    .from('recovery_escalations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('primary_invoice_id', primaryInvoiceId)
  const seq = (count ?? 0) + 1

  const caseNumber = buildCaseNumber(primaryInvoice ? caseInvoiceNumber(primaryInvoice) : null, seq)

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('company_name')
    .eq('id', tenantId)
    .maybeSingle()

  const snapshot = buildSnapshot(e, input, effort, tenant?.company_name ?? null, seq)

  if (escalation) {
    // Pre-prepare slot (assessed/recommended) -> advance to prepared with the snapshot.
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('recovery_escalations')
      .update({
        status: 'prepared',
        snapshot,
        prepared_by: _actorId,
        prepared_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', escalation.id)
      .select()
      .maybeSingle()
    if (updateErr) throw updateErr
    if (updated) {
      return {
        alreadyPrepared: false,
        status: 'prepared',
        caseNumber,
        escalationId: updated.id,
        preparedAt: updated.prepared_at,
        snapshot,
      }
    }
  }

  // No slot yet (assessment was skipped) -> create the prepared row directly.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('recovery_escalations')
    .insert({
      tenant_id: tenantId,
      case_id: caseId,
      customer_id: e.caseRow.customer_id,
      primary_invoice_id: primaryInvoiceId,
      status: 'prepared',
      recommended: decision.recommended,
      grade: decision.grade,
      basis: decision.basis,
      snapshot,
      prepared_by: _actorId,
      prepared_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle()

  if (insertErr) {
    const raced = await getActiveEscalation(tenantId, caseId)
    if (raced?.status === 'prepared' || raced?.status === 'notified') {
      return {
        alreadyPrepared: true,
        status: raced.status,
        caseNumber: raced.snapshot?.caseNumber ?? 'RC-...',
        escalationId: raced.id,
        preparedAt: raced.preparedAt,
        snapshot: raced.snapshot,
      }
    }
    throw insertErr
  }

  return {
    alreadyPrepared: false,
    status: 'prepared',
    caseNumber,
    escalationId: inserted.id,
    preparedAt: inserted.prepared_at,
    snapshot,
  }
}

/** Read the active escalation's pack (from the immutable snapshot). */
export async function getRecoveryCasePack(
  tenantId: string,
  caseId: string,
): Promise<EscalationRow | null> {
  return getActiveEscalation(tenantId, caseId)
}

/** Deterministic JSON export of the snapshot. */
export function exportRecoveryCaseJSON(pack: EscalationRow): string {
  return JSON.stringify(pack.snapshot ?? {}, null, 2)
}

export interface SettlementOfferInput {
  offer: SettlementOffer
  note?: string | null
}

/** Save a settlement offer (Domain C). Never sends anything. */
export async function recordSettlementOffer(
  tenantId: string,
  caseId: string,
  input: SettlementOfferInput,
): Promise<EscalationRow | null> {
  const escalation = await getActiveEscalation(tenantId, caseId)
  if (!escalation) {
    const assessment = await assessRecoveryCase(tenantId, caseId)
    if (!assessment?.escalation) return null
  }
  const slot = (await getActiveEscalation(tenantId, caseId))!
  const { data: updated } = await supabaseAdmin
    .from('recovery_escalations')
    .update({
      settlement_offer: input.offer,
      merchant_note: input.note ?? slot.merchantNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slot.id)
    .select()
    .maybeSingle()
  return updated ? mapEscalationRow(updated) : null
}

// ---------------------------------------------------------------------------
// Domain C — Final settlement notice DRAFT (merchant-authored, never sent)
// ---------------------------------------------------------------------------

/**
 * Generate the final settlement notice D RAFT. Rev 2 guardrails:
 *   - language is unambiguously merchant-authored and non-threatening
 *   - BillZo never transmits, schedules, or prefixes the notice with automation
 *   - the merchant reviews, edits, and sends it through their own channel
 */
export function buildSettlementNoticeDraft(
  input: {
    merchantName: string | null
    customerName: string | null
    outstanding: number
    invoiceCount: number
    maxOverdueDays: number
    caseNumber: string
    effortResult: string
    merchantNote?: string | null
  },
  opts: { rupee?: (n: number) => string } = {},
): SettlementNoticeDraft {
  const rupee = opts.rupee ?? ((n: number) => '₹' + Math.round(n).toLocaleString('en-IN'))
  const generatedAt = new Date().toISOString()

  const subject = `Final settlement notice — ${input.customerName ?? 'Customer'} — ${rupee(input.outstanding)}`

  const body = [
    `Subject: ${subject}`,
    '',
    `Dear ${input.customerName || 'Customer'},`,
    '',
    `We are writing to confirm the outstanding balance of ${rupee(input.outstanding)} across ${input.invoiceCount} invoice(s) for your account, which has been due for ${input.maxOverdueDays} day(s).`,
    '',
    `Recovery case: ${input.caseNumber}`,
    `Recovery effort: ${input.effortResult}`,
    '',
    'We would like to resolve this amicably. Please contact us to arrange payment or a mutually agreeable schedule.',
    '',
    input.merchantNote ? `Note: ${input.merchantNote}` : '',
    '',
    `Regards,`,
    input.merchantName ?? 'Your merchant',
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    generatedAt,
    subject,
    body,
    neverAutoSent: true,
  }
}