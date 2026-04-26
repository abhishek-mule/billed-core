import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { Redis } from '@upstash/redis'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'

async function getRedis(): Promise<Redis | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    return null
  }
  
  return new Redis({ url, token })
}

async function getPg() {
  if (!process.env.DATABASE_URL) {
    return null
  }
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  
  if (!session || session.role !== 'owner') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tenantId } = session
  const redis = await getRedis()
  const pg = await getPg()
  
  if (!pg) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tenantId,
      metrics: {
        totalInvoices: 0,
        invoicesLast30d: 0,
        failedSyncs: 0,
        totalCustomers: 0,
        averageLatencyMs: 0,
      },
      erpStatus: {
        circuitOpen: false,
        recentFailures: 0,
      },
      alerts: ['Database not configured'],
    })
  }
  
  try {
    const [totalInvoices, last30dInvoices, totalCustomers] = await Promise.all([
      pg.query(`SELECT COUNT(*) as count FROM invoices WHERE tenant_id = $1`, [tenantId]),
      pg.query(`SELECT COUNT(*) as count FROM invoices WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`, [tenantId]),
      pg.query(`SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1`, [tenantId]),
    ])

    let failedSyncInvoices: { invoiceNumber: string; attempts: number; error: string }[] = []
    let circuitOpen = false
    let avgLatency = 0

    if (redis) {
      const failedSyncs = await redis.keys(`erp_attempt:${tenantId}:*`)
      for (const key of failedSyncs.slice(0, 20)) {
        const attempt = await redis.get(key) as any
        if (attempt && attempt.status === 'FAILED') {
          failedSyncInvoices.push({
            invoiceNumber: attempt.invoiceNumber,
            attempts: attempt.attemptNumber,
            error: attempt.error,
          })
        }
      }

      const syncStatus = await redis.get(`circuit:${tenantId}`) as any
      circuitOpen = syncStatus && syncStatus.isOpen

      const averageLatency = await redis.get(`latency:invoices:${tenantId}`) as any
      if (averageLatency) {
        avgLatency = Math.round(parseInt(averageLatency) / 100) / 10
      }
    }

    const totalCount = totalInvoices.rows[0]?.count || 0
    const last30dCount = last30dInvoices.rows[0]?.count || 0

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tenantId,
      metrics: {
        totalInvoices: parseInt(totalCount),
        invoicesLast30d: parseInt(last30dCount),
        failedSyncs: failedSyncInvoices.length,
        totalCustomers: totalCustomers.rows[0]?.count || 0,
        averageLatencyMs: avgLatency,
      },
      erpStatus: {
        circuitOpen,
        recentFailures: failedSyncInvoices.length,
      },
      alerts: [
        circuitOpen ? 'ERP circuit breaker open - sync disabled' : null,
        failedSyncInvoices.length > 5 ? 'Multiple failed syncs - manual intervention needed' : null,
      ].filter(Boolean),
    })
  } finally {
    await pg.end()
  }
}