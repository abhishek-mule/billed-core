import Redis from 'ioredis'

export const redisUrl = process.env.UPSTASH_REDIS_URL || ''

export function createRedisConnection(): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
  })
}
