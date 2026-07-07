// ============================================================
// RECOVERY TYPES — Recovery domain aggregate root types
// ============================================================
//
// RecoveryOrchestrator produces RecoveryPlan (what to do next).
// ActionPlanner consumes RecoveryPlan and produces ActionPlan (how to do it).
// CollectionAction is the stored record.

// ============================================================
// ACTION TYPE — Every possible recovery action
// ============================================================

export const ACTION_TYPES = [
  'reminder',
  'payment_request',
  'call',
  'visit',
  'escalate',
  'wait',
] as const

export type ActionType = (typeof ACTION_TYPES)[number]

// ============================================================
// ACTION STATUS — Lifecycle of a collection action
// ============================================================

export const ACTION_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const

export type ActionStatus = (typeof ACTION_STATUSES)[number]

// ============================================================
// ACTION SOURCE — Who/what created the action
// ============================================================

export const ACTION_SOURCES = ['system', 'worker', 'merchant', 'customer'] as const
export type ActionSource = (typeof ACTION_SOURCES)[number]

// ============================================================
// RECOVERY GOAL — What the orchestrator is trying to achieve
// ============================================================

export const RECOVERY_GOALS = [
  'full_payment',
  'partial_payment',
  'engagement',
  'relationship_preservation',
] as const

export type RecoveryGoal = (typeof RECOVERY_GOALS)[number]

// ============================================================
// RECOVERY PLAN — What the orchestrator decides should happen next
// ============================================================

export interface RecoveryPlanDecisionReason {
  modelVersion: string
  keyFeatures: string[]
  confidence: number
  customerRiskScore: number
  liquidityWindow: { dayOfWeek: number; startHour: number; endHour: number } | null
  driftDetected: boolean
}

export interface RecoveryPlan {
  actionType: ActionType
  goal: RecoveryGoal
  suggestedAmount?: number
  confidence: number
  priority: number
  timing: RecoveryTiming
  reason: string
  decisionReason: RecoveryPlanDecisionReason
}

export interface RecoveryTiming {
  immediate: boolean
  scheduledAt?: string
  delayMinutes?: number
}

// ============================================================
// ACTION PLAN — What the ActionPlanner produces (channel resolved)
// ============================================================

export interface ActionPlan {
  actionType: ActionType
  provider: string | null
  amount?: number
  config: Record<string, unknown>
}

// ============================================================
// COLLECTION ACTION — Stored in DB (snake_case for DB mapping)
// ============================================================

export interface CollectionAction {
  id: string
  tenantId: string
  customerId?: string
  invoiceIds: string[]
  actionType: ActionType
  status: ActionStatus
  source: ActionSource
  provider?: string
  amount?: number
  scheduledAt?: string
  executedAt?: string
  completedAt?: string
  parentActionId?: string
  recoveryPlanId?: string
  reason?: string
  priority: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ============================================================
// MERCHANT POLICY — CSS inheritance model
// System defaults → Tenant policy → Customer override → Invoice override
// ============================================================

export const REMINDER_STRATEGIES = ['gentle', 'balanced', 'aggressive'] as const
export type ReminderStrategy = (typeof REMINDER_STRATEGIES)[number]

export interface MerchantPolicy {
  reminderStrategy: ReminderStrategy
  escalationEnabled: boolean
  allowCalls: boolean
  preferredChannels: string[]
  paymentPreference: string[]
  relationshipPriority: number
  maxRemindersPerMonth: number
  maxRemindersPerInvoice: number
  cooldownHours: number
}

export interface CustomerPolicyOverride {
  escalationEnabled?: boolean
  preferredChannels?: string[]
  reminderStrategy?: ReminderStrategy
  allowCalls?: boolean
}
