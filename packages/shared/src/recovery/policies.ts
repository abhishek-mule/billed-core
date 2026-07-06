// ============================================================
// RECOVERY POLICIES — System-wide config constants
// ============================================================
// These replace the Recovery Knowledge Base for V1.
// Move to DB only when merchants need custom rules.
// ============================================================

export const RecoveryPolicies = {
  MAX_MONTHLY_REMINDERS: 6,
  MAX_INVOICE_REMINDERS: 10,
  DEFAULT_COOLDOWN_HOURS: 24,
  BUSINESS_HOURS_START: 9,
  BUSINESS_HOURS_END: 20,
  CONSECUTIVE_IGNORES_BEFORE_SILENCE: 3,
  SILENCE_DAYS_AFTER_IGNORE: 7,
  ANNOYANCE_COOLDOWN_DAYS: 3,
  MAX_STAGE_INDEX: 3,
  DEFAULT_PRIORITY: 5,
  MIN_CONFIDENCE_FOR_AUTOMATION: 0.3,
  ESCALATION_IGNORE_THRESHOLD: 3,
  ESCALATION_AMOUNT_RATIO: 2.0,
  DEFAULT_FOLLOW_UP_DAYS: 3,
} as const
