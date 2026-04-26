import { NextResponse } from 'next/server'
import { getRedis } from '@/lib/queue'
import { getCircuitBreakerStats, resetAllCircuits } from '@/lib/circuits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const redis = getRedis()

  const circuitStats = getCircuitBreakerStats()

  let redisStatus = 'disconnected'
  let redisLatency = 0
  
  if (redis) {
    try {
      const start = Date.now()
      await redis.ping()
      redisLatency = Date.now() - start
      redisStatus = 'connected'
    } catch {
      redisStatus = 'error'
    }
  }

  const health = {
    timestamp: new Date().toISOString(),
    status: redisStatus === 'connected' ? 'healthy' : 'degraded',
    services: {
      redis: {
        status: redisStatus,
        latencyMs: redisLatency,
      },
      circuits: {
        status: Object.values(circuitStats).every(c => c.state === 'CLOSED') ? 'healthy' : 'degraded',
        circuits: circuitStats,
      },
    },
  }

  const statusCode = health.status === 'healthy' ? 200 : 503

  return NextResponse.json(health, { status: statusCode })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    if (body.action === 'reset-circuits') {
      resetAllCircuits()
      return NextResponse.json({ success: true, message: 'All circuits reset' })
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}