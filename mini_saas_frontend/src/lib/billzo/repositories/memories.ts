import type { MerchantMemory, BusinessInsight } from '@billzo/shared'

export interface MerchantMemoriesResult {
  memories: MerchantMemory[]
  insights: BusinessInsight[]
}

export const loadMerchantMemories: () => Promise<MerchantMemoriesResult> = async () => {
  const res = await fetch('/api/recovery/memories', { credentials: 'include' })
  if (!res.ok) return { memories: [], insights: [] }
  const data = await res.json()
  return {
    memories: data.memories || [],
    insights: data.insights || [],
  }
}