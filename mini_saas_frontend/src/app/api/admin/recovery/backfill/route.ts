export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { backfillUnplanned } from '@/lib/recovery/planner'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Admin/repair tool ONLY. NOT part of the production scheduler.
 * Backfills collection_actions for open invoices that were never planned
 * (e.g. after a missed event or a migration). Protected by CRON_SECRET.
 *
 * Query: ?tenantId=xxx (single tenant) or none (all tenants, capped).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tenantId = request.nextUrl.searchParams.get('tenantId')
    let total = 0
    if (tenantId) {
      total = await backfillUnplanned(tenantId, 500)
    } else {
      const { data: tenants } = await supabaseAdmin.from('tenants').select('id').limit(500)
      for (const t of tenants || []) {
        total += await backfillUnplanned(t.id, 200)
      }
    }
    return NextResponse.json({ ok: true, backfilled: total })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
