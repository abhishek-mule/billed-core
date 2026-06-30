import type { DashboardView, AnyDashboardSection, WorkContext } from './types'
import { buildCashMetrics } from './buildCashMetrics'
import { buildActivity } from './buildActivity'

export function buildDashboardSections(view: DashboardView, context: WorkContext): AnyDashboardSection[] {
  const todaySection: AnyDashboardSection = {
    type: 'today',
    priority: 1,
    title: "Today's Work",
    payload: {
      items: view.work,
      empty: view.work.length === 0 ? {
        headline: "Today's work is complete",
        action: {
          type: 'review',
          label: 'Open Udhar',
          target: { entity: 'customer', id: '' },
        },
      } : undefined,
    },
  }

  const cashSection: AnyDashboardSection = {
    type: 'cash',
    priority: 2,
    title: "Today's Cash Position",
    payload: {
      metrics: buildCashMetrics(view.cash, context),
    },
  }

  const activitySection: AnyDashboardSection = {
    type: 'activity',
    priority: 3,
    title: 'Recent Activity',
    payload: {
      events: view.activity,
    },
    collapsible: true,
  }

  return [todaySection, cashSection, activitySection]
}