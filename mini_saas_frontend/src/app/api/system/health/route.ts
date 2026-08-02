export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export async function GET() {
  const checks: Record<string, any> = {}
  const start = Date.now()

  // Database
  try {
    const { count } = await supabaseAdmin
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    checks.database = count !== null
  } catch {
    checks.database = false
  }

  // Meta configuration
  checks.meta = {
    configured: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    tokenPresent: !!process.env.META_ACCESS_TOKEN,
  }

  // Worker queue depth
  try {
    const { count } = await supabaseAdmin
      .from('outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    checks.queue = { pending: count ?? 0 }
  } catch {
    checks.queue = { pending: -1 }
  }

  // Scheduler
  checks.scheduler = !!process.env.CRON_SECRET

  const uptime = Date.now() - start

  const unhealthy = !checks.database

  return NextResponse.json({
    status: unhealthy ? 'unhealthy' : 'healthy',
    ...checks,
    uptimeMs: uptime,
    timestamp: new Date().toISOString(),
  }, { status: unhealthy ? 503 : 200 })
}
