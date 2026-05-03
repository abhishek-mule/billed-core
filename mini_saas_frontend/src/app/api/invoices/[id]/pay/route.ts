import { db } from '@/lib/db'
import { invoices } from '@/lib/schema'
import { getSession } from '@/lib/auth/session'
import { createOrder } from '@/lib/integrations/razorpay'
import { eq, and } from 'drizzle-orm'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  const tenantId = session.tenantId
  const { id } = params
  
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))
  })
  
  if (!invoice || invoice.paymentStatus === 'paid') {
    return Response.json({ error: 'Invalid invoice' }, { status: 400 })
  }
  
  const order = await createOrder(
    Number(invoice.grandTotal), 
    'INR', 
    `receipt_${invoice.invoiceNumber}`
  )
  
  return Response.json({ orderId: order.id, key: process.env.RAZORPAY_KEY_ID })
}
