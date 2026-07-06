import type { DashboardView, AnyDashboardSection, WorkContext, AutomationPlanItem } from './types'
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

export function buildDashboardSections(view: DashboardView, context: WorkContext): AnyDashboardSection[] {
  const sections: AnyDashboardSection[] = []
  const hasWork = view.work.length > 0

  // Determine next action and fallback
  const plan = view.automationPlan
  const nextActionItem = plan.length > 0 ? planToNextAction(plan[0]) : undefined
  const planFallback = plan.length === 0 ? {
    headline: "All outstanding invoices are within their grace period",
    subtitle: "No follow-ups are scheduled right now. We'll notify you when action is needed.",
  } : undefined

  // Today's Work
  sections.push({
    type: 'today',
    priority: 1,
    title: "Today's Work",
    payload: {
      items: view.work,
      empty: !hasWork ? {
        headline: "Nothing needs your attention right now",
        subtitle: "Auto follow-ups are already handling your pending payments.",
        autoActions: view.cash.customerCount > 0 ? [
          `Recovering \u20B9${view.cash.outstanding.toLocaleString('en-IN')} from ${view.cash.customerCount} customer${view.cash.customerCount === 1 ? '' : 's'}`,
          "Reminders scheduled",
          "Monitoring incoming payments",
          "We'll notify you if manual action is required",
        ] : undefined,
        nextAction: nextActionItem,
        statusFallback: planFallback,
        scheduleLink: "/recovery",
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