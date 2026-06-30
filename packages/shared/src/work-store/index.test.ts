import { describe, it, expect } from 'vitest'
import { createWorkStore } from './index'
import type { QueueCaseInput } from '../work-engine/buildTodayWork'
import type { ActivityEventInput } from '../work-engine/buildActivity'
import type { FinancialInput } from '../work-engine/buildCashPosition'
import type { CustomerSnapshot } from '../repositories/customer'

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

describe('WorkStore', () => {
  describe('getDashboard', () => {
    it('returns a DashboardView with work, cash, and activity', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getDashboard()

      expect(result).toHaveProperty('work')
      expect(result).toHaveProperty('cash')
      expect(result).toHaveProperty('activity')
    })

    it('builds work from queue cases', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getDashboard()

      expect(result.work).toHaveLength(1)
      expect(result.work[0].customerName).toBe('Ankit')
      expect(result.work[0].moneyImpact).toBe(15000)
    })

    it('builds cash position from financial summary', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getDashboard()

      expect(result.cash.outstanding).toBe(15000)
      expect(result.cash.collectedToday).toBe(5000)
      expect(result.cash.expectedToday).toBe(15000)
    })

    it('builds activity from recent events', async () => {
      const store = createWorkStore(mockDeps())
      const result = await store.getDashboard()

      expect(result.activity).toHaveLength(1)
      expect(result.activity[0].label).toContain('payment received')
    })

    it('returns empty work when no queue cases', async () => {
      const deps = mockDeps({
        loadQueueCases: async () => [],
      })
      const store = createWorkStore(deps)
      const result = await store.getDashboard()

      expect(result.work).toHaveLength(0)
      expect(result.cash.outstanding).toBe(15000)
      expect(result.activity).toHaveLength(1)
    })

    it('returns empty activity when no recent events', async () => {
      const deps = mockDeps({
        loadRecentActivity: async () => [],
      })
      const store = createWorkStore(deps)
      const result = await store.getDashboard()

      expect(result.work).toHaveLength(1)
      expect(result.activity).toHaveLength(0)
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
