import Redis from 'ioredis'

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

export function createRedisConnection(): Redis {
  return new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
  })
}
