import type { LoadFinancialSummary } from '@billzo/shared'

export const loadFinancialSummary: LoadFinancialSummary = async () => {
  const res = await fetch('/api/recovery/queue', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load financial summary')
  const data = await res.json()
  
  const summary = data.summary || {}
  return {
    outstanding: summary.outstanding || 0,
    collectedToday: summary.totalCollectedToday || summary.recoveredToday || 0,
    dueToday: summary.dueToday || 0,
    customerCount: summary.activeCases || 0,
  }
}