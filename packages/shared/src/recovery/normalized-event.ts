export const RECOVERY_EVENT_TYPES = [
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

export type RecoveryEventType = (typeof RECOVERY_EVENT_TYPES)[number]

export interface NormalizedRecoveryEvent {
  id: string
  customerId: string
  tenantId: string
  timestamp: string
  type: RecoveryEventType
  eventVersion: number
  amount?: number
  metadata?: Record<string, unknown>
}
