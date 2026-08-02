import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { uuid } from '@/lib/billzo/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const body = await request.json()
    const { invoiceId, customerId, amount, dueDate, note } = body

    if (!invoiceId || !dueDate) {
      return errorResponse('invoiceId and dueDate required', 400)
    }

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('tenant_id, customer_id, customer_name')
      .eq('id', invoiceId)
      .single()

    if (!invoice) return errorResponse('Invoice not found', 404)

    if (invoice.tenant_id !== tenantId) return errorResponse('Unauthorized', 401)

    const promise = {
      id: uuid(),
      tenant_id: invoice.tenant_id,
      customer_id: customerId || invoice.customer_id,
      invoice_ids: [invoiceId],
      amount: amount || 0,
      due_date: dueDate,
      status: 'active',
      note: note || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error: promiseError } = await supabaseAdmin
      .from('payment_promises')
      .insert(promise)

    if (promiseError) return errorResponse(promiseError.message, 500)

    const activity = {
      id: uuid(),
      tenant_id: invoice.tenant_id,
      invoice_id: invoiceId,
      customer_id: customerId || invoice.customer_id,
      type: 'promise_received',
      actor: 'customer',
      metadata: { amount, dueDate, note, promiseId: promise.id },
      created_at: new Date().toISOString(),
    }

    await supabaseAdmin
      .from('recovery_activities')
      .insert(activity)

    return NextResponse.json({ success: true, promise })
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}
