import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 1. Check supabaseAdmin
    let adminOk = true
    try {
      const { data: ping } = await supabaseAdmin.from('tenants').select('id').limit(1)
      if (!ping) adminOk = false
    } catch (e: any) {
      adminOk = false
    }

    // 2. Invoices with outstanding_amount > 0
    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('id, customer_id, outstanding_amount, total, grand_total, paid_amount')
      .eq('tenant_id', tenantId)
      .gt('outstanding_amount', 0)

    // 3. Recovery cases
    const { data: cases, error: caseErr } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding, recovery_state_v2')
      .eq('tenant_id', tenantId)

    // 4. Customers
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, customer_name')
      .eq('tenant_id', tenantId)
      .limit(20)

    // 5. Try the exact query fetchRawData uses
    const { data: rawCases, error: rawCaseErr } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, next_action_type, open_invoice_count, last_activity_at')
      .eq('tenant_id', tenantId)
      .gt('total_outstanding', 0)
      .in('recovery_state_v2', ['active', 'overdue', 'partial_payment', 'promised', 'disputed'])
      .order('total_overdue', { ascending: false })
      .limit(50)

    return NextResponse.json({
      adminOk,
      invoices: { count: invoices?.length || 0, data: invoices?.slice(0, 5) || [] },
      invoicesError: invErr?.message || null,
      cases: { count: cases?.length || 0, data: cases || [] },
      casesError: caseErr?.message || null,
      customers: { count: customers?.length || 0, sample: customers?.slice(0, 3) || [] },
      customersError: custErr?.message || null,
      rawCases: { count: rawCases?.length || 0, data: rawCases || [] },
      rawCasesError: rawCaseErr?.message || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
  }
}
