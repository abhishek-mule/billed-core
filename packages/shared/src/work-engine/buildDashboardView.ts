import type { DashboardView, WorkItem, CashPosition, ActivityItem } from './types'

export interface DashboardInput {
  work: WorkItem[]
  cash: CashPosition
  activity: ActivityItem[]
}

export function buildDashboardView(input: DashboardInput): DashboardView {
  return {
    work: input.work,
    cash: input.cash,
    activity: input.activity,
  }
}
