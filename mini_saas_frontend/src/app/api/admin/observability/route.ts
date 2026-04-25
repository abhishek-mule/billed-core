import { NextResponse } from 'next/server'
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

export async function GET() {
  const redis = await getRedis()
  const pg = await getPg()
  
  try {
    const [
      activeTenants,
      failedSyncs,
      totalInvoices,
      pendingReservations,
      retryAttempts,
      last24hInvoices,
    ] = await Promise.all([
      pg.query(`
        SELECT COUNT(*) as count FROM tenants 
        WHERE is_active = true AND created_at > NOW() - INTERVAL '7 days'
      `),
      redis.keys('erp_attempt:*'),
      pg.query(`SELECT COUNT(*) as count FROM invoices`),
      redis.keys('invoice_reserve:*'),
      redis.get('metrics:erp_errors:daily'),
      pg.query(`
        SELECT COUNT(*) as count FROM invoices 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `),
    ])

    const failedSyncInvoices: { tenantId: string; invoiceNumber: string; attempts: number }[] = []
    for (const key of failedSyncs.slice(0, 20)) {
      const attempt = await redis.get(key) as any
      if (attempt && attempt.status === 'FAILED') {
        failedSyncInvoices.push({
          tenantId: attempt.tenantId,
          invoiceNumber: attempt.invoiceNumber,
          attempts: attempt.attemptNumber,
        })
      }
    }

    const pendingReservationsList: { tenantId: string; invoiceNumber: string; age: number }[] = []
    for (const key of pendingReservations.slice(0, 20)) {
      const res = await redis.get(key) as any
      if (res && !res.confirmedAt) {
        pendingReservationsList.push({
          tenantId: key.split(':')[1],
          invoiceNumber: res.invoiceNumber,
          age: Date.now() - res.reservedAt,
        })
      }
    }

    const totalInvoicesCount = (totalInvoices as any).rows[0]?.count || 0
    const activeTenantsCount = (activeTenants as any).rows[0]?.count || 0
    const last24hCount = (last24hInvoices as any).rows[0]?.count || 0
    const retryAttemptsCount = (retryAttempts as any) || 0

    const syncSuccessRate = totalInvoicesCount > 0 
      ? Math.round(((parseInt(totalInvoicesCount) - failedSyncInvoices.length) / parseInt(totalInvoicesCount)) * 100)
      : 100

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      overview: {
        activeTenants: parseInt(activeTenantsCount),
        totalInvoices: parseInt(totalInvoicesCount),
        invoicesLast24h: parseInt(last24hCount),
        pendingReservations: pendingReservations.length,
        failedSyncs: failedSyncInvoices.length,
        retryAttemptsToday: retryAttemptsCount,
        syncSuccessRate,
      },
      alert:
        failedSyncInvoices.length > 10
          ? 'CRITICAL: High failed sync ratio'
          : pendingReservations.length > 20
          ? 'WARNING: Many pending reservations'
          : retryAttemptsCount > 100
          ? 'WARNING: High retry volume'
          : null,
      failedSyncs: failedSyncInvoices.slice(0, 10),
      pendingReservations: pendingReservationsList.slice(0, 10),
    })
  } finally {
    await pg.end()
  }
}