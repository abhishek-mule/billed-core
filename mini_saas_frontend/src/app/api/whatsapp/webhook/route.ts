import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { emitWhatsAppStatusUpdated } from '@/lib/billzo/events'
import { generateEventSequence } from '@billzo/shared'
import type { WhatsAppStatus } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

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
    const { phone, status: rawStatus, messageId, error, id } = body
    const providerMessageId = messageId || id

    if (!providerMessageId) {
      return NextResponse.json({ status: 'ok' })
    }

    // Sanitize: only allow safe characters to prevent filter injection
    const safeId = String(providerMessageId).replace(/[^a-zA-Z0-9_\-\.]/g, '')

    const parsedStatus = parseGupshupStatus(rawStatus || '')
    const now = new Date().toISOString()

    // Find the canonical billzo_message_id for this message
    const { data: existing } = await supabaseAdmin
      .from('whatsapp_events')
      .select('billzo_message_id, invoice_id, tenant_id')
      .or(`provider_message_id.eq.${safeId},id.eq.${safeId}`)
      .limit(1)

    if (!existing || existing.length === 0) {
      console.log('[WhatsAppWebhook] No existing event found, storing as new message')
      // Store a new message row with the webhook status
      const billzoMessageId = `webhook_${providerMessageId}`
      const { data: newEvent } = await supabaseAdmin
        .from('whatsapp_events')
        .insert({
          id: crypto.randomUUID(),
          billzo_message_id: billzoMessageId,
          event_sequence: Number(generateEventSequence()),
          status: parsedStatus,
          occurred_at: now,
          created_at: now,
          provider_message_id: safeId,
          provider: 'gupshup',
          direction: 'inbound',
          event_layer: 'transport',
          sync_status: 'synced',
          error: error || null,
        })
        .select('id, invoice_id, tenant_id')
        .single()

      if (newEvent) {
        await emitWhatsAppStatusUpdated({
          eventId: newEvent.id,
          billzoMessageId,
          invoiceId: newEvent.invoice_id,
          tenantId: newEvent.tenant_id,
          status: parsedStatus,
          provider: 'gupshup',
          providerMessageId,
          timestamp: now,
        })
      }

      return NextResponse.json({ status: 'ok' })
    }

    const { billzo_message_id, invoice_id, tenant_id } = existing[0]

    // Insert a new event row (append-only)
    const { data: newEvent } = await supabaseAdmin
      .from('whatsapp_events')
      .insert({
        id: crypto.randomUUID(),
        billzo_message_id,
        event_sequence: Number(generateEventSequence()),
        status: parsedStatus,
        occurred_at: now,
        created_at: now,
        invoice_id,
        tenant_id,
        provider: 'gupshup',
        provider_message_id: providerMessageId,
        direction: 'outbound',
        event_layer: 'transport',
        sync_status: 'synced',
        error: error || null,
      })
      .select('id')
      .single()

    if (newEvent) {
      await emitWhatsAppStatusUpdated({
        eventId: newEvent.id,
        billzoMessageId: billzo_message_id,
        invoiceId: invoice_id,
        tenantId: tenant_id,
        status: parsedStatus,
        provider: 'gupshup',
        providerMessageId,
        timestamp: now,
      })
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err: any) {
    console.error('[WhatsAppWebhook] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Webhook active' })
}
