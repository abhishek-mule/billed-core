import { getSession } from '@/lib/auth/session'
import { createInvoice } from '@/server/services/invoice/create'

export async function POST(req: Request) {
  const session = await getSession(req)
  const tenantId = session.tenantId
  
  const body = await req.json()
  const { lineItems } = body
  
  if (!lineItems || lineItems.length === 0) {
    return Response.json({ error: 'Items required' }, { status: 400 })
  }
  
  try {
    const result = await createInvoice(tenantId, body)
    return Response.json(result, { status: 201 })
  } catch (error) {
    return Response.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
