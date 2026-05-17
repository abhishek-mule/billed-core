import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import type { WhatsAppStatus } from '@/lib/billzo/types'

function parseGupshupStatus(status: string): WhatsAppStatus {
  switch (status?.toLowerCase()) {
    case 'delivered': return 'delivered'
    case 'read': return 'read'
    case 'sent': return 'sent'
    case 'failed': return 'failed'
    default: return 'sent'
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[WhatsAppWebhook] Received:', JSON.stringify(body))

    const { phone, status: rawStatus, messageId, error, id } = body
    const eventId = messageId || id

    if (!eventId && !phone) {
      return NextResponse.json({ status: 'ok' })
    }

    const parsedStatus = parseGupshupStatus(rawStatus || '')

    const events = await db().whatsappEvents
      .where('id').equals(eventId || '')
      .toArray()

    if (events.length > 0) {
      const event = events[0]
      const updatedStatus = parsedStatus === 'read' ? 'read' : parsedStatus
      await db().whatsappEvents.update(event.id, { status: updatedStatus })

      if (event.invoiceId) {
        await db().invoices.update(event.invoiceId, {
          lastWhatsAppStatus: updatedStatus,
          syncStatus: 'synced',
        })
      }
    }

    if (parsedStatus === 'failed' && eventId) {
      console.warn(`[WhatsAppWebhook] Message failed: ${eventId} — ${error || 'unknown error'}`)
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err: any) {
    console.error('[WhatsAppWebhook] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'Webhook active' })
}