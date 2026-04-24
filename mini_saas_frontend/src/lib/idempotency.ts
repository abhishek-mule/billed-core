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

const IDEMPOTENCY_TTL = 86400

export interface IdempotencyResult<T> {
  isNew: boolean
  result?: T
}

export async function checkIdempotency<T>(
  tenantId: string,
  key: string,
  operation: string
): Promise<IdempotencyResult<T> | null> {
  const redis = getRedis()
  const idemKey = `idempotency:${tenantId}:${operation}:${key}`
  
  const existing = await redis.get<T>(idemKey)
  
  if (existing) {
    return { isNew: false, result: existing }
  }
  
  return null
}

export async function setIdempotency<T>(
  tenantId: string,
  key: string,
  operation: string,
  result: T
): Promise<void> {
  const redis = getRedis()
  const idemKey = `idempotency:${tenantId}:${operation}:${key}`
  
  await redis.set(idemKey, JSON.stringify(result), { ex: IDEMPOTENCY_TTL })
}

export async function withIdempotency<T>(
  tenantId: string,
  idempotencyKey: string,
  operation: string,
  handler: () => Promise<T>
): Promise<T> {
  const cached = await checkIdempotency<T>(tenantId, idempotencyKey, operation)
  
  if (cached && cached.result) {
    return cached.result
  }
  
  const result = await handler()
  await setIdempotency(tenantId, idempotencyKey, operation, result)
  return result
}

export const IDEMPOTENT_OPERATIONS = {
  createInvoice: 'create_invoice',
  deleteInvoice: 'delete_invoice',
  recordPayment: 'record_payment',
  updateStock: 'update_stock',
  sendWhatsapp: 'send_whatsapp',
} as const