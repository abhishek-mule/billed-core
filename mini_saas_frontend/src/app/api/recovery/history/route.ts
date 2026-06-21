import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const limit = 50
  const offset = (page - 1) * limit

  try {
    let query = supabaseAdmin
      .from('whatsapp_events')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .or(`reminder_stage.not.is.null,message_type.ilike.%reminder%,message_origin.eq.automation`)
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: events, count, error } = await query
    if (error) throw error

    const customerIds = [...new Set((events || []).map(e => e.customer_id).filter(Boolean))]
    const invoiceIds = [...new Set((events || []).map(e => e.invoice_id).filter(Boolean))]

    const [customersRes, invoicesRes] = await Promise.all([
      customerIds.length > 0
        ? supabaseAdmin.from('customers').select('id, customer_name, phone').in('id', customerIds)
        : { data: [] as any[] },
      invoiceIds.length > 0
        ? supabaseAdmin.from('invoices').select('id, total, invoice_number').in('id', invoiceIds)
        : { data: [] as any[] },
    ])

    const customerMap = new Map((customersRes.data || []).map((c: any) => [c.id, c]))
    const invoiceMap = new Map((invoicesRes.data || []).map((i: any) => [i.id, i]))

    const filtered = (events || [])
      .map(e => ({
        id: e.id,
        customerId: e.customer_id,
        customerName: customerMap.get(e.customer_id)?.customer_name || 'Unknown',
        customerPhone: customerMap.get(e.customer_id)?.phone || '',
        invoiceId: e.invoice_id,
        invoiceNumber: invoiceMap.get(e.invoice_id)?.invoice_number || '',
        amount: parseFloat(invoiceMap.get(e.invoice_id)?.total) || 0,
        stage: e.reminder_stage,
        status: e.status,
        messagePreview: e.metadata?.messagePreview?.substring(0, 120) || '',
        occurredAt: e.occurred_at,
        deliveredAt: e.delivered_at || null,
        readAt: e.read_at || null,
        failedAt: e.status === 'failed' ? e.created_at : null,
      }))
      .filter(e => !search || e.customerName.toLowerCase().includes(search.toLowerCase()) || e.customerPhone.includes(search))

    return NextResponse.json({
      events: filtered,
      total: count || 0,
      page,
      limit,
    })
  } catch (err: any) {
    console.error('[ReminderHistory] Error:', err)
    return NextResponse.json({ events: [], total: 0, error: err.message })
  }
}
