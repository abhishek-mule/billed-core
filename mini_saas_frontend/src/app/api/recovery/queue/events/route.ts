import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

const VALID_EVENTS = new Set([
  'VIEW_QUEUE',
  'SEND_REMINDER',
  'MARK_PROMISE',
  'RECORD_PAYMENT',
  'OPEN_HISTORY',
  'QUEUE_COMPLETED',
])

const REASON_LABELS: Record<string, string> = {
  VIEW_QUEUE: 'Merchant viewed the recovery queue',
  SEND_REMINDER: 'Merchant triggered a reminder',
  MARK_PROMISE: 'Merchant recorded a promise to pay',
  RECORD_PAYMENT: 'Merchant recorded a payment',
  OPEN_HISTORY: 'Merchant viewed case history',
  QUEUE_COMPLETED: 'Merchant completed all queue actions',
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const body = await request.json()
    const { eventType, customerId, metadata } = body as {
      eventType: string
      customerId?: string
      metadata?: Record<string, unknown>
    }

    if (!eventType || !VALID_EVENTS.has(eventType)) {
      return NextResponse.json({ error: `Invalid event type: ${eventType}` }, { status: 400 })
    }

    const caseId = ((metadata?.caseId as string) || '').trim()
    if (!caseId) {
      // Queue-level events (VIEW_QUEUE, QUEUE_COMPLETED) without a case — skip
      return NextResponse.json({ success: true })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { error } = await supabase.from('recovery_case_events').insert({
      case_id: caseId,
      event_type: eventType,
      reason: REASON_LABELS[eventType] || `Queue event: ${eventType}`,
      trigger: metadata || {},
    })

    if (error) {
      console.error('[QueueEvents] Insert error:', error)
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[QueueEvents] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
