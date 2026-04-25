import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    return null
  }
  
  if (!redis) {
    redis = new Redis({ url, token })
  }
  return redis
}

const IP_WINDOW_MS = 300000
const IP_THRESHOLD = 3

export async function recordSessionIp(
  sessionId: string,
  tenantId: string,
  ip: string
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  
  const key = `session_ips:${sessionId}`
  const now = Date.now()
  
  const ips = await redis.get<string[]>(key) || []
  const recent = ips.filter(i => i && i.includes(':') && now - parseInt(i.split(':')[0]) < IP_WINDOW_MS)
  
  const newEntry = `${now}:${ip}`
  recent.push(newEntry)
  
  await redis.set(key, recent, { ex: 3600 })
}

export async function detectSessionAnomaly(
  sessionId: string,
  newIp: string
): Promise<{ isAnomaly: boolean; previousIps?: string[] }> {
  const redis = getRedis()
  if (!redis) return { isAnomaly: false }
  
  const key = `session_ips:${sessionId}`
  
  const ips = await redis.get<string[]>(key) || []
  const now = Date.now()
  const recent = ips.filter(i => i && i.includes(':') && now - parseInt(i.split(':')[0]) < IP_WINDOW_MS)

  if (recent.length === 0) return { isAnomaly: false }
  
  const uniqueIps = new Set(recent.map(i => i.split(':')[1]))
  const hasAnomaly = uniqueIps.size > IP_THRESHOLD
  
  return {
    isAnomaly: hasAnomaly,
    previousIps: Array.from(uniqueIps),
  }
}

export async function destroySessionOnAnomaly(sessionId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  
  await redis.del(`session:${sessionId}`)
  await redis.del(`session_ips:${sessionId}`)
}