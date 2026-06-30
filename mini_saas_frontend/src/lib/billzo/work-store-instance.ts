import { createWorkStore } from '@billzo/shared'
import { loadCustomerSnapshot } from './repositories/customer'
import { loadQueueCases } from './repositories/recovery'
import { loadRecentActivity } from './repositories/activity'
import { loadFinancialSummary } from './repositories/finance'

export const workStore = createWorkStore({
  loadCustomerSnapshot,
  loadQueueCases,
  loadRecentActivity,
  loadFinancialSummary,
})