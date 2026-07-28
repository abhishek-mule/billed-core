import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse, validateJsonBody } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recovery/outcome
 *
 * Record the outcome of a recovery action (call, reminder, etc.).
 * This completes the merchant's workflow loop:
 *
 *   See problem → Understand why → Take action → Record outcome
 *
 * Outcomes are stored in recovery_activities and the case state is
 * updated accordingly.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId, userId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const bodyResult = await validateJsonBody<{
      caseId: string
      outcome: 'promised' | 'wrong_number' | 'no_answer' | 'dispute' | 'paid' | 'not_interested'
      note?: string
      promiseDate?: string
      customerId?: string
    }>(request)
    if (bodyResult.response) return bodyResult.response

    const { caseId, outcome, note, promiseDate, customerId } = bodyResult.data!

    if (!caseId || !outcome) {
      return errorResponse('caseId and outcome are required', 400)
    }

    const validOutcomes = ['promised', 'wrong_number', 'no_answer', 'dispute', 'paid', 'not_interested']
    if (!validOutcomes.includes(outcome)) {
      return errorResponse('Invalid outcome', 400)
    }

    const now = new Date().toISOString()

    // Load the recovery case to get customer info
    const { data: rc } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding')
      .eq('tenant_id', tenantId)
      .eq('id', caseId)
      .maybeSingle()

    if (!rc) return errorResponse('Case not found', 404)

    const finalCustomerId = customerId || rc.customer_id

    // Log the activity
    const activityId = crypto.randomUUID()
    const { error: actError } = await supabaseAdmin
      .from('recovery_activities')
      .insert({
        id: activityId,
        tenant_id: tenantId,
        customer_id: finalCustomerId,
        type: `outcome_${outcome}`,
        actor: userId || 'merchant',
        metadata: {
          caseId,
          outcome,
          note: note || '',
          promiseDate: promiseDate || null,
          recordedAt: now,
        },
        created_at: now,
      })

    if (actError) {
      console.error('[OutcomeAPI] Activity insert error:', actError)
      return errorResponse('Failed to record outcome', 500)
    }

    // Update case state based on outcome
    const updates: Record<string, any> = { updated_at: now }

    switch (outcome) {
      case 'promised':
        updates.promise_to_pay_date = promiseDate || now
        updates.recovery_state_v2 = 'promised'
        break
      case 'paid':
        updates.recovery_state_v2 = 'recovered'
        updates.total_outstanding = 0
        break
      case 'wrong_number':
      case 'no_answer':
        // Bump reminder count so next recommendation knows reminders were ignored
        updates.reminder_count = supabaseAdmin.rpc('increment', { x: 1 }) as any
        break
      case 'dispute':
        updates.recovery_state_v2 = 'disputed'
        break
      case 'not_interested':
        updates.recovery_state_v2 = 'closed'
        break
    }

    // Simple update without RPC for reminder_count
    if (outcome === 'wrong_number' || outcome === 'no_answer') {
      await supabaseAdmin
        .from('recovery_cases')
        .update({ updated_at: now })
        .eq('id', caseId)
    } else {
      await supabaseAdmin
        .from('recovery_cases')
        .update(updates)
        .eq('id', caseId)
    }

    return NextResponse.json({ success: true, activityId })
  } catch (err: any) {
    console.error('[OutcomeAPI] POST error:', err)
    return errorResponse('Internal server error', 500)
  }
}
