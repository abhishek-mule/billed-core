import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { evaluateReadiness, type ReadinessCounts } from '@/lib/recovery/readiness'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recovery/readiness
 *
 * Returns the merchant's Recovery Readiness: whether they have customers,
 * invoices, overdue invoices, and a connected WhatsApp number — plus the single
 * next action to move them toward their first recovered payment.
 *
 * Pure evaluation lives in src/lib/recovery/readiness.ts. This route only
 * gathers the four facts in parallel and delegates. No new business logic.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 })
    }

    const now = new Date().toISOString()

    const [customersRes, invoicesRes, tenantRes] = await Promise.all([
      supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabaseAdmin
        .from('invoices')
        .select('id, status, due_date, total, paid_amount')
        .eq('tenant_id', tenantId),
      supabaseAdmin.from('tenants').select('whatsapp_config').eq('id', tenantId).single(),
    ])

    const customerCount = customersRes.count ?? 0
    const invoiceRows = (invoicesRes.data || []) as Array<{
      status: string
      due_date: string | null
      total: number | string
      paid_amount: number | string
    }>

    const invoiceCount = invoiceRows.length
    const overdueInvoices = invoiceRows.filter(
      (r) =>
        r.status !== 'paid' &&
        r.due_date != null &&
        new Date(r.due_date).getTime() < new Date(now).getTime() &&
        Math.max((parseFloat(String(r.total)) || 0) - (parseFloat(String(r.paid_amount)) || 0), 0) > 0,
    ).length

    const whatsappConfig = (tenantRes.data as any)?.whatsapp_config
    const whatsappConnected = Boolean(whatsappConfig?.gupshupApiKey || whatsappConfig?.connected)

    const recoverableAmount = invoiceRows
      .filter((r) => r.status !== 'paid' && r.due_date != null && new Date(r.due_date).getTime() < new Date(now).getTime())
      .reduce((sum, r) => sum + Math.max((parseFloat(String(r.total)) || 0) - (parseFloat(String(r.paid_amount)) || 0), 0), 0)

    const counts: ReadinessCounts = {
      customers: customerCount,
      invoices: invoiceCount,
      overdueInvoices,
      whatsappConnected,
    }

    const readiness = evaluateReadiness(counts)
    return NextResponse.json({
      ...readiness,
      customerCount,
      invoiceCount,
      recoverableAmount: Math.round(recoverableAmount),
    })
  } catch (error: any) {
    console.error('[RecoveryReadiness] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
