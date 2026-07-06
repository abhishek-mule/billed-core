import { buildTodayWork } from '../work-engine/buildTodayWork'
import { buildAutomationPlan } from '../work-engine/buildAutomationPlan'
import { buildCustomerPage } from '../work-engine/buildCustomerPage'
import { buildCashPosition } from '../work-engine/buildCashPosition'
import { buildActivity } from '../work-engine/buildActivity'
import { buildDashboardView } from '../work-engine/buildDashboardView'
import { buildDashboardSections } from '../work-engine/buildDashboardSections'
import type { DashboardView, AnyDashboardSection, BusinessInsight } from '../work-engine/types'
import type { CustomerPageView } from '../work-engine/buildCustomerPage'
import type { WorkContext } from '../work-engine/types'
import type { MerchantMemory } from '../work-engine/types'
import type { LoadCustomerSnapshot } from '../repositories/customer'
import type { LoadQueueCases, LoadUpcomingReminders } from '../repositories/recovery'
import type { LoadRecentActivity } from '../repositories/activity'
import type { LoadFinancialSummary } from '../repositories/finance'

export interface MerchantMemoriesResult {
  memories: MerchantMemory[]
  insights: BusinessInsight[]
}

export type LoadMerchantMemories = () => Promise<MerchantMemoriesResult>

export interface WorkStoreDeps {
  loadCustomerSnapshot: LoadCustomerSnapshot
  loadQueueCases: LoadQueueCases
  loadRecentActivity: LoadRecentActivity
  loadFinancialSummary: LoadFinancialSummary
  loadMerchantMemories?: LoadMerchantMemories
  loadUpcomingReminders?: LoadUpcomingReminders
}

export interface WorkStore {
  getDashboard(): Promise<{ sections: AnyDashboardSection[] }>
  getCustomer(id: string): Promise<CustomerPageView>
}

export function createWorkStore(deps: WorkStoreDeps): WorkStore {
  return {
    async getDashboard(): Promise<{ sections: AnyDashboardSection[] }> {
      const [cases, events, finance, memoriesResult, upcoming] = await Promise.all([
        deps.loadQueueCases(),
        deps.loadRecentActivity(),
        deps.loadFinancialSummary(),
        deps.loadMerchantMemories ? deps.loadMerchantMemories() : Promise.resolve({ memories: [], insights: [] }),
        deps.loadUpcomingReminders ? deps.loadUpcomingReminders() : Promise.resolve([]),
      ])

      const context: WorkContext = {
        now: new Date(),
        timezone: 'Asia/Kolkata',
        locale: 'en-IN',
      }

      const view: DashboardView = {
        work: buildTodayWork(cases, context),
        cash: buildCashPosition(finance, context),
        activity: buildActivity(events, context),
        memories: memoriesResult.memories,
        insights: memoriesResult.insights,
        automationPlan: buildAutomationPlan(cases, upcoming),
      }

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