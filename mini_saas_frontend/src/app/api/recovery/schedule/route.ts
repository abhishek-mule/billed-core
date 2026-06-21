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

    const { data: cases, error } = await supabaseAdmin
      .from('recovery_cases')
      .select(`
        id, customer_id, total_overdue, open_invoice_count,
        next_action_type, next_action_due_at, recovery_state_v2,
        engagement_state, promise_to_pay_date, attention_score,
        last_activity_at, automation_mode,
        customers:customer_id (customer_name, phone)
      `)
      .eq('tenant_id', tenantId)
      .not('recovery_state_v2', 'in', '("recovered","closed")')
      .order('next_action_due_at', { ascending: true, nullsFirst: false })

    if (error) throw error

    const items = (cases || [])
      .filter((rc: any) => {
        if (rc.next_action_type === 'wait' && rc.promise_to_pay_date) return true
        if (!rc.next_action_due_at) return false
        return true
      })
      .map((rc: any) => ({
        caseId: rc.id,
        customerId: rc.customer_id,
        customerName: rc.customers?.customer_name || 'Unknown',
        phone: rc.customers?.phone || '',
        totalOverdue: Number(rc.total_overdue) || 0,
        openInvoiceCount: rc.open_invoice_count || 0,
        nextActionType: rc.next_action_type || 'merchant_review',
        nextActionDueAt: rc.next_action_due_at,
        recoveryState: rc.recovery_state_v2,
        engagementState: rc.engagement_state,
        promiseToPayDate: rc.promise_to_pay_date,
        automationMode: rc.automation_mode || 'manual',
        attentionScore: rc.attention_score || 0,
      }))

    return NextResponse.json({ cases: items, total: items.length })
  } catch (err: any) {
    console.error('[RecoverySchedule] Error:', err)
    return NextResponse.json({ cases: [], total: 0, error: err.message })
  }
}
