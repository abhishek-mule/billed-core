import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select('customer_id, total, paid_amount, status, due_date, customers(id, customer_name, phone)')
      .eq('tenant_id', tenantId)
      .in('status', ['unpaid', 'overdue', 'partial'])
      .order('due_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const customerMap = new Map<string, {
      customerId: string
      customerName: string
      phone: string
      totalOverdue: number
      openInvoiceCount: number
    }>()

    for (const inv of invoices || []) {
      const cust = (inv as any).customers || {}
      const cid = inv.customer_id
      if (!cid) continue

      const outstanding = Math.max(
        (parseFloat(inv.total) || 0) - (parseFloat(inv.paid_amount) || 0),
        0
      )
      if (outstanding <= 0) continue

      const existing = customerMap.get(cid)
      if (existing) {
        existing.totalOverdue += outstanding
        existing.openInvoiceCount++
      } else {
        const name = cust.customer_name || ''
        const phone = cust.phone || ''
        if (search.trim()) {
          const q = search.toLowerCase()
          if (!name.toLowerCase().includes(q) && !phone.includes(q)) continue
        }
        customerMap.set(cid, {
          customerId: cid,
          customerName: name,
          phone,
          totalOverdue: outstanding,
          openInvoiceCount: 1,
        })
      }
    }

    const customers = Array.from(customerMap.values())
    customers.sort((a, b) => b.totalOverdue - a.totalOverdue)

    return NextResponse.json({ customers })
  } catch (err: any) {
    console.error('[OutstandingCustomers] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
