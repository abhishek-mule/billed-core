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
  throw new Error('UPSTASH_REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN not configured')
}

const REDIS_URL = getRedisUrl()
const IS_TLS = REDIS_URL.startsWith('rediss://')

const REDIS_OPTIONS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 5000,
  retryStrategy: (times: number) => (times > 3 ? null : 1000),
  ...(IS_TLS ? { tls: {} } : {}),
} as const

export function createRedisClient(): Redis {
  if (client) return client
  client = new Redis(REDIS_URL, REDIS_OPTIONS)
  return client
}

export function createRedisSubscriber(): Redis {
  if (subscriber) return subscriber
  subscriber = new Redis(REDIS_URL, REDIS_OPTIONS)
  return subscriber
}
