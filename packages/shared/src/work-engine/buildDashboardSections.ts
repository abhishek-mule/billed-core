import type { DashboardView, AnyDashboardSection, WorkContext, AutomationPlanItem, Action } from './types'
import { buildCashMetrics } from './buildCashMetrics'
import { buildActivity } from './buildActivity'
import { formatPlanTime } from './buildAutomationPlan'

const PLAN_TYPE_LABEL: Record<string, string> = {
  reminder: 'Reminder',
  call: 'Call required',
  review: 'Review',
  wait: 'Waiting',
}

function planToNextAction(item: AutomationPlanItem): { when: string; label: string; customerName: string; type: 'reminder' | 'call' | 'review' | 'wait'; status: string; reason?: string } {
  return {
    when: formatPlanTime(item.nextAction.scheduledAt) || item.status.replace('_', ' '),
    label: PLAN_TYPE_LABEL[item.nextAction.type] || item.nextAction.type,
    customerName: item.customerName,
    type: item.nextAction.type,
    status: item.status,
    reason: item.nextAction.reason,
  }
}

interface EmptyStateContent {
  headline: string
  subtitle?: string
  autoActions?: string[]
  nextAction?: { when: string; label: string; customerName?: string; type: 'reminder' | 'call' | 'review' | 'wait'; status: string; reason?: string }
  action: Action
}

function computeEmptyState(cash: DashboardView['cash'], plan: AutomationPlanItem[], nextActionItem: ReturnType<typeof planToNextAction> | undefined): EmptyStateContent {
  const isAllClear = cash.customerCount === 0
  const amount = cash.outstanding
  const count = cash.customerCount

  if (isAllClear) {
    return {
      headline: "All invoices collected",
      autoActions: ["No outstanding payments."],
      action: { type: 'review', label: 'View Outstanding', target: { entity: 'customer', id: '' } },
    }
  }

  const totalStr = `\u20B9${amount.toLocaleString('en-IN')}`
  const customerStr = `${count} customer${count === 1 ? '' : 's'}`

  const hasScheduledReminder = plan.some(p => p.status === 'scheduled')
  const hasManualRequired = plan.some(p => p.status === 'manual_required')
  const hasWaitingPromise = plan.some(p => p.status === 'waiting')

  if (nextActionItem && nextActionItem.status === 'scheduled') {
    return {
      headline: `Recovering ${totalStr} from ${customerStr}`,
      subtitle: "No action needed — automation is handling this.",
      nextAction: nextActionItem,
      action: { type: 'review', label: 'View Outstanding', target: { entity: 'customer', id: '' } },
    }
  }

  if (hasManualRequired) {
    return {
      headline: `Manual action needed for ${customerStr}`,
      subtitle: `${totalStr} outstanding — some customers need your attention.`,
      action: { type: 'review', label: 'View Outstanding', target: { entity: 'customer', id: '' } },
    }
  }

  if (hasWaitingPromise || hasScheduledReminder || nextActionItem) {
    return {
      headline: `Recovering ${totalStr} from ${customerStr}`,
      subtitle: "Automation will follow up at the right time. No action needed now.",
      nextAction: nextActionItem,
      action: { type: 'review', label: 'View Outstanding', target: { entity: 'customer', id: '' } },
    }
  }

  return {
    headline: `Recovering ${totalStr} from ${customerStr}`,
    subtitle: "Monitoring in progress. No action needed right now.",
    action: { type: 'review', label: 'View Outstanding', target: { entity: 'customer', id: '' } },
  }
}

export function buildDashboardSections(view: DashboardView, context: WorkContext): AnyDashboardSection[] {
  const sections: AnyDashboardSection[] = []
  const hasWork = view.work.length > 0

  const plan = view.automationPlan
  const nextActionItem = plan.length > 0 ? planToNextAction(plan[0]) : undefined
  const emptyState = !hasWork && view.cash.customerCount > 0
    ? computeEmptyState(view.cash, plan, nextActionItem)
    : undefined

  sections.push({
    type: 'today',
    priority: 1,
    title: "Today's Work",
    payload: {
      items: view.work,
      empty: !hasWork ? {
        headline: view.cash.customerCount === 0
          ? "All invoices collected"
          : emptyState?.headline ?? "No work items for today",
        subtitle: view.cash.customerCount === 0
          ? undefined
          : emptyState?.subtitle,
        autoActions: view.cash.customerCount === 0
          ? ["No outstanding payments."]
          : emptyState?.autoActions,
        nextAction: emptyState?.nextAction,
        action: {
          type: 'review',
          label: 'View Outstanding',
          target: { entity: 'customer', id: '' },
        },
      } : undefined,
    },
  })

  // What BillZo Learned — only when there's work (actionable insights only)
  const memories = view.memories || []
  const insights = view.insights || []
  const highConfMemories = memories.filter(m => m.confidence >= 0.6)
  if (hasWork && (highConfMemories.length > 0 || insights.length > 0)) {
    sections.push({
      type: 'memories',
      priority: 1.5,
      title: 'What BillZo Learned',
      payload: {
        memories,
        insights,
      },
    })
  }

  // Cash Position
  sections.push({
    type: 'cash',
    priority: 2,
    title: "Today's Cash Position",
    payload: {
      metrics: buildCashMetrics(view.cash, context),
    },
  })

  // Recent Activity
  sections.push({
    type: 'activity',
    priority: 3,
    title: 'Recent Activity',
    payload: {
      events: view.activity,
      hasWorkItems: hasWork,
    },
    collapsible: true,
  })

  return sections
}