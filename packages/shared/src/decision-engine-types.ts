// ============================================================
// DECISION ENGINE TYPES — Pre-Send Checklist
// ============================================================
// The decision engine determines whether a reminder SHOULD be
// sent, independent of HOW or WHEN (those are the orchestrator's
// domain). It enforces fundamental business rules:
//
//   1. Outstanding > 0
//   2. Not disputed
//   3. No active promise
//   4. Not snoozed
//   5. Cooldown expired
//   6. Customer reachable
//   7. No recent manual contact
//   8. Customer tier permits escalation
// ============================================================

// ============================================================
// CUSTOMER TIER — Escalation ceiling
// ============================================================

export const CUSTOMER_TIERS = ['vip', 'regular', 'risky', 'blacklisted'] as const
export type CustomerTier = (typeof CUSTOMER_TIERS)[number]

// ============================================================
// PHONE VERIFICATION STATUS
// ============================================================

export const PHONE_VERIFICATION_STATUSES = ['verified', 'unverified', 'unknown'] as const
export type PhoneVerificationStatus = (typeof PHONE_VERIFICATION_STATUSES)[number]

// ============================================================
// DECISION — What the engine decides
// ============================================================

export type Decision = 'send' | 'block' | 'pending_approval'

// ============================================================
// RULE RESULT — One rule's evaluation
// ============================================================

export interface DecisionRuleResult {
  rule: string
  passed: boolean
  detail: string
  override?: boolean
  overrideReason?: string
}

// ============================================================
// OUTPUT — What canSendReminder returns
// ============================================================

export interface CanSendReminderOutput {
  allowed: boolean
  decision: Decision
  reason: string
  confidence: number
  rules: DecisionRuleResult[]
  rulesSnapshot: Record<string, boolean>
}

// ============================================================
// INPUT — Everything the engine needs to decide
// ============================================================

export interface CanSendReminderInput {
  invoice: {
    id: string
    total: number
    outstanding: number
    recoveryStage: string
    nextRecoveryAt: string | null
    isSnoozed: boolean
    snoozeUntil: string | null
    isDisputed: boolean
    manualInteractionAt: string | null
    overrideSend: boolean
    overrideAt: string | null
    overrideReason: string | null
  }
  customer: {
    id: string
    phone: string | null
    customerTier: CustomerTier
    automationMode: string
    phoneVerification: PhoneVerificationStatus
    reputationScore: number
  }
  activePromiseDate?: string | null
  behaviorMetrics?: {
    readRate: number
    deliveryRate: number
    observationCount: number
  }
  now?: string
}

// ============================================================
// ESCALATION MATRIX — Max stage per tier
// ============================================================

export const TIER_MAX_STAGE: Record<CustomerTier, string> = {
  vip: 't24_nudge',
  regular: 't5_warning',
  risky: 't5_warning',
  blacklisted: 't5_warning',
}
