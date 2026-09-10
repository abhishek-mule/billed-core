export interface PriorityCase {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  oldestOverdueDays: number
  attentionScore: number
  nextActionType: string
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
  openInvoiceCount: number
  automationMode: 'full_auto' | 'manual' | 'muted'
}

export function buildReason(c: PriorityCase): string {
  const reasons: string[] = []

  if (c.totalOverdue > 50000) reasons.push('High outstanding amount')
  if (c.oldestOverdueDays > 30) reasons.push(`${c.oldestOverdueDays} days overdue`)
  else if (c.oldestOverdueDays > 14) reasons.push(`${c.oldestOverdueDays} days overdue`)
  else if (c.oldestOverdueDays > 7) reasons.push(`${c.oldestOverdueDays} days overdue`)
  if (c.ignoredReminders > 2) reasons.push(`${c.ignoredReminders} reminders ignored`)
  else if (c.ignoredReminders > 0) reasons.push(`${c.ignoredReminders} reminder${c.ignoredReminders > 1 ? 's' : ''} ignored`)
  if (c.brokenPromises > 0) reasons.push(`${c.brokenPromises} payment promise${c.brokenPromises > 1 ? 's' : ''} missed`)
  if (c.nextActionType === 'call' && c.totalOverdue > 100000) reasons.push('Large amount needs personal follow-up')

  return reasons.length > 0 ? reasons.join(' + ') : 'Routine follow-up'
}

export function getNextActionLabel(type: string): string {
  const labels: Record<string, string> = {
    send_reminder: 'Send gentle reminder',
    call: 'Call personally',
    follow_up_call: 'Follow up call',
    wait: 'Wait (promise active)',
    merchant_review: 'Review manually'
  }
  return labels[type] || 'Follow up'
}