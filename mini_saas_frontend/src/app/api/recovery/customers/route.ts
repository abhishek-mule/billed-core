import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!

  try {
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone, automation_mode')
      .eq('tenant_id', tenantId)
      .order('customer_name', { ascending: true })

    if (custErr) throw custErr

    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('customer_id, total, paid_amount, status, recovery_stage, next_recovery_at, last_whatsapp_at, created_at')
      .eq('tenant_id', tenantId)
      .in('status', ['unpaid', 'overdue', 'partial'])

    if (invErr) throw invErr

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const invoiceMap = new Map<string, {
      outstanding: number
      unpaidCount: number
      nextRecoveryAt: string | null
      lastReminderAt: string | null
      reminderThisMonth: number
    }>()

    for (const inv of invoices || []) {
      const cid = inv.customer_id
      if (!invoiceMap.has(cid)) {
        invoiceMap.set(cid, { outstanding: 0, unpaidCount: 0, nextRecoveryAt: null, lastReminderAt: null, reminderThisMonth: 0 })
      }
      const entry = invoiceMap.get(cid)!
      const outstanding = (parseFloat(inv.total) || 0) - (parseFloat(inv.paid_amount) || 0)
      if (outstanding > 0) {
        entry.outstanding += outstanding
        entry.unpaidCount++
      }
      if (inv.next_recovery_at && (!entry.nextRecoveryAt || inv.next_recovery_at > entry.nextRecoveryAt)) {
        entry.nextRecoveryAt = inv.next_recovery_at
      }
      if (inv.last_whatsapp_at && (!entry.lastReminderAt || inv.last_whatsapp_at > entry.lastReminderAt)) {
        entry.lastReminderAt = inv.last_whatsapp_at
      }
      if (inv.last_whatsapp_at && new Date(inv.last_whatsapp_at) >= monthStart) {
        entry.reminderThisMonth++
      }
    }

    const result = (customers || []).map((c: any) => {
      const data = invoiceMap.get(c.id) || { outstanding: 0, unpaidCount: 0, nextRecoveryAt: null, lastReminderAt: null, reminderThisMonth: 0 }
      return {
        customerId: c.id,
        customerName: c.customer_name || 'Unknown',
        phone: c.phone || '',
        automationMode: c.automation_mode || 'full_auto',
        outstanding: data.outstanding,
        unpaidCount: data.unpaidCount,
        nextRecoveryAt: data.nextRecoveryAt,
        lastReminderAt: data.lastReminderAt,
        reminderThisMonth: data.reminderThisMonth,
      }
    })

    return NextResponse.json({ customers: result, total: result.length })
  } catch (err: any) {
    console.error('[RecoveryCustomers] Error:', err)
    return NextResponse.json({ customers: [], total: 0, error: err.message })
  }
}
