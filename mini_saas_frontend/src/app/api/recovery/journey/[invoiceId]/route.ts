import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildRecoveryTimeline } from '@billzo/shared'
import type { TimelineBuilderInput, RawCollectionAction, RawWhatsAppEvent, RawInvoice } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params

  const auth = await verifyRequest(_request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!

  try {
    // Fetch invoice
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('id, status, total, outstanding_amount, due_date, created_at, updated_at, customer_id')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Fetch customer name
    let customerName: string | undefined
    if (invoice.customer_id) {
      const { data: cust } = await supabaseAdmin
        .from('customers')
        .select('customer_name')
        .eq('id', invoice.customer_id)
        .maybeSingle()
      customerName = cust?.customer_name
    }

    // Fetch collection actions
    const { data: collectionActions } = await supabaseAdmin
      .from('collection_actions')
      .select('*')
      .contains('invoice_ids', [invoiceId])
      .order('created_at', { ascending: true })

    // Fetch whatsapp events
    const { data: whatsappEvents } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, status, direction, provider, message_type, occurred_at, created_at, metadata')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .order('occurred_at', { ascending: true })

    // Build timeline using shared domain logic
    const input: TimelineBuilderInput = {
      invoice: invoice as RawInvoice,
      collectionActions: (collectionActions || []) as RawCollectionAction[],
      whatsappEvents: (whatsappEvents || []) as RawWhatsAppEvent[],
    }

    const timeline = buildRecoveryTimeline(input)

    return NextResponse.json({
      ...timeline,
      customerName: customerName || timeline.customerName,
    })
  } catch (err: any) {
    console.error('[RecoveryJourney] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
