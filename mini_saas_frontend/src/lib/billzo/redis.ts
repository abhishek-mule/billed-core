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

export function createRedisClient(): Redis {
  if (client) return client
  client = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
    lazyConnect: true,
  })
  return client
}

export function createRedisSubscriber(): Redis {
  if (subscriber) return subscriber
  subscriber = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
    lazyConnect: true,
  })
  return subscriber
}
