// ============================================================
// RECOVERY PLANNER — Pure function: policy → scheduled actions
// No I/O, no side effects. Given a policy and context, returns
// the set of collection_actions to be created.
// ============================================================

export type TriggerType = 'DUE_DATE' | 'PROMISE_DATE' | 'INVOICE_CREATED' | 'OVERDUE' | 'MANUAL'

export interface PolicyStep {
  id: string
  sequence: number
  triggerType: TriggerType
  offsetDays: number
  actionType: string
  templateName: string | null
  channel: string
  isEnabled: boolean
}

export interface PlanInput {
  tenantId: string
  customerId: string
  invoiceIds: string[]
  dueDate: string
  policyId: string
  steps: PolicyStep[]
  /** For PROMISE_DATE trigger, the promise date to offset from */
  promiseDate?: string | null
  /** For OVERDUE trigger, days past due */
  daysOverdue?: number
}

export interface PlannedAction {
  tenantId: string
  customerId: string
  invoiceIds: string[]
  actionType: string
  templateName: string | null
  policyId: string
  policyStepId: string
  triggerType: TriggerType
  status: 'scheduled'
  source: 'system'
  scheduledAt: string
  reason: string | null
  priority: number
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  result.setHours(9, 30, 0, 0)
  return result
}

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date() : d
}

/**
 * Plan recovery actions for a given policy + invoice context.
 * Returns only actions where trigger_type matches the event context.
 */
export function planRecoveryActions(input: PlanInput): PlannedAction[] {
  const { tenantId, customerId, invoiceIds, dueDate, policyId, steps } = input
  const parsedDue = parseDate(dueDate)
  const actions: PlannedAction[] = []

  for (const step of steps) {
    if (!step.isEnabled) continue

    const scheduledAt = computeScheduledAt(step, parsedDue, input)

    if (!scheduledAt) continue

    const stageLabel = step.templateName || step.actionType
    actions.push({
      tenantId,
      customerId,
      invoiceIds,
      actionType: step.actionType,
      templateName: step.templateName,
      policyId,
      policyStepId: step.id,
      triggerType: step.triggerType,
      status: 'scheduled',
      source: 'system',
      scheduledAt: scheduledAt.toISOString(),
      reason: `${stageLabel} (step ${step.sequence}, +${step.offsetDays}d from ${step.triggerType})`,
      priority: step.sequence,
    })
  }

  return actions
}

function computeScheduledAt(
  step: PolicyStep,
  dueDate: Date,
  input: PlanInput,
): Date | null {
  const { triggerType, offsetDays } = step
  let base: Date | null = null

  switch (triggerType) {
    case 'DUE_DATE':
    case 'INVOICE_CREATED':
      base = new Date(dueDate)
      break
    case 'PROMISE_DATE':
      base = input.promiseDate ? parseDate(input.promiseDate) : null
      break
    case 'OVERDUE':
      base = new Date(dueDate)
      break
    case 'MANUAL':
      return null
  }

  if (!base) return null
  return addDays(base, offsetDays)
}

export function computeTriggerType(eventType: string): TriggerType {
  switch (eventType) {
    case 'invoice.created':
    case 'invoice.overdue':
      return 'DUE_DATE'
    case 'promise.made':
      return 'PROMISE_DATE'
    default:
      return 'DUE_DATE'
  }
}
