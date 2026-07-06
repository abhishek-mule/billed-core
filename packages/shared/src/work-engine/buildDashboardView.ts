import type { DashboardView, WorkItem, CashPosition, ActivityItem, AutomationPlanItem } from './types'

export interface DashboardInput {
  work: WorkItem[]
  cash: CashPosition
  activity: ActivityItem[]
}

export function buildDashboardView(input: DashboardInput, automationPlan?: AutomationPlanItem[]): DashboardView {
  return {
    work: input.work,
    cash: input.cash,
    activity: input.activity,
    automationPlan: automationPlan || [],
  }
}
