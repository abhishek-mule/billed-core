import Redis from 'ioredis'

let client: Redis | null = null
let subscriber: Redis | null = null

export function createRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_URL
  if (!url) {
    throw new Error('UPSTASH_REDIS_URL not configured')
  }
  if (client) return client
  client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
    lazyConnect: true,
  })
  return client
}

export function createRedisSubscriber(): Redis {
  const url = process.env.UPSTASH_REDIS_URL
  if (!url) {
    throw new Error('UPSTASH_REDIS_URL not configured')
  }
  if (subscriber) return subscriber
  subscriber = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
    lazyConnect: true,
  })
  return subscriber
}
