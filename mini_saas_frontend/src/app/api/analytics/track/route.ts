export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import type { BillingEvent } from '@/lib/billzo/analytics'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const events: BillingEvent[] = body.events || []

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ success: true, tracked: 0 })
    }

    for (const event of events) {
      await db().queue.add({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tenantId: event.tenantId,
        entity: 'tenant',
        entityId: event.tenantId,
        action: 'upsert' as any,
        payload: {
          event: event.event,
          properties: event.properties,
          userId: event.userId,
          timestamp: event.timestamp,
          source: 'analytics',
        },
        status: 'pending' as any,
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any)
    }

    return NextResponse.json({ success: true, tracked: events.length })
  } catch (error) {
    console.error('[Analytics] Track error:', error)
    return NextResponse.json({ error: 'Failed to track events' }, { status: 500 })
  }
}