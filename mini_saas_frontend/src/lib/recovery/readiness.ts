/**
 * Recovery Readiness — pure evaluator.
 *
 * Answers one question for any merchant:
 *   "What is the single next thing this merchant needs to do to recover money?"
 *
 * This introduces NO new business logic. It only reads facts that already exist
 * (customer count, invoice count, overdue count, WhatsApp connectivity) and
 * derives the next action. The Recommendation Engine can later consume the same
 * Readiness object.
 *
 * Per docs/ARCHITECTURE_FREEZE_POLICY.md this is product/activation work.
 */

export interface ReadinessCounts {
  /** Number of customers the merchant has. */
  customers: number
  /** Number of invoices (any status) the merchant has. */
  invoices: number
  /** Number of invoices that are past due and not paid. */
  overdueInvoices: number
  /** Whether WhatsApp is connected / configured. */
  whatsappConnected: boolean
}

export type ReadinessAction =
  | { kind: 'add_customer'; title: string; cta: string; href: string }
  | { kind: 'create_invoice'; title: string; cta: string; href: string }
  | { kind: 'connect_whatsapp'; title: string; cta: string; href: string }
  | { kind: 'send_reminder'; title: string; cta: string; href: string; overdueCount: number }
  | { kind: 'healthy'; title: string; cta: string; href: string }

export interface Readiness {
  customers: boolean
  invoices: boolean
  overdueInvoices: number
  whatsapp: boolean
  /** True when the merchant can actually recover money now. */
  ready: boolean
  /** The single next action to surface. */
  action: ReadinessAction
}

/**
 * Pure: same inputs → same output. No IO.
 *
 * Priority of the next action:
 *   1. No customers        → add customer
 *   2. No invoices         → create invoice
 *   3. No WhatsApp         → connect WhatsApp (recovery can't run without it)
 *   4. Overdue invoices    → send first reminder
 *   5. Otherwise           → healthy / monitoring
 */
export function evaluateReadiness(c: ReadinessCounts): Readiness {
  const hasCustomers = c.customers > 0
  const hasInvoices = c.invoices > 0
  const hasOverdue = c.overdueInvoices > 0

  let action: ReadinessAction
  let ready = false

  if (!hasCustomers) {
    action = {
      kind: 'add_customer',
      title: "Recovery isn't ready yet.",
      cta: 'Add your first customer',
      href: '/parties/add',
    }
  } else if (!hasInvoices) {
    action = {
      kind: 'create_invoice',
      title: 'Customers added. Now create your first invoice.',
      cta: 'Create invoice',
      href: '/pos',
    }
  } else if (!c.whatsappConnected) {
    action = {
      kind: 'connect_whatsapp',
      title: 'Almost there — connect WhatsApp to send reminders.',
      cta: 'Connect WhatsApp',
      href: '/settings/whatsapp',
    }
  } else if (hasOverdue) {
    ready = true
    action = {
      kind: 'send_reminder',
      title: `You have ${c.overdueInvoices} customer${c.overdueInvoices === 1 ? '' : 's'} waiting.`,
      cta: 'Send your first reminder',
      href: '/recovery/work',
      overdueCount: c.overdueInvoices,
    }
  } else {
    ready = true
    action = {
      kind: 'healthy',
      title: 'Everything is healthy. BillZo is monitoring future invoices.',
      cta: 'View Recovery Center',
      href: '/recovery',
    }
  }

  return {
    customers: hasCustomers,
    invoices: hasInvoices,
    overdueInvoices: c.overdueInvoices,
    whatsapp: c.whatsappConnected,
    ready,
    action,
  }
}
