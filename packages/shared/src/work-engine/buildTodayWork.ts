import { SeverityWeight } from './types'
import type { WorkItem, WorkAction, Action, Severity, WorkContext } from './types'

export interface QueueCaseInput {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  oldestOverdueDays: number
  nextActionType: string
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
}

function classifyCase(input: QueueCaseInput, context: WorkContext): {
  severity: Severity
  headline: string
  reason: string
  primaryAction: Action
  secondaryAction?: Action
} {
  if (input.nextActionType === 'review_payment') {
    return {
      severity: 'high',
      headline: `Review payment from ${input.customerName}`,
      reason: 'A payment needs your confirmation.',
      primaryAction: {
        type: 'receive_payment',
        label: 'Receive Payment',
        target: { entity: 'payment', id: input.caseId },
      },
    }
  }

  if (input.brokenPromises > 0) {
    return {
      severity: 'critical',
      headline: `Call ${input.customerName}`,
      reason: 'A payment promise was missed. A call works better than a reminder.',
      primaryAction: {
        type: 'call',
        label: 'Call',
        target: { entity: 'customer', id: input.customerId },
      },
      secondaryAction: {
        type: 'receive_payment',
        label: 'Receive Payment',
        target: { entity: 'payment', id: input.caseId },
      },
    }
  }

  if (input.ignoredReminders >= 3) {
    return {
      severity: 'critical',
      headline: `Call ${input.customerName}`,
      reason: 'Three reminders were ignored. Try a direct call.',
      primaryAction: {
        type: 'call',
        label: 'Call',
        target: { entity: 'customer', id: input.customerId },
      },
      secondaryAction: {
        type: 'send_reminder',
        label: 'Send Reminder',
        target: { entity: 'customer', id: input.customerId },
      },
    }
  }

  if (input.promiseToPayDate) {
    const due = new Date(input.promiseToPayDate)
    const today = context.now
    today.setHours(0, 0, 0, 0)

    if (due <= today) {
      return {
        severity: 'high',
        headline: `Follow up with ${input.customerName}`,
        reason: 'Promise due today. Call if payment does not arrive.',
        primaryAction: {
          type: 'review',
          label: 'Review',
          target: { entity: 'customer', id: input.customerId },
        },
        secondaryAction: {
          type: 'call',
          label: 'Call',
          target: { entity: 'customer', id: input.customerId },
        },
      }
    }

    return {
      severity: 'low',
      headline: `Wait for ${input.customerName}`,
      reason: `Promised payment by ${input.promiseToPayDate}. No action needed now.`,
      primaryAction: {
        type: 'wait',
        label: 'Wait',
      },
    }
  }

  if (input.oldestOverdueDays > 0) {
    return {
      severity: 'high',
      headline: `Receive ${formatAmount(input.totalOverdue)} from ${input.customerName}`,
      reason: `${input.oldestOverdueDays} days overdue. Send a reminder.`,
      primaryAction: {
        type: 'receive_payment',
        label: 'Receive Payment',
        target: { entity: 'payment', id: input.caseId },
      },
      secondaryAction: {
        type: 'send_reminder',
        label: 'Send Reminder',
        target: { entity: 'customer', id: input.customerId },
      },
    }
  }

  return {
    severity: 'normal',
    headline: `Receive ${formatAmount(input.totalOverdue)} from ${input.customerName}`,
    reason: 'Payment is pending.',
    primaryAction: {
      type: 'receive_payment',
      label: 'Receive Payment',
      target: { entity: 'payment', id: input.caseId },
    },
    secondaryAction: {
      type: 'send_reminder',
      label: 'Send Reminder',
      target: { entity: 'customer', id: input.customerId },
    },
  }
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function buildTodayWork(cases: QueueCaseInput[], context: WorkContext): WorkItem[] {
  return cases
    .map(c => {
      const { severity, headline, reason, primaryAction, secondaryAction } = classifyCase(c, context)
      return {
        id: c.caseId,
        customerId: c.customerId,
        customerName: c.customerName,
        customerPhone: c.phone,
        headline,
        reason,
        severity,
        primaryAction,
        secondaryAction,
        moneyImpact: c.totalOverdue,
        dueAt: c.promiseToPayDate ?? undefined,
      }
    })
    .sort((a, b) => SeverityWeight[b.severity] - SeverityWeight[a.severity])
}