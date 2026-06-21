import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!

  try {
    const now = new Date().toISOString()

    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select('id, customer_id, total, paid_amount, status, recovery_stage, next_recovery_at, invoice_number')
      .eq('tenant_id', tenantId)
      .in('status', ['unpaid', 'overdue'])
      .order('next_recovery_at', { ascending: true, nullsFirst: true })
      .limit(50)

    if (error) throw error

    const customerIds = [...new Set((invoices || []).map(i => i.customer_id).filter(Boolean))]
    const customerMap = new Map<string, { customer_name: string; phone: string }>()

    if (customerIds.length > 0) {
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id, customer_name, phone')
        .in('id', customerIds)
      for (const c of customers || []) {
        customerMap.set(c.id, c)
      }
    }

    const reminders = (invoices || [])
      .map((inv: any) => {
        const outstanding = (parseFloat(inv.total) || 0) - (parseFloat(inv.paid_amount) || 0)
        const cust = customerMap.get(inv.customer_id)
        const nextAt = inv.next_recovery_at
        const isPending = !nextAt || nextAt <= now
        return {
          invoiceId: inv.id,
          customerId: inv.customer_id,
          customerName: cust?.customer_name || 'Unknown',
          customerPhone: cust?.phone || '',
          invoiceNumber: inv.invoice_number || '',
          amount: outstanding > 0 ? outstanding : parseFloat(inv.total) || 0,
          stage: inv.recovery_stage || 't0_soft',
          nextRecoveryAt: nextAt,
          isPending,
        }
      })
      .filter(r => r.amount > 0)
      .slice(0, 50)

    return NextResponse.json({ reminders, total: reminders.length })
  } catch (err: any) {
    console.error('[UpcomingReminders] Error:', err)
    return NextResponse.json({ reminders: [], total: 0, error: err.message })
  }
}
