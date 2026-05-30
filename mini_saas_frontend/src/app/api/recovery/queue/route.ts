import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

export async function GET(request: NextRequest) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // ── Active cases (non-recovered, non-closed) with customer join ──
  const { data: activeCases, error: casesErr } = await supabase
    .from('recovery_cases')
    .select(`
      *,
      customers!inner(name, phone)
    `)
    .eq('tenant_id', tenantId)
    .not('recovery_state_v2', 'in', '("recovered","closed")')
    .order('attention_score', { ascending: false })
    .limit(20)

  if (casesErr) {
    return NextResponse.json({ error: casesErr.message }, { status: 500 })
  }

  // ── Totals across all cases ──
  const { data: allCases } = await supabase
    .from('recovery_cases')
    .select('recovery_state_v2, total_outstanding, total_overdue, engagement_state_v2')
    .eq('tenant_id', tenantId)

  // ── Recent successful payments (last 7 days) ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, method, invoice_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'success')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  // ── Compute sections ──
  const rows = allCases || []
  const activeRows = activeCases || []

  const collectibleToday = rows
    .filter(r => r.recovery_state_v2 !== 'recovered' && r.recovery_state_v2 !== 'closed')
    .reduce((s, r) => s + (parseFloat(r.total_outstanding) || 0), 0)

  const totalOverdue = rows.reduce((s, r) => s + (parseFloat(r.total_overdue) || 0), 0)
  const totalOutstanding = rows.reduce((s, r) => s + (parseFloat(r.total_outstanding) || 0), 0)

  const activeCaseCount = rows.filter(
    r => r.recovery_state_v2 !== 'recovered' && r.recovery_state_v2 !== 'closed',
  ).length

  const overdueCaseCount = rows.filter(r => r.recovery_state_v2 === 'overdue').length

  // ── Do This Now: highest attention_score case ──
  let doThisNow = null
  const topCase = activeRows[0]
  if (topCase) {
    doThisNow = {
      caseId: topCase.id,
      customerId: topCase.customer_id,
      customerName: topCase.customers?.name || 'Unknown',
      customerPhone: topCase.customers?.phone || '',
      amount: parseFloat(topCase.total_outstanding) || 0,
      overdue: parseFloat(topCase.total_overdue) || 0,
      action: topCase.next_action_type || 'send_reminder',
      recoveryState: topCase.recovery_state_v2,
      engagementState: topCase.engagement_state_v2,
    }
  }

  // ── Exceptions: disputed + ghosting customers ──
  const exceptions = activeRows
    .filter(r => {
      const state = r.recovery_state_v2
      const engagement = r.engagement_state_v2
      return state === 'disputed' || engagement === 'ghosting'
    })
    .map(r => ({
      caseId: r.id,
      customerId: r.customer_id,
      customerName: r.customers?.name || 'Unknown',
      amount: parseFloat(r.total_outstanding) || 0,
      reason: r.recovery_state_v2 === 'disputed' ? 'Disputed' : 'Ghosting — no response',
      type: r.recovery_state_v2 === 'disputed' ? 'disputed' : 'ghosting',
    }))

  return NextResponse.json({
    collectibleToday,
    activeCaseCount,
    overdueCaseCount,
    doThisNow,
    exceptions,
    recentPayments: (payments || []).map(p => ({
      id: p.id,
      amount: parseFloat(p.amount) || 0,
      invoiceId: p.invoice_id,
      method: p.method || 'unknown',
      createdAt: p.created_at,
    })),
    totalOverdue,
    totalOutstanding,
  })
}
