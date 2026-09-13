// ============================================================
// NOTIFICATION CONTRACT — copy + builder (spec §7)
// ============================================================
// buildNotification() is the ONE place that turns a business signal into a
// notification draft: WHAT (title) → WHY (body) → ACTION (button/label) →
// level → target → default dedupe key. Both the worker (record creation) and
// the frontend (rendering) consume the same builder, so push copy, in-app
// copy, deep links, and levels can never drift (spec §7/§8).

import type {
  NewNotification,
  NotificationLevel,
  NotificationTargetType,
  NotificationType,
} from './types'
import { NOTIFICATION_TYPE_CATEGORY, NOTIFICATION_TYPE_LEVEL } from './types'
import { dedupeKeyFor } from './keys'

export interface NotificationCopy {
  title: string
  body: string
  action: string
}

export function formatRupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

// ── Per-type payloads ──
export type NotificationData = {
  'recovery.needs_you': { customerName: string; amount: number; targetId: string }
  'recovery.promise_broken': { customerName: string; amount: number; targetId: string }
  'recovery.payment_received': { customerName: string; amount: number; targetId: string }
  'recovery.customer_replied': { customerName: string; targetId: string }
  'payment.received': { customerName: string; amount: number; invoiceNumber?: string; targetId: string }
  'payment.unmatched': { amount: number; targetId: string }
  'inventory.low_stock': { productName: string; stock: number; threshold: number; targetId: string }
  'inventory.out_of_stock': { productName: string; targetId: string }
  'inventory.back_in_stock': { productName: string; stock: number; targetId: string }
  'notification.test': { title: string; body: string; targetId: string }
}

const TYPE_TARGET: Record<NotificationType, NotificationTargetType> = {
  'recovery.needs_you': 'customer',
  'recovery.promise_broken': 'customer',
  'recovery.payment_received': 'customer',
  'recovery.customer_replied': 'customer',
  'payment.received': 'invoice',
  'payment.unmatched': 'payment',
  'inventory.low_stock': 'product',
  'inventory.out_of_stock': 'product',
  'inventory.back_in_stock': 'product',
  'notification.test': 'notification',
}

// TODO(k): remove once all branches typed below
type AnyData = { [k: string]: unknown }

function buildCopy(type: NotificationType, d: AnyData): NotificationCopy {
  switch (type) {
    case 'recovery.needs_you':
      return {
        title: `${d.customerName} needs your attention`,
        body: `${formatRupees(d.amount as number)} overdue`,
        action: 'Call customer today',
      }
    case 'recovery.promise_broken':
      return {
        title: `${d.customerName} needs your attention`,
        body: `${formatRupees(d.amount as number)} overdue · promise broken`,
        action: 'Call customer today',
      }
    case 'recovery.payment_received':
      return {
        title: 'Payment received — automation stopped',
        body: `${d.customerName} paid ${formatRupees(d.amount as number)}`,
        action: 'View recovery',
      }
    case 'recovery.customer_replied':
      return {
        title: `${d.customerName} replied`,
        body: 'Customer replied to your WhatsApp reminder',
        action: 'Open conversation',
      }
    case 'payment.received':
      return {
        title: `${formatRupees(d.amount as number)} received`,
        body: `${d.customerName}${d.invoiceNumber ? ` · Invoice ${d.invoiceNumber}` : ''}`,
        action: 'View payment',
      }
    case 'payment.unmatched':
      return {
        title: 'Payment received but unmatched',
        body: `${formatRupees(d.amount as number)} couldn't be matched to an invoice`,
        action: 'Review & match',
      }
    case 'inventory.low_stock':
      return {
        title: `${d.productName} is running low`,
        body: `${d.stock} units remaining · threshold is ${d.threshold}`,
        action: 'View inventory',
      }
    case 'inventory.out_of_stock':
      return {
        title: `${d.productName} is out of stock`,
        body: 'No units remaining',
        action: 'Restock product',
      }
    case 'inventory.back_in_stock':
      return {
        title: `${d.productName} is back in stock`,
        body: `${d.stock} units available`,
        action: 'View product',
      }
    case 'notification.test':
      return {
        title: d.title as string,
        body: d.body as string,
        action: 'Open Notifications',
      }
  }
}

export interface BuildNotificationInput<T extends NotificationType> {
  type: T
  data: NotificationData[T]
  tenantId: string
  recipientUserId?: string | null
  /** Override the deterministic default dedupe key (event-sourced or cycle-scoped alerts). */
  dedupeKey?: string
}

// Builds the full record shape from a typed signal. The level, copy, target,
// and default dedupe key are all derived here.
export function buildNotification<T extends NotificationType>(input: BuildNotificationInput<T>): NewNotification {
  const { type, data, tenantId, recipientUserId, dedupeKey } = input
  const copy = buildCopy(type, data as unknown as AnyData)
  const level: NotificationLevel = NOTIFICATION_TYPE_LEVEL[type]

  return {
    type,
    level,
    tenantId,
    recipientUserId: recipientUserId ?? null,
    title: copy.title,
    body: copy.body,
    targetType: TYPE_TARGET[type],
    targetId: data.targetId,
    action: copy.action,
    dedupeKey: dedupeKey ?? dedupeKeyFor(type, data.targetId),
  }
}