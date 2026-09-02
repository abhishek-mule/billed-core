import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyUpiToken } from '@/lib/billzo/crypto'
import { emitWhatsAppStatusUpdated } from '@/lib/billzo/events'
import { generateEventSequence } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    const payload = verifyUpiToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 400 })
    }

    const { invoiceId, tenantId, amount, upiId } = payload

    if (!upiId) {
      return NextResponse.json({ error: 'Payment link is misconfigured — missing UPI ID' }, { status: 400 })
    }

    const now = new Date().toISOString()

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('customer_id')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const customerId = invoice?.customer_id || null

    // Canonical recovery attempt — created BEFORE the behavior event so the
    // causal spine is intact regardless of downstream consumers. The click is
    // a recovery attempt by the customer against this invoice.
    const attemptId = `CA_${crypto.randomUUID()}`
    await supabaseAdmin.from('collection_actions').insert({
      id: attemptId,
      tenant_id: tenantId,
      customer_id: customerId,
      invoice_ids: [invoiceId],
      action_type: 'payment_request',
      status: 'in_progress',
      source: 'customer',
      provider: 'upi',
      amount,
      reason: 'Customer clicked UPI payment link',
      priority: 5,
      created_at: now,
      updated_at: now,
    }).maybeSingle()

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
        customer_id: customerId,
        recovery_attempt_id: attemptId,
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

    // The click itself is now recorded — finalize the attempt.
    await supabaseAdmin.from('collection_actions').update({
      status: 'completed',
      completed_at: now,
      updated_at: now,
    }).eq('id', attemptId)

    return NextResponse.redirect(new URL(`/pay/checkout?token=${token}`, _request.url), 302)
  } catch (err) {
    console.error('[PayToken] Error processing payment link:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again or contact support.' },
      { status: 500 },
    )
  }
}
