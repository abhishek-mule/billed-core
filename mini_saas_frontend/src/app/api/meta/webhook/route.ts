import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'billzo_meta_verify_2024'

// GET — Webhook verification (Meta sends this during setup)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[MetaWebhook] Verified successfully')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[MetaWebhook] Verification failed', { mode, token })
  return new NextResponse('Verification failed', { status: 403 })
}

// POST — Incoming messages and status updates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entries = body?.entry

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json({ status: 'ok' })
    }

    for (const entry of entries) {
      const changes = entry?.changes || []
      for (const change of changes) {
        const value = change?.value
        if (!value) continue

        const phoneNumberId = value.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Process status updates
        const statuses = value.statuses || []
        for (const status of statuses) {
          await handleStatusUpdate(phoneNumberId, status)
        }

        // Process inbound messages
        const messages = value.messages || []
        for (const msg of messages) {
          await handleInboundMessage(phoneNumberId, msg)
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err: any) {
    console.error('[MetaWebhook] Error:', err.message)
    return NextResponse.json({ status: 'ok' }) // Always return 200 to Meta
  }
}

async function handleStatusUpdate(phoneNumberId: string, status: any) {
  const { error } = await supabaseAdmin
    .from('whatsapp_events')
    .upsert({
      id: status.id,
      provider_message_id: status.id,
      status: mapMetaStatus(status.status),
      recipient_id: status.recipient_id,
      occurred_at: new Date(Number(status.timestamp) * 1000).toISOString(),
      errors: status.errors ? JSON.stringify(status.errors) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_message_id' })

  if (error) {
    console.error('[MetaWebhook] Failed to record status:', error.message)
  }
}

async function handleInboundMessage(phoneNumberId: string, msg: any) {
  const { error } = await supabaseAdmin
    .from('whatsapp_events')
    .insert({
      provider_message_id: msg.id,
      from_number: msg.from,
      message_type: msg.type || 'unknown',
      message_body: msg.text?.body || null,
      direction: 'inbound',
      status: 'received',
      occurred_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
      created_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[MetaWebhook] Failed to record inbound:', error.message)
  }
}

function mapMetaStatus(status: string): string {
  switch (status) {
    case 'sent': return 'sent'
    case 'delivered': return 'delivered'
    case 'read': return 'read'
    case 'failed': return 'failed'
    case 'pending': return 'pending'
    case 'warning': return 'warning'
    default: return status
  }
}
