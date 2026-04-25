import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { Pool } from 'pg'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

async function checkRedis(): Promise<'ok' | 'error' | 'not_configured'> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    return 'not_configured'
  }
  
  try {
    const redis = new Redis({ url, token })
    await redis.ping()
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkPostgres(): Promise<'ok' | 'error' | 'not_configured'> {
  if (!process.env.DATABASE_URL) {
    return 'not_configured'
  }
  
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('SELECT 1')
    await pool.end()
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkErpNext(): Promise<'ok' | 'error' | 'not_configured'> {
  if (!ERP_URL || ERP_URL === 'http://localhost') {
    return 'not_configured'
  }
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    
    const res = await fetch(`${ERP_URL}/api/method/ping`, {
      signal: controller.signal,
    }).catch(() => null)
    
    clearTimeout(timeout)
    return res?.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function GET() {
  const [redis, postgres, erpnext] = await Promise.all([
    checkRedis(),
    checkPostgres(),
    checkErpNext(),
  ])

  const healthy = redis === 'ok' && postgres === 'ok'
  const partiallyHealthy = redis === 'ok' || postgres === 'ok' || redis === 'not_configured' || postgres === 'not_configured'
  
  return NextResponse.json({
    status: healthy ? 'healthy' : partiallyHealthy ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      redis,
      postgres,
      erpnext,
    },
  }, {
    status: healthy ? 200 : 503,
  })
}