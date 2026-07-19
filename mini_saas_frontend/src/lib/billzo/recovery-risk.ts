/**
 * CollectionRisk — unified recovery-risk model.
 *
 * Three divergent risk models existed before (cashflow.recoveryProbability +
 * getAgingBucket, invoices.getRisk, report-engine.computeAgingBuckets). They are
 * replaced by this single stage scale so every surface speaks the same language.
 *
 * Stages are keyed on how many days an invoice/account is overdue:
 *   Healthy   — not overdue (or future-dated)
 *   Monitor   — 0–7 days overdue
 *   Attention — 8–15 days overdue
 *   Urgent    — 16–30 days overdue
 *   Critical  — 31+ days overdue
 *
 * The model intentionally accepts future signals (promises, ignored reminders,
 * payment history) so downstream surfaces can upgrade from the basic overdue-day
 * heuristic to a richer score without changing call sites.
 */

export type CollectionRiskStage =
  | "Healthy"
  | "Monitor"
  | "Attention"
  | "Urgent"
  | "Critical"

export type CollectionRiskTone = "success" | "info" | "warning" | "danger"

export interface CollectionRiskInput {
  /** Days overdue. Negative / undefined means not yet due → Healthy. */
  overdueDays?: number
  /** Whether the invoice/account is currently outstanding at all. */
  outstanding?: boolean
  /** Optional future signals (not yet used by the basic heuristic). */
  brokenPromises?: number
  ignoredReminders?: number
  promiseToPayDate?: string | null
}

export interface CollectionRisk {
  stage: CollectionRiskStage
  /** Short label, e.g. "Urgent". */
  label: CollectionRiskStage
  /** Numeric rank 0 (best) … 4 (worst) for sorting. */
  rank: number
  /** Recommended tone for color tokens. */
  tone: CollectionRiskTone
  /** Human guidance shown on dashboards / recovery queue. */
  recommendation: string
}

export const COLLECTION_RISK_STAGES: CollectionRiskStage[] = [
  "Healthy",
  "Monitor",
  "Attention",
  "Urgent",
  "Critical",
]

const STAGE_META: Record<
  CollectionRiskStage,
  { rank: number; tone: CollectionRiskTone; recommendation: string }
> = {
  Healthy: {
    rank: 0,
    tone: "success",
    recommendation: "No action needed",
  },
  Monitor: {
    rank: 1,
    tone: "info",
    recommendation: "Gentle reminder due",
  },
  Attention: {
    rank: 2,
    tone: "warning",
    recommendation: "Send a friendly follow-up",
  },
  Urgent: {
    rank: 3,
    tone: "danger",
    recommendation: "Firm reminder or call",
  },
  Critical: {
    rank: 4,
    tone: "danger",
    recommendation: "Personal call required",
  },
}

/** Threshold (inclusive upper bound in days) for each actionable stage. */
export const COLLECTION_RISK_THRESHOLDS = {
  Monitor: 7,
  Attention: 15,
  Urgent: 30,
} as const

export function collectionRiskStageFromDays(overdueDays: number): CollectionRiskStage {
  if (overdueDays <= 0) return "Healthy"
  if (overdueDays <= COLLECTION_RISK_THRESHOLDS.Monitor) return "Monitor"
  if (overdueDays <= COLLECTION_RISK_THRESHOLDS.Attention) return "Attention"
  if (overdueDays <= COLLECTION_RISK_THRESHOLDS.Urgent) return "Urgent"
  return "Critical"
}

/**
 * Compute a CollectionRisk from the available signals.
 *
 * Basic heuristic uses overdueDays (and `outstanding` to collapse non-outstanding
 * accounts to Healthy). Future signals are accepted but currently only nudge the
 * stage upward when present, keeping behaviour predictable.
 */
export function getCollectionRisk(input: CollectionRiskInput): CollectionRisk {
  const outstanding = input.outstanding ?? input.overdueDays !== undefined
  if (!outstanding) {
    return build("Healthy")
  }

  let stage = collectionRiskStageFromDays(input.overdueDays ?? 0)

  // Future signals: a broken promise or repeated ignored reminders escalate
  // at most one stage (capped at Critical) without re-deriving from scratch.
  const escalation =
    (input.brokenPromises && input.brokenPromises > 0 ? 1 : 0) +
    (input.ignoredReminders && input.ignoredReminders >= 3 ? 1 : 0)

  for (let i = 0; i < escalation && stage !== "Critical"; i++) {
    const idx = COLLECTION_RISK_STAGES.indexOf(stage)
    stage = COLLECTION_RISK_STAGES[Math.min(idx + 1, COLLECTION_RISK_STAGES.length - 1)]
  }

  return build(stage)
}

function build(stage: CollectionRiskStage): CollectionRisk {
  const meta = STAGE_META[stage]
  return {
    stage,
    label: stage,
    rank: meta.rank,
    tone: meta.tone,
    recommendation: meta.recommendation,
  }
}

/** Map a CollectionRiskTone to the design-system color tokens. */
export const COLLECTION_RISK_TONE_CLASSES: Record<
  CollectionRiskTone,
  { text: string; bg: string; border: string; dot: string }
> = {
  success: {
    text: "text-success",
    bg: "bg-success-soft",
    border: "border-border",
    dot: "bg-success",
  },
  info: {
    text: "text-info",
    bg: "bg-info-soft",
    border: "border-border",
    dot: "bg-info",
  },
  warning: {
    text: "text-warning",
    bg: "bg-warning-soft",
    border: "border-border",
    dot: "bg-warning",
  },
  danger: {
    text: "text-danger",
    bg: "bg-danger-soft",
    border: "border-border",
    dot: "bg-danger",
  },
}
