import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
})

export const redisUrl = process.env.UPSTASH_REDIS_REST_URL || ''
export const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || ''
