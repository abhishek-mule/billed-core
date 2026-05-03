import { db } from '@/lib/db'
import { invoices, payments, customers } from '@/lib/schema'
import { enqueueJob, QUEUES } from '@/lib/queue'
import { eq, sql } from 'drizzle-orm'
import crypto from 'crypto'

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature')
  
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')
    
  if (expected !== signature) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = JSON.parse(rawBody)
  if (body.event === 'payment.captured') {
    const p = body.payload.payment.entity
    
    // Idempotency: skip if payment exists
    const existing = await db.query.payments.findFirst({
      where: eq(payments.razorpayPaymentId, p.id)
    })
    if (existing) return Response.json({ ok: true })
    
    await db.transaction(async (tx) => {
      // Find invoice by order ID (stored in payment metadata or derived)
      // For now, assuming payment linked to order; needs correlation
      // Let's assume invoiceId linked via receipt
      const receipt = p.notes?.receipt || ''
      const invoice = await tx.query.invoices.findFirst({
        where: eq(invoices.invoiceNumber, receipt.replace('receipt_', '')),
        with: { customer: true }
      })
      
      if (invoice) {
        // Check if collected via automation (within 24h of last reminder)
        const isAuto = invoice.lastFollowUpAt && 
          (new Date().getTime() - new Date(invoice.lastFollowUpAt).getTime()) < (24 * 60 * 60 * 1000);
        
        const fee = isAuto ? (p.amount / 100) * 0.01 : 0;

        await tx.insert(payments).values({
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          amount: (p.amount / 100).toString(),
          razorpayPaymentId: p.id,
          razorpayOrderId: p.order_id,
          status: 'captured',
          collectedVia: isAuto ? 'auto' : 'manual',
          platformFee: fee.toString()
        })
        
        // Trigger confirmation + acquisition WhatsApp
        await enqueueJob(QUEUES.invoiceNotification, {
          invoiceId: invoice.id,
          type: 'payment_confirmation_acquisition',
          phone: invoice.customer?.phone
        })

        if (invoice.customerId) {
          await tx.update(customers)
            .set({ udharBalance: sql`udhar_balance - ${(p.amount / 100)}` })
            .where(eq(customers.id, invoice.customerId))
        }
        
        const newTotal = Number(invoice.paymentAmount || 0) + (p.amount / 100)
        await tx.update(invoices).set({
          paymentAmount: newTotal.toString(),
          paymentStatus: newTotal >= Number(invoice.grandTotal) ? 'paid' : 'partial'
        }).where(eq(invoices.id, invoice.id))
      }
    })
  }
  
  return Response.json({ ok: true })
}
