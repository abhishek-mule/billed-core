import type { QueueCaseInput } from './buildTodayWork'
import type { UpcomingReminder } from '../repositories/recovery'
import type { AutomationPlanItem } from './types'

export function buildAutomationPlan(
  cases: QueueCaseInput[],
  upcoming: UpcomingReminder[],
): AutomationPlanItem[] {
  const plan: AutomationPlanItem[] = []
  const now = new Date()

  // 1. Scheduled reminders from upcoming
  for (const r of upcoming) {
    if (!r.nextRecoveryAt || r.isPending) continue
    const at = new Date(r.nextRecoveryAt)
    if (at <= now) continue
    plan.push({
      customerId: '',
      customerName: r.customerName,
      status: 'scheduled',
      nextAction: {
        type: 'reminder',
        scheduledAt: r.nextRecoveryAt,
        reason: `Invoice \u20B9${r.amount.toLocaleString('en-IN')}`,
      },
    })
  }

  // 2. Manual actions needed from queue cases
  for (const c of cases) {
    if (c.brokenPromises > 0) {
      plan.push({
        customerId: c.customerId,
        customerName: c.customerName,
        status: 'manual_required',
        nextAction: {
          type: 'call',
          reason: `${c.brokenPromises} broken promise${c.brokenPromises > 1 ? 's' : ''}`,
        },
      })
      continue
    }
    if (c.ignoredReminders >= 3) {
      plan.push({
        customerId: c.customerId,
        customerName: c.customerName,
        status: 'manual_required',
        nextAction: {
          type: 'review',
          reason: `${c.ignoredReminders} reminders ignored`,
        },
      })
      continue
    }
  }

  // 3. Waiting for promises
  for (const c of cases) {
    if (c.promiseToPayDate) {
      const pDate = new Date(c.promiseToPayDate)
      if (pDate > now) {
        const days = Math.ceil((pDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        plan.push({
          customerId: c.customerId,
          customerName: c.customerName,
          status: 'waiting',
          nextAction: {
            type: 'wait',
            scheduledAt: c.promiseToPayDate,
            reason: days <= 1 ? 'Promised payment due tomorrow' : `Promised payment in ${days} days`,
          },
        })
      }
    }
  }

  // Sort: manual_required first, then by scheduledAt ascending
  plan.sort((a, b) => {
    if (a.status === 'manual_required' && b.status !== 'manual_required') return -1
    if (a.status !== 'manual_required' && b.status === 'manual_required') return 1
    if (a.nextAction.scheduledAt && b.nextAction.scheduledAt) {
      return new Date(a.nextAction.scheduledAt).getTime() - new Date(b.nextAction.scheduledAt).getTime()
    }
    if (a.nextAction.scheduledAt) return -1
    if (b.nextAction.scheduledAt) return 1
    return 0
  })

  return plan
}

export function formatPlanTime(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (isToday) return `Today \u2022 ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow \u2022 ${time}`
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }) + ` \u2022 ${time}`
}