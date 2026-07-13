import Redis, { type RedisOptions } from 'ioredis'

function getRedisUrl(): string {
  // Debug: log all candidate env vars
  const debugVars: Record<string, string | undefined> = {
    UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? '<set>' : undefined,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD ? '<set>' : undefined,
    REDIS_URL: process.env.REDIS_URL,
  }
  console.log('[redis] getRedisUrl env:', JSON.stringify(debugVars))

  // Priority 1: Railway Redis (unlimited, worker runs alongside it)
  const railwayHost = process.env.REDIS_HOST
  const railwayPort = process.env.REDIS_PORT
  const railwayPassword = process.env.REDIS_PASSWORD
  
  if (railwayHost && railwayPort && railwayPassword) {
    const url = `redis://:${railwayPassword}@${railwayHost}:${railwayPort}`
    console.log('[redis] using Railway Redis')
    return url
  }

  // Priority 2: Railway Redis URL (if available)
  if (process.env.REDIS_URL) {
    console.log('[redis] using REDIS_URL')
    return process.env.REDIS_URL
  }

  // Priority 3: Upstash Redis (fallback for local dev / Vercel)
  const upstashUrl = process.env.UPSTASH_REDIS_URL
  if (upstashUrl) {
    console.log('[redis] using UPSTASH_REDIS_URL')
    return upstashUrl
  }
  
  const restUrl = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (restUrl && token) {
    const host = restUrl.replace(/^https?:\/\//, '')
    const url = `rediss://default:${token}@${host}:6379`
    console.log('[redis] using Upstash REST fallback')
    return url
  }

  console.warn('[redis] NO REDIS URL FOUND — returning empty')
  return ''
}

function makeRedis(overrides: Partial<RedisOptions> = {}): Redis {
  const url = getRedisUrl()
  const isTls = url.startsWith('rediss://')
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTls ? { tls: {} } : {}),
    ...overrides,
  })
}

let _sharedRedis: Redis | null = null

export function getRedis(): Redis {
  if (!_sharedRedis) {
    _sharedRedis = makeRedis({ lazyConnect: true })
    _sharedRedis.on('error', (err) => {
      console.error('[redis] Shared connection error:', err.message)
    })
  }
  return _sharedRedis
}

export function createRedisConnection(): Redis {
  return makeRedis()
}

