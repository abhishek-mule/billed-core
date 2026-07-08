import Redis from 'ioredis'

let client: Redis | null = null
let subscriber: Redis | null = null

function getRedisUrl(): string {
  const url = process.env.UPSTASH_REDIS_URL
  if (url) return url
  const restUrl = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (restUrl && token) {
    const host = restUrl.replace(/^https?:\/\//, '')
    return `rediss://default:${token}@${host}:6379`
  }
  const host = process.env.REDIS_HOST
  const port = process.env.REDIS_PORT || '6379'
  const password = process.env.REDIS_PASSWORD
  if (host) {
    return password
      ? `rediss://default:${encodeURIComponent(password)}@${host}:${port}`
      : `redis://${host}:${port}`
  }
  throw new Error('UPSTASH_REDIS_URL or REDIS_HOST not configured')
}

function getRedisOptions() {
  const url = getRedisUrl()
  const isTls = url.startsWith('rediss://')
  return {
    url,
    opts: {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: (times: number) => (times > 3 ? null : 1000),
      ...(isTls ? { tls: {} } : {}),
    } as const,
  }
}

export function createRedisClient(): Redis {
  if (client) return client
  const { url, opts } = getRedisOptions()
  client = new Redis(url, opts)
  return client
}

export function createRedisSubscriber(): Redis {
  if (subscriber) return subscriber
  const { url, opts } = getRedisOptions()
  subscriber = new Redis(url, opts)
  return subscriber
}
