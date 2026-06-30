import type { CustomerView, InvoiceSummary, PaymentSummary, TimelineItem, WorkItem, Action, Severity, WorkContext } from './types'

export interface CustomerInvoiceInput {
  id: string
  invoiceNumber?: string
  total: number
  paidAmount: number
  status: string
  dueAt?: string
  createdAt: string
}

export interface CustomerPaymentInput {
  id: string
  amount: number
  method?: string
  createdAt: string
}

export interface CustomerData {
  id: string
  name: string
  phone?: string
  invoices: CustomerInvoiceInput[]
  payments: CustomerPaymentInput[]
  lastActivityAt?: string
}

function getOutstanding(invoice: CustomerInvoiceInput): number {
  return (invoice.total || 0) - (invoice.paidAmount || 0)
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function buildReceivePaymentAction(customerId: string, customerName: string, invoiceId: string, amount: number): Action {
  return {
    type: 'receive_payment',
    label: 'Receive Payment',
    target: { entity: 'invoice', id: invoiceId },
  }
}

function buildCallAction(customerId: string, customerName: string): Action {
  return {
    type: 'call',
    label: 'Call',
    target: { entity: 'customer', id: customerId },
  }
}

function determineSeverity(overdueCount: number, outstanding: number): Severity {
  if (overdueCount >= 3) return 'critical'
  if (overdueCount > 0) return 'high'
  if (outstanding > 0) return 'normal'
  return 'low'
}

export function buildCustomerView(data: CustomerData, context: WorkContext): CustomerView {
  const unpaid = data.invoices.filter(i => getOutstanding(i) > 0)
  const outstanding = unpaid.reduce((s, i) => s + getOutstanding(i), 0)
  const lifetimePurchases = data.invoices.reduce((s, i) => s + (i.total || 0), 0)
  const lastPayment = data.payments.length > 0
    ? data.payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null

  const overdueCount = unpaid.filter(i => i.dueAt && new Date(i.dueAt) < context.now).length

  let headline: string
  let today: string

  if (outstanding <= 0) {
    headline = 'No pending invoices'
    today = 'Nothing to do.'
  } else if (overdueCount > 0) {
    headline = `${formatAmount(outstanding)} overdue`
    today = `${overdueCount} invoice${overdueCount > 1 ? 's' : ''} overdue. Send a reminder or call.`
  } else if (unpaid.length > 0) {
    headline = `${formatAmount(outstanding)} outstanding`
    today = `${unpaid.length} invoice${unpaid.length > 1 ? 's' : ''} pending.`
  } else {
    headline = 'All clear'
    today = 'Nothing to do.'
  }

  const invoices: InvoiceSummary[] = data.invoices.map(i => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    total: i.total,
    paidAmount: i.paidAmount,
    status: i.status,
    dueAt: i.dueAt,
    createdAt: i.createdAt,
  }))

  const payments: PaymentSummary[] = data.payments.map(p => ({
    id: p.id,
    amount: p.amount,
    method: p.method,
    createdAt: p.createdAt,
  }))

  const timeline: TimelineItem[] = [
    ...data.payments.map(p => ({
      date: p.createdAt,
      type: 'payment' as const,
      label: 'Payment received',
      detail: `${formatAmount(p.amount)} received`,
      amount: p.amount,
    })),
    ...data.invoices
      .filter(i => i.dueAt)
      .map(i => ({
        date: i.createdAt,
        type: 'system' as const,
        label: 'Invoice created',
        detail: `Invoice ${i.invoiceNumber || i.id.slice(0, 8)} for ${formatAmount(i.total)}`,
        amount: i.total,
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const actions: WorkItem[] = unpaid.slice(0, 3).map(i => {
    const amount = getOutstanding(i)
    const severity = determineSeverity(overdueCount, outstanding)
    return {
      id: `inv-${i.id}`,
      customerId: data.id,
      customerName: data.name,
      customerPhone: data.phone,
      headline: `Receive ${formatAmount(amount)}`,
      reason: `Invoice ${i.invoiceNumber || i.id.slice(0, 8)} is ${i.status}`,
      severity,
      primaryAction: buildReceivePaymentAction(data.id, data.name, i.id, amount),
      secondaryAction: buildCallAction(data.id, data.name),
      moneyImpact: amount,
      dueAt: i.dueAt ?? undefined,
    }
  })

  return {
    header: {
      name: data.name,
      headline,
      today,
    },
    money: {
      outstanding,
      lifetimePurchases,
      lastPayment: lastPayment?.createdAt,
    },
    actions,
    evidence: { invoices, payments, timeline },
  }
}