import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { Pool } from 'pg'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

async function checkRedis(): Promise<'ok' | 'error'> {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    await redis.ping()
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkPostgres(): Promise<'ok' | 'error'> {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('SELECT 1')
    await pool.end()
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkErpNext(): Promise<'ok' | 'error'> {
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

  const allOk = redis === 'ok' && postgres === 'ok'
  
  return NextResponse.json({
    status: allOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      redis,
      postgres,
      erpnext,
    },
  }, {
    status: allOk ? 200 : 503,
  })
}