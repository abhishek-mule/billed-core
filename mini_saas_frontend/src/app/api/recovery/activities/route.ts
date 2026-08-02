import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { uuid } from '@/lib/billzo/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')
    const caseId = searchParams.get('caseId')

    if (!invoiceId && !caseId) return errorResponse('invoiceId or caseId required', 400)

    let query = supabaseAdmin
      .from('recovery_activities')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (caseId) {
      query = query.eq('case_id', caseId)
    } else {
      query = query.eq('invoice_id', invoiceId)
    }

    const { data, error } = await query

    if (error) return errorResponse(error.message, 500)
    return NextResponse.json({ activities: data })
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId, userId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const body = await request.json()
    const { invoiceId, customerId, caseId, type, actor, metadata } = body

    if (!invoiceId || !type || !actor) {
      return errorResponse('invoiceId, type, and actor required', 400)
    }

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('tenant_id')
      .eq('id', invoiceId)
      .single()

    if (!invoice) return errorResponse('Invoice not found', 404)

    if (invoice.tenant_id !== tenantId) return errorResponse('Unauthorized', 401)

    const activity = {
      id: uuid(),
      tenant_id: invoice.tenant_id,
      case_id: caseId || null,
      invoice_id: invoiceId,
      customer_id: customerId || null,
      type,
      actor: userId || actor,
      actor_id: userId || null,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    }

    const { error } = await supabaseAdmin
      .from('recovery_activities')
      .insert(activity)

    if (error) return errorResponse(error.message, 500)
    return NextResponse.json({ success: true, activity })
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}
