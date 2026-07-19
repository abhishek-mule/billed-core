export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, validateJsonBody } from '@/lib/billzo/api-middleware'
import { planRecoveryForInvoice, planPromiseFollowup } from '@/lib/recovery/planner'

/**
 * POST /api/recovery/plan — trigger the Recovery Planner for a business event.
 * Called by the invoice-creation flow and the promise-made handler.
 *
 * Body (invoice_created):
 *   { invoiceId, customerId, invoiceIds?, anchorAt?, policyId? }
 * Body (promise_made):
 *   { customerId, invoiceIds, promiseDate, policyId? }
 */
export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await validateJsonBody(request, {
    fields: {
      customerId: { required: true, type: 'string' },
    },
  })
  if (body.response) return body.response
  const { invoiceId, invoiceIds, customerId, anchorAt, promiseDate, policyId } = body.data as any

  // Promise follow-up path
  if (promiseDate) {
    const res = await planPromiseFollowup({
      tenantId,
      customerId,
      invoiceIds: invoiceIds?.length ? invoiceIds : invoiceId ? [invoiceId] : [],
      promiseDate: new Date(promiseDate),
      reason: 'promise_made',
    })
    return NextResponse.json({ ok: true, mode: 'promise', ...res })
  }

  // Invoice-created path
  const ids = invoiceIds?.length ? invoiceIds : invoiceId ? [invoiceId] : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'invoiceId or invoiceIds required' }, { status: 400 })
  }
  const res = await planRecoveryForInvoice({
    tenantId,
    customerId,
    invoiceIds: ids,
    anchorAt: anchorAt ? new Date(anchorAt) : undefined,
    policyId,
    reason: 'invoice_created',
  })
  return NextResponse.json({ ok: true, mode: 'invoice', ...res })
}
