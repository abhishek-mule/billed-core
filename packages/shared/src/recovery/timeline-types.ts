// ============================================================
// TIMELINE TYPES — Recovery Journey event model
// ============================================================

export const RECOVERY_TIMELINE_SEVERITIES = ['info', 'success', 'warning', 'error', 'future'] as const
export type RecoveryTimelineSeverity = (typeof RECOVERY_TIMELINE_SEVERITIES)[number]

export const RECOVERY_TIMELINE_SOURCES = ['system', 'merchant', 'worker', 'customer', 'ai'] as const
export type RecoveryTimelineSource = (typeof RECOVERY_TIMELINE_SOURCES)[number]

export const RECOVERY_TIMELINE_EVENT_TYPES = [
  'invoice_created',
  'reminder_scheduled',
  'reminder_sent',
  'reminder_delivered',
  'reminder_read',
  'reminder_failed',
  'payment_link_clicked',
  'payment_received',
  'payment_failed',
  'escalated',
  'manual_review',
  'action_pending',
  'case_closed',
  'disputed',
] as const

export type RecoveryTimelineEventType = (typeof RECOVERY_TIMELINE_EVENT_TYPES)[number]

export interface RecoveryTimelineEvent {
  id: string
  type: RecoveryTimelineEventType
  title: string
  description: string
  reason: string
  timestamp: string
  severity: RecoveryTimelineSeverity
  source: RecoveryTimelineSource
  metadata?: Record<string, unknown>
}

export interface RecoveryTimelineGroup {
  label: string
  events: RecoveryTimelineEvent[]
}

export interface RecoveryTimelineData {
  invoiceId: string
  customerId?: string
  customerName?: string
  events: RecoveryTimelineEvent[]
  groups: RecoveryTimelineGroup[]
  journey: RecoveryJourney
  insights?: IntelligenceInsight[]
}

export interface RecoveryJourneyStage {
  key: string
  label: string
  status: 'completed' | 'current' | 'pending' | 'skipped'
  timestamp?: string
}

export interface RecoveryJourney {
  stages: RecoveryJourneyStage[]
}

export interface IntelligenceInsight {
  id: string
  type: 'insight' | 'prediction' | 'recommendation'
  title: string
  description: string
  confidence?: number
  severity: 'positive' | 'neutral' | 'negative'
}
