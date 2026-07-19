export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { runRecoveryScheduler, drainRecoveryOutbox } from '@/lib/recovery/scheduler'

/**
 * Recovery Scheduler cron — invoked every 5 minutes by an external scheduler.
 *
 * Duties (orchestration ONLY — no policy logic, no transport):
 *   1. Dispatch due collection_actions (emit domain events, mark in_progress).
 *   2. Drain the emitted recovery outbox events (handed to transport workers).
 *
 * Backfill is intentionally NOT here — it's an admin/repair tool
 * (/api/admin/recovery/backfill). Production relies on event wiring
 * (invoice.created / promise.made / payment.completed), not backfill.
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sched = await runRecoveryScheduler(200)
    const drained = await drainRecoveryOutbox(200)

    return NextResponse.json({
      ok: true,
      due: sched.due,
      dispatched: sched.dispatched,
      skipped: sched.skipped,
      errors: sched.errors,
      drained,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[RecoveryScheduler] cron failed', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'unknown' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

