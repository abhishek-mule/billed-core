import type { LoadQueueCases } from '@billzo/shared'

export const loadQueueCases: LoadQueueCases = async () => {
  const res = await fetch('/api/recovery/queue', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load queue')
  const data = await res.json()
  
  return (data.summary?.priorityCases || []).map((c: any) => ({
    caseId: c.caseId,
    customerId: c.customerId,
    customerName: c.customerName,
    phone: c.phone,
    totalOverdue: c.totalOverdue,
    oldestOverdueDays: c.oldestOverdueDays,
    nextActionType: c.nextActionType,
    promiseToPayDate: c.promiseToPayDate,
    ignoredReminders: c.ignoredReminders,
    brokenPromises: c.brokenPromises,
  }))
}