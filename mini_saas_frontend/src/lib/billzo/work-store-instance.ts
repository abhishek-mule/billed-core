import { createWorkStore } from '@billzo/shared'
import { loadCustomerSnapshot } from './repositories/customer'
import { loadQueueCases } from './repositories/recovery'
import { loadRecentActivity } from './repositories/activity'
import { loadFinancialSummary } from './repositories/finance'
import { loadMerchantMemories } from './repositories/memories'
import { loadUpcomingReminders } from './repositories/upcoming'

export const workStore = createWorkStore({
  loadCustomerSnapshot,
  loadQueueCases,
  loadRecentActivity,
  loadFinancialSummary,
  loadMerchantMemories,
  loadUpcomingReminders,
})