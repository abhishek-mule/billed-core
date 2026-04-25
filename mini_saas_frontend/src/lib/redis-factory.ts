import { Redis } from '@upstash/redis'

export interface IRedis {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: any, options?: { nx?: boolean; ex?: number }): Promise<any>
  del(key: string): Promise<any>
  keys(pattern: string): Promise<string[]>
}

export function getMemoryFallback(): IRedis {
  const store = new Map<string, any>()
  return {
    async get<T>(key: string): Promise<T | null> {
      const val = store.get(key)
      if (val === undefined) return null
      // Handle both stringified and raw values
      if (typeof val === 'string') {
        try {
          return JSON.parse(val) as T
        } catch {
          return val as unknown as T
        }
      }
      return val as T
    },
    async set(key: string, value: any, options?: { nx?: boolean; ex?: number }): Promise<any> {
      if (options?.nx && store.has(key)) return null
      store.set(key, value)
      return 'OK'
    },
    async del(key: string): Promise<any> {
      store.delete(key)
      return 1
    },
    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return Array.from(store.keys()).filter(k => regex.test(k))
    }
  }
}

export function createRedisClient(): IRedis {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    return getMemoryFallback()
  }
  
  return new Redis({ url, token }) as unknown as IRedis
}
