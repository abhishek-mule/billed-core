import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

export type ErpSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED' | 'RETRY' | 'CONFIRMED'

export interface ErpWriteAttempt {
  id: string
  tenantId: string
  invoiceId: string
  invoiceNumber: string
  status: ErpSyncStatus
  erpInvoiceId?: string
  attemptNumber: number
  lastAttemptAt: number
  error?: string
  createdAt: number
}

export async function createErpWriteAttempt(
  tenantId: string,
  invoiceId: string,
  invoiceNumber: string
): Promise<string> {
  const redis = getRedis()
  const attemptId = `erp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  
  const attempt: ErpWriteAttempt = {
    id: attemptId,
    tenantId,
    invoiceId,
    invoiceNumber,
    status: 'PENDING',
    attemptNumber: 1,
    lastAttemptAt: Date.now(),
    createdAt: Date.now(),
  }
  
  await redis.set(`erp_attempt:${tenantId}:${invoiceId}`, JSON.stringify(attempt), {
    ex: 86400 * 7,
  })
  
  return attemptId
}

export async function getErpWriteAttempt(
  tenantId: string,
  invoiceId: string
): Promise<ErpWriteAttempt | null> {
  const redis = getRedis()
  const attempt = await redis.get<ErpWriteAttempt>(
    `erp_attempt:${tenantId}:${invoiceId}`
  )
  return attempt || null
}

export async function markErpWriteSuccess(
  tenantId: string,
  invoiceId: string,
  erpInvoiceId: string
): Promise<void> {
  const redis = getRedis()
  const attemptKey = `erp_attempt:${tenantId}:${invoiceId}`
  
  const attempt = await redis.get<ErpWriteAttempt>(attemptKey)
  
  if (attempt) {
    attempt.status = 'SYNCED'
    attempt.erpInvoiceId = erpInvoiceId
    attempt.lastAttemptAt = Date.now()
    
    await redis.set(attemptKey, JSON.stringify(attempt), { ex: 86400 * 7 })
  }
}

export async function markErpWriteFailed(
  tenantId: string,
  invoiceId: string,
  error: string,
  canRetry: boolean = true
): Promise<void> {
  const redis = getRedis()
  const attemptKey = `erp_attempt:${tenantId}:${invoiceId}`
  
  const attempt = await redis.get<ErpWriteAttempt>(attemptKey)
  
  if (attempt) {
    attempt.status = canRetry ? 'RETRY' : 'FAILED'
    attempt.attemptNumber += 1
    attempt.lastAttemptAt = Date.now()
    attempt.error = error
    
    await redis.set(attemptKey, JSON.stringify(attempt), { ex: 86400 * 7 })
  }
}

export async function recordErpWriteAttempt(
  tenantId: string,
  invoiceId: string,
  invoiceNumber: string
): Promise<{ shouldRetry: boolean; maxRetriesReached: boolean }> {
  const attempt = await getErpWriteAttempt(tenantId, invoiceId)
  
  if (!attempt) {
    await createErpWriteAttempt(tenantId, invoiceId, invoiceNumber)
    return { shouldRetry: true, maxRetriesReached: false }
  }
  
  if (attempt.status === 'SYNCED' || attempt.status === 'CONFIRMED') {
    return { shouldRetry: false, maxRetriesReached: false }
  }
  
  const maxRetries = 3
  const maxRetriesReached = attempt.attemptNumber >= maxRetries
  
  if (attempt.status === 'FAILED' && maxRetriesReached) {
    return { shouldRetry: false, maxRetriesReached: true }
  }
  
  return { shouldRetry: attempt.status !== 'FAILED', maxRetriesReached }
}

export async function getErpSyncHistory(
  tenantId: string,
  invoiceId: string
): Promise<ErpWriteAttempt[]> {
  const redis = getRedis()
  const attempt = await redis.get<ErpWriteAttempt>(
    `erp_attempt:${tenantId}:${invoiceId}`
  )
  
  if (!attempt) return []
  
  return [attempt]
}

export async function isInvoiceSynced(
  tenantId: string,
  invoiceId: string
): Promise<boolean> {
  const attempt = await getErpWriteAttempt(tenantId, invoiceId)
  return attempt?.status === 'SYNCED'
}

export async function getFailedSyncInvoices(
  tenantId: string,
  limit: number = 10
): Promise<ErpWriteAttempt[]> {
  const redis = getRedis()
  const keys = await redis.keys(`erp_attempt:${tenantId}:*`)
  
  const failed: ErpWriteAttempt[] = []
  
  for (const key of keys.slice(0, limit)) {
    const attempt = await redis.get<ErpWriteAttempt>(key)
    if (attempt?.status === 'FAILED') {
      failed.push(attempt)
    }
  }
  
  return failed
}