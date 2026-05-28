import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyUpiToken } from '@/lib/billzo/crypto'
import { emitWhatsAppStatusUpdated } from '@/lib/billzo/events'
import { generateEventSequence } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const payload = verifyUpiToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 })
  }

  const { invoiceId, tenantId, amount, upiId } = payload

  const now = new Date().toISOString()

  // Find the latest billzo_message_id for this invoice
  const { data: latest } = await supabaseAdmin
    .from('whatsapp_events')
    .select('billzo_message_id')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .not('billzo_message_id', 'is', null)
    .order('event_sequence', { ascending: false })
    .limit(1)
    .single()

  const billzoMessageId = latest?.billzo_message_id || `upi_${invoiceId}`
  const eventId = crypto.randomUUID()

  await supabaseAdmin
    .from('whatsapp_events')
    .insert({
      id: eventId,
      billzo_message_id: billzoMessageId,
      event_sequence: Number(generateEventSequence()),
      status: 'clicked_upi',
      invoice_id: invoiceId,
      tenant_id: tenantId,
      provider: 'upi',
      direction: 'outbound',
      event_layer: 'behavioral',
      occurred_at: now,
      created_at: now,
      sync_status: 'synced',
    })

  await emitWhatsAppStatusUpdated({
    eventId,
    billzoMessageId,
    invoiceId,
    tenantId,
    status: 'clicked_upi',
    provider: 'upi',
    providerMessageId: null,
    timestamp: now,
  })

  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&am=${amount}&pn=${encodeURIComponent('BillZo')}`
  return NextResponse.redirect(upiUrl, 302)
}
