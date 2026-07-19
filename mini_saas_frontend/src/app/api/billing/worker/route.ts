export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { drainBillingOutbox } from '@/lib/billzo/billing-worker'

/**
 * Drains billing outbox events (usage increments + subscription state changes).
 * Invoked by a scheduler (cron / cron-job) or manually. Protected by a shared
 * secret header so it cannot be triggered by unauthenticated callers.
 */
export async function POST(request: Request) {
  const secret = request.headers.get('x-billing-worker-key')
  const expected = process.env.BILLING_WORKER_KEY
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const processed = await drainBillingOutbox(100)
    return NextResponse.json({ ok: true, processed })
  } catch (err: any) {
    console.error('[BillingWorker] drain failed', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
