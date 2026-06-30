import { buildTodayWork } from '../work-engine/buildTodayWork'
import { buildCustomerPage } from '../work-engine/buildCustomerPage'
import { buildCashPosition } from '../work-engine/buildCashPosition'
import { buildActivity } from '../work-engine/buildActivity'
import { buildDashboardView } from '../work-engine/buildDashboardView'
import { buildDashboardSections } from '../work-engine/buildDashboardSections'
import type { DashboardView, AnyDashboardSection } from '../work-engine/types'
import type { CustomerPageView } from '../work-engine/buildCustomerPage'
import type { WorkContext } from '../work-engine/types'
import type { LoadCustomerSnapshot } from '../repositories/customer'
import type { LoadQueueCases } from '../repositories/recovery'
import type { LoadRecentActivity } from '../repositories/activity'
import type { LoadFinancialSummary } from '../repositories/finance'

export interface WorkStoreDeps {
  loadCustomerSnapshot: LoadCustomerSnapshot
  loadQueueCases: LoadQueueCases
  loadRecentActivity: LoadRecentActivity
  loadFinancialSummary: LoadFinancialSummary
}

export interface WorkStore {
  getDashboard(): Promise<{ sections: AnyDashboardSection[] }>
  getCustomer(id: string): Promise<CustomerPageView>
}

export function createWorkStore(deps: WorkStoreDeps): WorkStore {
  return {
    async getDashboard(): Promise<{ sections: AnyDashboardSection[] }> {
      const [cases, events, finance] = await Promise.all([
        deps.loadQueueCases(),
        deps.loadRecentActivity(),
        deps.loadFinancialSummary(),
      ])

      const context: WorkContext = {
        now: new Date(),
        timezone: 'Asia/Kolkata',
        locale: 'en-IN',
      }

      const view = buildDashboardView({
        work: buildTodayWork(cases, context),
        cash: buildCashPosition(finance, context),
        activity: buildActivity(events, context),
      })

      return { sections: buildDashboardSections(view, context) }
    },

    async getCustomer(id: string): Promise<CustomerPageView> {
      const snapshot = await deps.loadCustomerSnapshot(id)
      const context: WorkContext = {
        now: new Date(),
        timezone: 'Asia/Kolkata',
        locale: 'en-IN',
      }
      return buildCustomerPage(snapshot, context)
    },
  }
}
