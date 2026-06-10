// ============================================================
// EVENT TAXONOMY — Business-significant events only
// ============================================================

export const EventType = {
  // Billing
  INVOICE_CREATED: 'invoice.created',
  INVOICE_UPDATED: 'invoice.updated',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_OVERDUE: 'invoice.overdue',
  INVOICE_DELETED: 'invoice.deleted',

  // Payments
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_LINK_GENERATED: 'payment.link.generated',
  PAYMENT_LINK_CLICKED: 'payment.link.clicked',
  PAYMENT_RECONCILED: 'payment.reconciled',

  // Recovery
  RECOVERY_STARTED: 'recovery.started',
  RECOVERY_REMINDER_SENT: 'recovery.reminder.sent',
  RECOVERY_REMINDER_DELIVERED: 'recovery.reminder.delivered',
  RECOVERY_REMINDER_FAILED: 'recovery.reminder.failed',
  RECOVERY_COMPLETED: 'recovery.completed',
  RECOVERY_ESCALATED: 'recovery.escalated',
  RECOVERY_ATTRIBUTED: 'recovery.attributed',

  // Inventory
  INVENTORY_LOW: 'inventory.low',
  INVENTORY_OUT: 'inventory.out',
  INVENTORY_ADJUSTED: 'inventory.adjusted',

  // Customers
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_OPT_IN: 'customer.opt_in',
  CUSTOMER_UPDATE_AUTOMATION: 'customer.update_automation',

  // Messaging
  WHATSAPP_SENT: 'whatsapp.sent',
  WHATSAPP_DELIVERED: 'whatsapp.delivered',
  WHATSAPP_FAILED: 'whatsapp.failed',
  WHATSAPP_INBOUND: 'whatsapp.inbound',
  SEND_MESSAGE_INTENDED: 'send_message.intended',
  SEND_MESSAGE_EXECUTED: 'send_message.executed',

  // Sync
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed',
  SYNC_CONFLICT: 'sync.conflict',

  // WhatsApp
  WHATSAPP_PAIR_REQUESTED: 'whatsapp.pair.requested',
  WHATSAPP_PAIRED: 'whatsapp.paired',
  WHATSAPP_UNPAIRED: 'whatsapp.unpaired',
  WHATSAPP_STATUS_UPDATED: 'whatsapp.status.updated',
  WHATSAPP_CIRCUIT_OPEN: 'whatsapp.circuit_open',
  WHATSAPP_UPI_CLICKED: 'whatsapp.upi_clicked',

  // Recovery
  RECOVERY_ESCALATION_SUGGESTED: 'recovery.escalation.suggested',
  REMINDER_PENDING_APPROVAL: 'reminder.pending_approval',
  RECOVERY_RECOMMENDATION: 'recovery.recommendation',

  // Analytics
  ANALYTICS_SNAPSHOT_GENERATED: 'analytics.snapshot.generated',

  // Experiments
  EXPERIMENT_ASSIGNED: 'experiment.assigned',
  EXPERIMENT_COMPLETED: 'experiment.completed',

  // Behavioral Memory
  PROJECTION_DELTA: 'projection.delta',
  BEHAVIORAL_OBSERVATION: 'behavioral.observation',
  PROFILE_CHANGED: 'profile.changed',

  // Orchestration
  ORCHESTRATION_DECISION_MADE: 'orchestration.decision.made',

  // Decision Engine
  DECISION_ENGINE_BLOCKED: 'decision.engine.blocked',
  DECISION_ENGINE_ALLOWED: 'decision.engine.allowed',

  // Merchant Override
  RECOVERY_OVERRIDE_APPROVED: 'recovery.override.approved',
  RECOVERY_OVERRIDE_REJECTED: 'recovery.override.rejected',
} as const

export type EventType = (typeof EventType)[keyof typeof EventType]

// ============================================================
// EVENT PRODUCERS
// ============================================================

export type EventProducer = 'api' | 'worker' | 'webhook' | 'cron' | 'client'

// ============================================================
// EVENT INTERFACE
// ============================================================

export interface BillzoEvent {
  type: EventType
  version: number
  tenantId: string
  entityId: string | null
  payload: Record<string, unknown>
  causationId: string | null
  correlationId: string
  producer: EventProducer
  idempotencyKey: string | null
  retentionDays: number
}
