import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { Redis } from '@upstash/redis'
import { Pool } from 'pg'

async function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

async function getPg() {
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  
  if (!session || session.role !== 'owner') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tenantId } = session
  const redis = await getRedis()
  const pg = getPg()
  
  try {
    const [
      totalInvoices,
      last30dInvoices,
      failedSyncs,
      totalCustomers,
      averageLatency,
    ] = await Promise.all([
      pg.query(`
        SELECT COUNT(*) as count FROM invoices WHERE tenant_id = $1
      `, [tenantId]),
      pg.query(`
        SELECT COUNT(*) as count FROM invoices 
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
      `, [tenantId]),
      redis.keys(`erp_attempt:${tenantId}:*`),
      pg.query(`SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1`, [tenantId]),
      redis.get(`latency:invoices:${tenantId}`),
    ])

    const failedSyncInvoices: { invoiceNumber: string; attempts: number; error: string }[] = []
    for (const key of failedSyncs.slice(0, 20)) {
      const attempt = await redis.get(key)
      if (attempt && typeof attempt !== 'string' && attempt.status === 'FAILED') {
        failedSyncInvoices.push({
          invoiceNumber: attempt.invoiceNumber,
          attempts: attempt.attemptNumber,
          error: attempt.error,
        })
      }
    }

    const syncStatus = await redis.get(`circuit:${tenantId}`)
    const circuitOpen = syncStatus && typeof syncStatus !== 'string' && syncStatus.isOpen

    const avgLatency = averageLatency 
      ? Math.round(parseInt(averageLatency) / 100) / 10 
      : 0

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
        circuitOpen: circuitOpen || false,
        recentFailures: failedSyncInvoices.length,
      },
      alerts: [
        circuitOpen ? 'ERP circuit breaker open - sync disabled' : null,
        failedSyncInvoices.length > 5 ? 'Multiple failed syncs - manual intervention needed' : null,
      ].filter(Boolean),
    })
  } finally {
    pg.end()
  }
}