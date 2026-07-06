import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getInvoiceRecoveryTimeline } from '@/lib/billzo/attribution'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!

  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    // Per-invoice timeline (existing behavior)
    if (invoiceId) {
      let invoiceExists = true
      try {
        const { data: invoice } = await supabaseAdmin
          .from('invoices')
          .select('id, tenant_id')
          .eq('id', invoiceId)
          .eq('tenant_id', tenantId)
          .single()
        if (!invoice) invoiceExists = false
      } catch {
        invoiceExists = false
      }

      if (!invoiceExists) {
        return NextResponse.json({ events: [], attribution: null })
      }

      const timeline = await getInvoiceRecoveryTimeline(invoiceId)

      let attribution = null
      try {
        const { data: attr } = await supabaseAdmin
          .from('recovery_attributions')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        attribution = attr
      } catch {
        attribution = null
      }

      return NextResponse.json({
        events: timeline.events || [],
        attribution: attribution || null,
      })
    }

    // Tenant-wide timeline (for Recovery History page)
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 200)
    const customerId = searchParams.get('customerId')

    const [whatsappRes, casesRes, paymentsRes] = await Promise.all([
      supabaseAdmin
        .from('whatsapp_events')
        .select('id, customer_id, invoice_id, amount, status, direction, message_preview, occurred_at, delivered_at, read_at, failed_at, customers!inner(customer_name, phone)')
        .eq('tenant_id', tenantId)
        .eq('direction', 'outbound')
        .order('occurred_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('recovery_cases')
        .select('id, customer_id, promise_to_pay_date, recovery_state_v2, next_action_type, last_activity_at, attention_score, customers!inner(customer_name, phone)')
        .eq('tenant_id', tenantId)
        .not('promise_to_pay_date', 'is', null)
        .order('last_activity_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('payments')
        .select('id, invoice_id, customer_id, amount, status, source, created_at, customers!inner(customer_name, phone)')
        .eq('tenant_id', tenantId)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(limit),
    ])

    const timeline: Array<{
      id: string
      type: 'reminder' | 'promise' | 'payment' | 'call' | 'system'
      customerId: string
      customerName: string
      customerPhone: string
      amount: number
      label: string
      detail: string
      occurredAt: string
      status: string
    }> = []

    // Add whatsapp events as reminders
    if (whatsappRes.data) {
      for (const ev of whatsappRes.data) {
        const cust = (ev as any).customers || {}
        timeline.push({
          id: `reminder-${ev.id}`,
          type: 'reminder',
          customerId: ev.customer_id || '',
          customerName: cust.customer_name || 'Unknown',
          customerPhone: cust.phone || '',
          amount: Number(ev.amount) || 0,
          label: 'Reminder',
          detail: ev.message_preview || 'WhatsApp reminder sent',
          occurredAt: ev.occurred_at,
          status: ev.status,
        })
      }
    }

    // Add promises from recovery_cases with promise_to_pay_date
    if (casesRes.data) {
      for (const rc of casesRes.data) {
        const cust = (rc as any).customers || {}
        timeline.push({
          id: `promise-${rc.id}`,
          type: 'promise',
          customerId: rc.customer_id,
          customerName: cust.customer_name || 'Unknown',
          customerPhone: cust.phone || '',
          amount: 0,
          label: 'Promise',
          detail: `Promised payment by ${new Date(rc.promise_to_pay_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          occurredAt: rc.last_activity_at || rc.promise_to_pay_date,
          status: new Date(rc.promise_to_pay_date) < new Date() ? 'broken' : 'active',
        })
      }
    }

    // Add payments
    if (paymentsRes.data) {
      for (const pmt of paymentsRes.data) {
        const cust = (pmt as any).customers || {}
        timeline.push({
          id: `payment-${pmt.id}`,
          type: 'payment',
          customerId: pmt.customer_id || '',
          customerName: cust.customer_name || 'Unknown',
          customerPhone: cust.phone || '',
          amount: Number(pmt.amount) || 0,
          label: pmt.source === 'cash' ? 'Cash' : 'Payment',
          detail: `Payment of ₹${Number(pmt.amount).toLocaleString('en-IN')} received`,
          occurredAt: pmt.created_at,
          status: 'success',
        })
      }
    }

    // Sort all by occurredAt descending
    timeline.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

    // Filter by customerId if provided
    const filtered = customerId ? timeline.filter(e => e.customerId === customerId) : timeline

    return NextResponse.json({ events: filtered.slice(0, limit), total: filtered.length })
  } catch (err: any) {
    console.error('[RecoveryTimeline] Error:', err)
    return NextResponse.json({ events: [], total: 0, error: err.message })
  }
}
