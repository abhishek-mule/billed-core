// authority:exempt ephemeral_operational_state — Recovery Planner
// Runs ONCE per business event (invoice created, promise made, policy changed).
// It reads the tenant's default active policy and generates collection_actions.
// It never sends messages and never runs on the cron — see scheduler.ts.
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { writeOutboxEvent } from '@/lib/billzo/outbox'

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000'

export interface PlanContext {
  tenantId: string
  customerId: string
  invoiceIds: string[]
  /** Anchor date for DUE_DATE-based steps. Defaults to now. */
  anchorAt?: Date
  /** Promise date — used when planning a promise follow-up. */
  promiseDate?: Date
  /** Policy to use; defaults to tenant's default active policy (else system Standard). */
  policyId?: string
  /** Why planning happened — for audit. */
  reason: 'invoice_created' | 'promise_made' | 'policy_changed' | 'manual_reschedule'
}

/**
 * Load the effective policy for a tenant: tenant default active policy,
 * otherwise the system "Standard" policy.
 */
export async function resolvePolicy(tenantId: string, policyId?: string): Promise<{
  policyId: string
  steps: Array<{
    sequence: number
    triggerType: string
    offsetDays: number
    actionType: string
    templateName: string | null
    channel: string
  }>
} | null> {
  const policyIds: string[] = []
  if (policyId) policyIds.push(policyId)

  if (!policyId) {
    const { data: tenantPolicy } = await supabaseAdmin
      .from('recovery_policies')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle()
    if (tenantPolicy?.id) policyIds.push(tenantPolicy.id)
  }

  if (policyIds.length === 0) {
    const { data: sys } = await supabaseAdmin
      .from('recovery_policies')
      .select('id')
      .eq('id', 'sys_standard')
      .limit(1)
      .maybeSingle()
    if (sys?.id) policyIds.push(sys.id)
  }

  const pid = policyIds[0]
  if (!pid) return null

  const { data: steps } = await supabaseAdmin
    .from('recovery_policy_steps')
    .select('sequence, trigger_type, offset_days, action_type, template_name, channel')
    .eq('policy_id', pid)
    .eq('is_enabled', true)
    .order('sequence', { ascending: true })

  if (!steps || steps.length === 0) return null
  return {
    policyId: pid,
    steps: (steps as any[]).map((s) => ({
      sequence: s.sequence,
      triggerType: s.trigger_type,
      offsetDays: s.offset_days,
      actionType: s.action_type,
      templateName: s.template_name,
      channel: s.channel,
    })),
  }
}

/**
 * Generate collection_actions for an invoice based on the tenant's policy.
 * Idempotent: skips if actions already exist for this policy+invoices.
 */
export async function planRecoveryForInvoice(ctx: PlanContext): Promise<{ created: number; policyId: string | null }> {
  const policy = await resolvePolicy(ctx.tenantId, ctx.policyId)
  if (!policy) return { created: 0, policyId: null }

  // Idempotency: don't double-plan the same invoices under the same policy.
  const { data: existing } = await supabaseAdmin
    .from('collection_actions')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('policy_id', policy.policyId)
    .contains('invoice_ids', ctx.invoiceIds)
    .eq('source', 'system')
    .limit(1)

  if (existing && existing.length > 0) {
    return { created: 0, policyId: policy.policyId }
  }

  const anchor = ctx.anchorAt ?? new Date()
  const created = await insertSteps(ctx, policy, anchor)

  // Audit the planning decision.
  await writeOutboxEvent({
    type: 'recovery.planned',
    tenantId: ctx.tenantId,
    entityId: ctx.customerId,
    payload: {
      reason: ctx.reason,
      policyId: policy.policyId,
      invoiceIds: ctx.invoiceIds,
      actionCount: created,
    },
    idempotencyKey: `plan:${ctx.tenantId}:${ctx.invoiceIds.join(',')}:${policy.policyId}`,
  })

  return { created, policyId: policy.policyId }
}

/**
 * Generate a single promise follow-up collection_action. Called when a customer
 * makes a promise to pay. Schedules a check on the promise date.
 */
export async function planPromiseFollowup(ctx: PlanContext): Promise<{ created: number }> {
  if (!ctx.promiseDate) return { created: 0 }

  const { data: existing } = await supabaseAdmin
    .from('collection_actions')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('action_type', 'promise_followup')
    .contains('invoice_ids', ctx.invoiceIds)
    .eq('source', 'system')
    .gte('scheduled_at', ctx.promiseDate.toISOString())
    .limit(1)

  if (existing && existing.length > 0) return { created: 0 }

  const actionId = `CA_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const { error } = await supabaseAdmin.from('collection_actions').insert({
    id: actionId,
    tenant_id: ctx.tenantId,
    customer_id: ctx.customerId,
    invoice_ids: ctx.invoiceIds,
    action_type: 'promise_followup',
    status: 'scheduled',
    source: 'system',
    trigger_type: 'PROMISE_DATE',
    scheduled_at: ctx.promiseDate.toISOString(),
    reason: 'Promise follow-up scheduled',
    metadata: { reason: ctx.reason, promiseDate: ctx.promiseDate.toISOString() },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[Planner] promise_followup insert failed', error)
    return { created: 0 }
  }

  await writeOutboxEvent({
    type: 'recovery.planned',
    tenantId: ctx.tenantId,
    entityId: ctx.customerId,
    payload: { reason: 'promise_made', actionId, promiseDate: ctx.promiseDate.toISOString() },
    idempotencyKey: `plan:promise:${actionId}`,
  })

  return { created: 1 }
}

async function insertSteps(
  ctx: PlanContext,
  policy: { policyId: string; steps: any[] },
  anchor: Date,
): Promise<number> {
  let count = 0
  for (const step of policy.steps) {
    if (step.triggerType !== 'DUE_DATE' && step.triggerType !== 'INVOICE_CREATED') continue
    const scheduled = new Date(anchor.getTime() + step.offsetDays * 24 * 60 * 60 * 1000)
    const actionId = `CA_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${step.sequence}`
    const { error } = await supabaseAdmin.from('collection_actions').insert({
      id: actionId,
      tenant_id: ctx.tenantId,
      customer_id: ctx.customerId,
      invoice_ids: ctx.invoiceIds,
      action_type: step.actionType,
      status: 'scheduled',
      source: 'system',
      policy_id: policy.policyId,
      trigger_type: step.triggerType,
      template_name: step.templateName,
      channel: step.channel,
      scheduled_at: scheduled.toISOString(),
      reason: `Policy ${policy.policyId} step ${step.sequence}`,
      metadata: { stepSequence: step.sequence, channel: step.channel },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (!error) count++
    else console.error('[Planner] step insert failed', error)
  }
  return count
}

/**
 * Backfill planner: for any open invoice/case with no scheduled system actions,
 * generate them. Admin/repair tool ONLY — NOT part of the normal cron path.
 */
export async function backfillUnplanned(tenantId: string, limit = 100): Promise<number> {
  // Find open invoices lacking a scheduled system action.
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('id, tenant_id, customer_id, due_date')
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'overdue', 'partial'])
    .limit(limit)

  if (!invoices) return 0
  let planned = 0
  for (const inv of invoices) {
    const { data: existing } = await supabaseAdmin
      .from('collection_actions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source', 'system')
      .contains('invoice_ids', [inv.id])
      .limit(1)
    if (existing && existing.length > 0) continue
    const res = await planRecoveryForInvoice({
      tenantId,
      customerId: inv.customer_id,
      invoiceIds: [inv.id],
      anchorAt: inv.due_date ? new Date(inv.due_date) : new Date(),
      reason: 'invoice_created',
    })
    planned += res.created
  }
  return planned
}

/**
 * Cancel future scheduled collection_actions for an invoice once it is paid.
 * Called from the payment.completed path so customers don't get reminders for
 * invoices they've already settled.
 */
export async function cancelFutureActions(invoiceId: string, tenantId: string): Promise<number> {
  const now = new Date().toISOString()
  const { data: actions, error } = await supabaseAdmin
    .from('collection_actions')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .contains('invoice_ids', [invoiceId])

  if (error || !actions || actions.length === 0) return 0

  let cancelled = 0
  for (const a of actions) {
    await supabaseAdmin
      .from('collection_actions')
      .update({ status: 'cancelled', cancelled_at: now, cancel_reason: 'invoice_paid', updated_at: now })
      .eq('id', a.id)
    await supabaseAdmin.from('collection_action_events').insert({
      action_id: a.id,
      event_type: 'cancelled',
      from_status: a.status,
      to_status: 'cancelled',
      payload: { reason: 'invoice_paid', invoiceId },
    })
    cancelled++
  }
  return cancelled
}
