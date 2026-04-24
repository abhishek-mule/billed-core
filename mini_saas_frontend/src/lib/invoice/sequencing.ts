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

const LOCK_TTL = 5000
const RESERVATION_TIMEOUT_MS = 30000
const RESERVATION_GC_INTERVAL_MS = 300000

export function getCurrentFinancialYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export function getFinancialYearFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth()
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export function getSequenceKey(tenantId: string, financialYear?: string): string {
  const fy = financialYear || getCurrentFinancialYear()
  return `invoice_seq:${tenantId}:${fy}`
}

export async function acquireInvoiceNumber(
  tenantId: string,
  seriesPrefix: string = 'INV',
  financialYear?: string
): Promise<string> {
  const redis = getRedis()
  const fy = financialYear || getCurrentFinancialYear()
  
  const lockKey = `invoice_seq_lock:${tenantId}:${fy}`
  const seqKey = getSequenceKey(tenantId, fy)
  
  const lockAcquired = await redis.set(lockKey, '1', {
    nx: true,
    ex: LOCK_TTL / 1000,
  })
  
  if (!lockAcquired) {
    await new Promise(resolve => setTimeout(resolve, 100))
    return acquireInvoiceNumber(tenantId, seriesPrefix, fy)
  }
  
  try {
    const current = await redis.get<number>(seqKey) || 0
    const nextSeq = current + 1
    
    const padded = nextSeq.toString().padStart(5, '0')
    const invoiceNumber = `${seriesPrefix}-${padded}`
    
    await redis.set(seqKey, nextSeq, { ex: 31536000 })
    
    return invoiceNumber
  } finally {
    await redis.del(lockKey)
  }
}

export async function getCurrentInvoiceSequence(
  tenantId: string,
  financialYear?: string
): Promise<number> {
  const fy = financialYear || getCurrentFinancialYear()
  const redis = getRedis()
  const current = await redis.get<number>(getSequenceKey(tenantId, fy))
  return current || 0
}

export interface ReservationState {
  invoiceNumber: string
  reservedAt: number
  confirmedAt?: number
  financialYear: string
}

export async function reserveInvoiceNumber(
  tenantId: string,
  idempotencyKey: string,
  financialYear?: string
): Promise<{ reserved: boolean; invoiceNumber?: string }> {
  const redis = getRedis()
  const fy = financialYear || getCurrentFinancialYear()
  const reservationKey = `invoice_reserve:${tenantId}:${idempotencyKey}`
  
  const existing = await redis.get<ReservationState>(reservationKey)
  
  if (existing) {
    return { reserved: true, invoiceNumber: existing.invoiceNumber }
  }
  
  const invoiceNumber = await acquireInvoiceNumber(tenantId, 'INV', fy)
  
  await redis.set(reservationKey, JSON.stringify({
    invoiceNumber,
    reservedAt: Date.now(),
    financialYear: fy,
  }), { ex: 3600 })
  
  return { reserved: false, invoiceNumber }
}

export async function confirmInvoiceNumber(
  tenantId: string,
  invoiceNumber: string,
  idempotencyKey: string,
  erpInvoiceId?: string
): Promise<{ success: boolean }> {
  const redis = getRedis()
  const reservationKey = `invoice_reserve:${tenantId}:${idempotencyKey}`
  const confirmedKey = `invoice_confirmed:${tenantId}:${invoiceNumber}`
  
  const reservation = await redis.get<ReservationState>(reservationKey)
  
  if (!reservation) {
    return { success: false }
  }
  
  if (reservation.invoiceNumber !== invoiceNumber) {
    return { success: false }
  }
  
  await redis.set(reservationKey, JSON.stringify({
    ...reservation,
    confirmedAt: Date.now(),
    erpInvoiceId,
  }), { ex: 3600 })
  
  await redis.set(confirmedKey, JSON.stringify({
    erpInvoiceId: erpInvoiceId || null,
    confirmedAt: Date.now(),
  }), { ex: 86400 * 30 })
  
  return { success: true }
}

export async function releasePendingReservations(tenantId: string): Promise<number> {
  const redis = getRedis()
  const keys = await redis.keys(`invoice_reserve:${tenantId}:*`)
  
  let released = 0
  const now = Date.now()
  
  for (const key of keys) {
    const reservation = await redis.get<ReservationState>(key)
    
    if (reservation && !reservation.confirmedAt) {
      const age = now - reservation.reservedAt
      
      if (age > RESERVATION_TIMEOUT_MS) {
        await redis.del(key)
        released++
      }
    }
  }
  
  return released
}

export async function isInvoiceNumberConfirmed(
  tenantId: string,
  invoiceNumber: string
): Promise<string | null> {
  const redis = getRedis()
  const confirmed = await redis.get<{ erpInvoiceId: string }>(
    `invoice_confirmed:${tenantId}:${invoiceNumber}`
  )
  return confirmed?.erpInvoiceId || null
}

export async function getPendingReservations(tenantId: string): Promise<ReservationState[]> {
  const redis = getRedis()
  const keys = await redis.keys(`invoice_reserve:${tenantId}:*`)
  
  const pending: ReservationState[] = []
  
  for (const key of keys) {
    const reservation = await redis.get<ReservationState>(key)
    if (reservation && !reservation.confirmedAt) {
      pending.push(reservation)
    }
  }
  
  return pending
}

export async function cleanupExpiredReservations(): Promise<number> {
  const redis = getRedis()
  const keys = await redis.keys('invoice_reserve:*')
  
  let cleaned = 0
  const now = Date.now()
  
  for (const key of keys) {
    const reservation = await redis.get<ReservationState>(key)
    
    if (reservation && !reservation.confirmedAt) {
      const age = now - reservation.reservedAt
      
      if (age > RESERVATION_TIMEOUT_MS) {
        await redis.del(key)
        cleaned++
      }
    }
  }
  
  return cleaned
}

setInterval(async () => {
  try {
    const cleaned = await cleanupExpiredReservations()
    if (cleaned > 0) {
      console.log(`[Reservation] Cleaned ${cleaned} expired reservations`)
    }
  } catch (error) {
    console.error('[Reservation] Cleanup error:', error)
  }
}, RESERVATION_GC_INTERVAL_MS)