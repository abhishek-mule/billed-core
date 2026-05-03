import { db } from '@/lib/db'
import { invoices, invoiceItems, customers } from '@/lib/schema'
import { getSession } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  const tenantId = session.tenantId
  const { id } = params
  
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)),
    with: {
      items: true,
      customer: true
    }
  })
  
  if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 })
  
  return Response.json(invoice)
}
