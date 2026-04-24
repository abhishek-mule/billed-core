import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

export const METRIC_RETENTION = {
  daily: { keepDays: 30 },
  weekly: { keepWeeks: 12 },
}

export async function getMetricKey(name: string, type: 'daily' | 'weekly'): Promise<string> {
  const now = new Date()
  
  if (type === 'daily') {
    return `metrics:daily:${name}:${now.toISOString().split('T')[0]}`
  }
  
  const week = getWeekNumber(now)
  return `metrics:weekly:${name}:${now.getFullYear()}-W${week}`
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export async function ensureMetricRetention(): Promise<void> {
  const redis = getRedis()
  const now = new Date()
  
  if (now.getDate() === 1 && now.getHours() === 0) {
    await rotateWeeklyMetrics()
  }
}

export async function rotateWeeklyMetrics(): Promise<void> {
  const redis = getRedis()
  const keys = await redis.keys('metrics:weekly:*')
  
  let deleted = 0
  const cutoffWeek = getWeekNumber(new Date(Date.now() - METRIC_RETENTION.weekly.keepWeeks * 7 * 24 * 60 * 60 * 1000))
  
  for (const key of keys) {
    const weekStr = key.split(':').pop() || ''
    const week = parseInt(weekStr.split('-W')[1] || '0')
    
    if (week < cutoffWeek) {
      await redis.del(key)
      deleted++
    }
  }
  
  console.log(`[Metrics] Weekly rotation: deleted ${deleted} old metrics`)
}

export async function aggregateDailyToWeekly(name: string): Promise<void> {
  const redis = getRedis()
  let total = 0
  
  for (let i = 0; i < 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const value = await redis.get<number>(`metrics:daily:${name}:${dateStr}`)
    total += value || 0
  }
  
  const now = new Date()
  const week = getWeekNumber(now)
  await redis.set(`metrics:weekly:${name}:${now.getFullYear()}-W${week}`, total)
}

export interface RetentionStats {
  dailyMetricsCount: number
  weeklyMetricsCount: number
  oldestDailyMetric: string | null
  oldestWeeklyMetric: string | null
}

export async function getRetentionStats(): Promise<RetentionStats> {
  const redis = getRedis()
  const dailyKeys = await redis.keys('metrics:daily:*')
  const weeklyKeys = await redis.keys('metrics:weekly:*')
  
  let oldestDaily = dailyKeys[0] || null
  let oldestWeekly = weeklyKeys[0] || null
  
  return {
    dailyMetricsCount: dailyKeys.length,
    weeklyMetricsCount: weeklyKeys.length,
    oldestDailyMetric: oldestDaily,
    oldestWeeklyMetric: oldestWeekly,
  }
}