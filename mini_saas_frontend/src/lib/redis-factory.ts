import { Redis } from '@upstash/redis'

export interface IRedis {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: any, options?: { nx?: boolean; ex?: number }): Promise<any>
  del(key: string): Promise<any>
  keys(pattern: string): Promise<string[]>
}

export function createRedisClient(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    throw new Error('REDIS_UNAVAILABLE: Connection configuration missing.')
  }
  
  return new Redis({ url, token })
}
