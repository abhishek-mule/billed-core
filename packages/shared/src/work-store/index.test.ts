import { describe, it, expect } from 'vitest'
import { createWorkStore } from './index'
import type { QueueCaseInput } from '../work-engine/buildTodayWork'
import type { ActivityEventInput } from '../work-engine/buildActivity'
import type { FinancialInput } from '../work-engine/buildCashPosition'
import type { CustomerSnapshot } from '../repositories/customer'
import type { AnyDashboardSection } from '../work-engine/types'

function mockDeps(overrides?: Partial<ReturnType<typeof buildMocks>>) {
  const defaults = buildMocks()
  return {
    loadQueueCases: overrides?.loadQueueCases ?? defaults.loadQueueCases,
    loadRecentActivity: overrides?.loadRecentActivity ?? defaults.loadRecentActivity,
    loadFinancialSummary: overrides?.loadFinancialSummary ?? defaults.loadFinancialSummary,
    loadCustomerSnapshot: overrides?.loadCustomerSnapshot ?? defaults.loadCustomerSnapshot,
  }
}

function buildMocks() {
  return {
    loadQueueCases: async (): Promise<QueueCaseInput[]> => [
      {
        caseId: 'c1',
        customerId: 'cust-1',
        customerName: 'Ankit',
        phone: '+919876543210',
        totalOverdue: 15000,
        oldestOverdueDays: 5,
        nextActionType: 'send_reminder',
        promiseToPayDate: null,
        ignoredReminders: 0,
        brokenPromises: 0,
      },
    ],
    loadRecentActivity: async (): Promise<ActivityEventInput[]> => [
      { occurredAt: '2026-06-30T10:00:00Z', eventType: 'payment_received', customerName: 'Ankit', amount: 5000 },
    ],
    loadFinancialSummary: async (): Promise<FinancialInput> => ({
      outstanding: 15000,
      collectedToday: 5000,
      dueToday: 15000,
      customerCount: 1,
    }),
    loadCustomerSnapshot: async (id: string): Promise<CustomerSnapshot> => ({
      id,
      name: 'Ankit',
      phone: '+919876543210',
      invoices: [
        { id: 'inv-1', total: 15000, paidAmount: 0, status: 'unpaid', createdAt: '2026-06-25T00:00:00Z', dueAt: '2026-07-05T00:00:00Z' },
      ],
      payments: [],
    }),
  }
}

function isTodaySection(section: AnyDashboardSection): section is AnyDashboardSection & { type: 'today'; payload: { items: any[]; empty?: any } } {
  return section.type === 'today'
}

function isCashSection(section: AnyDashboardSection): section is AnyDashboardSection & { type: 'cash'; payload: { metrics: any[] } } {
  return section.type === 'cash'
}

function isActivitySection(section: AnyDashboardSection): section is AnyDashboardSection & { type: 'activity'; payload: { events: any[] } } {
  return section.type === 'activity'
}

function getTodaySection(sections: AnyDashboardSection[]) {
  return sections.find(isTodaySection)
}

function getCashSection(sections: AnyDashboardSection[]) {
  return sections.find(isCashSection)
}

function getActivitySection(sections: AnyDashboardSection[]) {
  return sections.find(isActivitySection)
}

describe('WorkStore', () => {
  describe('getDashboard', () => {
    it('returns sections with today, cash, and activity', async () => {
      const store = createWorkStore(mockDeps())
      const { sections } = await store.getDashboard()

      const todaySection = getTodaySection(sections)
      const cashSection = getCashSection(sections)
      const activitySection = getActivitySection(sections)

      expect(todaySection).toBeDefined()
      expect(cashSection).toBeDefined()
      expect(activitySection).toBeDefined()
    })

    it('builds work items in today section from queue cases', async () => {
      const store = createWorkStore(mockDeps())
      const { sections } = await store.getDashboard()

      const todaySection = getTodaySection(sections)
      expect(todaySection?.payload.items).toHaveLength(1)
      expect(todaySection?.payload.items[0].customerName).toBe('Ankit')
      expect(todaySection?.payload.items[0].moneyImpact).toBe(15000)
    })

    it('builds cash position in cash section from financial summary', async () => {
      const store = createWorkStore(mockDeps())
      const { sections } = await store.getDashboard()

      const cashSection = getCashSection(sections)
      expect(cashSection?.payload.metrics).toHaveLength(3)
      const outstanding = cashSection?.payload.metrics.find(m => m.label === 'Money to Collect')
      const collectedToday = cashSection?.payload.metrics.find(m => m.label === 'Received Today')
      const expectedToday = cashSection?.payload.metrics.find(m => m.label === 'Expected Today')
      expect(outstanding?.value).toBe('₹15,000')
      expect(collectedToday?.value).toBe('₹5,000')
      expect(expectedToday?.value).toBe('₹15,000')
    })

    it('builds activity in activity section from recent events', async () => {
      const store = createWorkStore(mockDeps())
      const { sections } = await store.getDashboard()

      const activitySection = getActivitySection(sections)
      expect(activitySection?.payload.events).toHaveLength(1)
      expect(activitySection?.payload.events[0].label).toContain('payment received')
    })

    it('returns empty today section when no queue cases', async () => {
      const deps = mockDeps({
        loadQueueCases: async () => [],
      })
      const store = createWorkStore(deps)
      const { sections } = await store.getDashboard()

      const todaySection = getTodaySection(sections)
      expect(todaySection?.payload.items).toHaveLength(0)
      expect(todaySection?.payload.empty).toBeDefined()
      expect(todaySection?.payload.empty?.headline).toContain("Recovering")

      const cashSection = getCashSection(sections)
      expect(cashSection?.payload.metrics).toHaveLength(3)

      const activitySection = getActivitySection(sections)
      expect(activitySection?.payload.events).toHaveLength(1)
    })

    it('returns empty activity section when no recent events', async () => {
      const deps = mockDeps({
        loadRecentActivity: async () => [],
      })
      const store = createWorkStore(deps)
      const { sections } = await store.getDashboard()

      const todaySection = getTodaySection(sections)
      expect(todaySection?.payload.items).toHaveLength(1)

      const activitySection = getActivitySection(sections)
      expect(activitySection?.payload.events).toHaveLength(0)
    })
  })

  describe('getCustomer', () => {
    it('returns a CustomerPageView for the given id', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getCustomer('cust-1')

      expect(result).toHaveProperty('header')
      expect(result).toHaveProperty('money')
      expect(result).toHaveProperty('actions')
      expect(result).toHaveProperty('evidence')
    })

    it('includes customer name in the header', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getCustomer('cust-1')

      expect(result.header.name).toBe('Ankit')
    })

    it('calculates outstanding from invoices', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getCustomer('cust-1')

      expect(result.money.outstanding).toBe(15000)
    })

    it('includes invoices in evidence', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getCustomer('cust-1')

      expect(result.evidence.invoices).toHaveLength(1)
      expect(result.evidence.invoices[0].total).toBe(15000)
    })

    it('returns empty arrays for customers with no data', async () => {
      const deps = mockDeps({
        loadCustomerSnapshot: async (id: string): Promise<CustomerSnapshot> => ({
          id,
          name: 'Empty Customer',
          invoices: [],
          payments: [],
        }),
      })
      const store = createWorkStore(deps)
      const result = await store.getCustomer('empty')

      expect(result.money.outstanding).toBe(0)
      expect(result.money.lifetimePurchases).toBe(0)
      expect(result.evidence.invoices).toHaveLength(0)
      expect(result.evidence.payments).toHaveLength(0)
      expect(result.actions).toHaveLength(0)
    })
  })
})