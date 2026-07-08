import Redis, { type RedisOptions } from 'ioredis'

function getRedisUrl(): string {
  // Priority 1: Railway Redis (from reference variables)
  const railwayHost = process.env.REDIS_HOST
  const railwayPort = process.env.REDIS_PORT
  const railwayPassword = process.env.REDIS_PASSWORD
  
  if (railwayHost && railwayPort && railwayPassword) {
    return `redis://:${railwayPassword}@${railwayHost}:${railwayPort}`
  }

  // Priority 2: Railway Redis URL (if available)
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL
  }

  // Priority 3: Upstash Redis (fallback)
  const upstashUrl = process.env.UPSTASH_REDIS_URL
  if (upstashUrl) return upstashUrl
  
  const restUrl = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (restUrl && token) {
    const host = restUrl.replace(/^https?:\/\//, '')
    return `rediss://default:${token}@${host}:6379`
  }
  
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

