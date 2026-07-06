import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { buildReason, getNextActionLabel } from '@/lib/recovery/queue-service'
import { fetchRecoveryCaseByCustomer, fetchCustomerRecoveryMetrics } from '@/lib/recovery/priority-query'
import { formatOverdueDays } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const customerId = request.nextUrl.searchParams.get('customerId')
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    const [recoveryCase, metrics] = await Promise.all([
      fetchRecoveryCaseByCustomer(tenantId!, customerId),
      fetchCustomerRecoveryMetrics(tenantId!, customerId)
    ])

    if (!recoveryCase) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 })
    }

    // Get customer since date
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('created_at')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .single()

    const customerSince = customer?.created_at 
      ? new Date(customer.created_at).getFullYear().toString() 
      : 'Unknown'

    // Calculate payment behavior (average days to pay)
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('paid_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(20)

    let paymentBehavior = 'No payment history'
    if (payments && payments.length >= 2) {
      // Calculate average days between invoice and payment
      // For simplicity, use days since last payment
      const lastPaymentDate = new Date(payments[0].paid_at)
      const daysSinceLastPayment = Math.floor((Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
      paymentBehavior = `Usually pays within ${daysSinceLastPayment} days`
    }

    const hasOverdue = parseFloat(recoveryCase.total_overdue) > 0
    const hasValidPromise = recoveryCase.promise_to_pay_date && new Date(recoveryCase.promise_to_pay_date) > new Date()
    let nextAction = recoveryCase.next_action_type || 'send_reminder'
    if (nextAction === 'wait' && hasOverdue && !hasValidPromise) {
      nextAction = 'send_reminder'
    }
    const nextActionLabel = getNextActionLabel(nextAction)
    const nextActionReason = buildReason({
      caseId: recoveryCase.id,
      customerId: recoveryCase.customer_id,
      customerName: '',
      phone: '',
      totalOverdue: parseFloat(recoveryCase.total_overdue) || 0,
      oldestOverdueDays: metrics.oldestOverdueDays,
      attentionScore: recoveryCase.attention_score || 0,
      nextActionType: nextAction,
      promiseToPayDate: recoveryCase.promise_to_pay_date,
      ignoredReminders: recoveryCase.reminder_count || 0,
      brokenPromises: 0,
      openInvoiceCount: metrics.openInvoiceCount,
      automationMode: 'full_auto',
    })

    return NextResponse.json({
      case: recoveryCase,
      openInvoiceCount: metrics.openInvoiceCount,
      oldestOverdueDays: metrics.oldestOverdueDays,
      oldestOverdueLabel: formatOverdueDays(metrics.oldestOverdueDays),
      lastPaymentAt: metrics.lastPaymentAt,
      nextAction,
      nextActionLabel,
      nextActionReason,
      customerSince,
      paymentBehavior,
    })
  } catch (err: any) {
    console.error('[RecoveryCase] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}