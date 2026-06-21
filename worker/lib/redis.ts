import Redis, { type RedisOptions } from 'ioredis'

function getRedisUrl(): string {
  const url = process.env.UPSTASH_REDIS_URL
  if (url) return url
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
