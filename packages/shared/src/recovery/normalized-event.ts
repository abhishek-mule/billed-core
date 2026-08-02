export const RECOVERY_EVENT_TYPES = [
  // Lifecycle
  'case_opened',
  'case_closed',

  // Communication
  'invoice_sent',
  'reminder_scheduled',
  'reminder_sent',
  'reminder_delivered',
  'reminder_read',
  'reminder_failed',
  'merchant_called',
  'call_outcome',

  // Promise
  'promise_received',
  'promise_fulfilled',
  'promise_broken',

  // Payment
  'customer_viewed',
  'payment_link_opened',
  'payment_received',
  'customer_payment_reported',
  'payment_confirmed',
  'payment_failed',

  // Merchant notes
  'note_added',
  'escalated',
  'disputed',
] as const

export type RecoveryEventType = (typeof RECOVERY_EVENT_TYPES)[number]

export const RECOVERY_ACTOR_TYPES = ['merchant', 'system', 'customer'] as const
export type RecoveryActorType = (typeof RECOVERY_ACTOR_TYPES)[number]

export interface RecoveryEvent {
  id: string
  tenantId: string
  caseId?: string
  customerId?: string
  invoiceId: string
  type: RecoveryEventType
  actorType: RecoveryActorType
  actorId?: string
  metadata: Record<string, unknown>
  createdAt: string
}

/**
 * Legacy normalized event shape consumed by the Learning Engine and its
 * feature extractors. Kept alongside RecoveryEvent (the canonical model)
 * because those modules were written against the earlier event vocabulary
 * (timestamp + types like payment_link_clicked / snooze_requested).
 */
export const LEGACY_RECOVERY_EVENT_TYPES = [
  'invoice_created',
  'reminder_sent',
  'reminder_delivered',
  'reminder_read',
  'payment_link_clicked',
  'payment_received',
  'partial_payment',
  'promise_created',
  'promise_kept',
  'promise_broken',
  'call',
  'visit',
  'manual_note',
  'snooze_requested',
] as const

export type LegacyRecoveryEventType = (typeof LEGACY_RECOVERY_EVENT_TYPES)[number]

export interface NormalizedRecoveryEvent {
  id: string
  customerId: string
  tenantId: string
  timestamp: string
  type: LegacyRecoveryEventType
  eventVersion: number
  amount?: number
  metadata?: Record<string, unknown>
}
