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
