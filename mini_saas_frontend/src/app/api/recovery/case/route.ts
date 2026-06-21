import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRequest, errorResponse, validateJsonBody } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const { tenantId } = auth

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response

    const { invoiceId, customerId, amount, customerName, customerPhone } = bodyResult.data!

    if (!invoiceId || !customerId || !amount) {
      return errorResponse('Missing invoiceId, customerId, or amount', 400)
    }

    const now = new Date().toISOString()

    // Check if recovery case already exists for this customer
    const { data: existing } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, invoice_count, open_invoice_count, total_outstanding')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('recovery_cases')
        .update({
          invoice_count: (existing.invoice_count || 0) + 1,
          open_invoice_count: (existing.open_invoice_count || 0) + 1,
          total_outstanding: (parseFloat(existing.total_outstanding) || 0) + amount,
          last_activity_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('[RecoveryCaseAPI] Update error:', updateError)
        return errorResponse('Failed to update recovery case', 500)
      }
    } else {
      const caseId = crypto.randomUUID()
      const { error: insertError } = await supabaseAdmin
        .from('recovery_cases')
        .insert({
          id: caseId,
          tenant_id: tenantId,
          customer_id: customerId,
          status: 'open',
          invoice_count: 1,
          open_invoice_count: 1,
          total_outstanding: amount,
          recovery_state_v2: 'active',
          engagement_state_v2: 'unseen',
          attention_score: Math.round(amount / 1000),
          version: 1,
          last_activity_at: now,
          created_at: now,
          updated_at: now,
        })

      if (insertError) {
        console.error('[RecoveryCaseAPI] Insert error:', insertError)
        return errorResponse('Failed to create recovery case', 500)
      }
    }

    // Fire-and-forget: trigger immediate reminder via worker
    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:10000'
    fetch(`${workerUrl}/api/v1/recovery/trigger-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, tenantId }),
    }).catch((err: any) => console.warn('[RecoveryCaseAPI] Trigger reminder failed:', err.message))

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[RecoveryCaseAPI] POST error:', err)
    return errorResponse('Internal server error', 500)
  }
}
