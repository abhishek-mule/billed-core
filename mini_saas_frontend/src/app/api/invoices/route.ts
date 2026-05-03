import { db } from '@/lib/db'
import { invoices, invoiceItems, customers, outbox, activityLogs, ledgerEntries } from '@/lib/schema'
import { getSession } from '@/lib/auth/session'
import { calcGST } from '@/lib/gst'
import { sql, eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function POST(req: Request) {
  const session = await getSession(req)
  const tenantId = session.tenantId
  
  const body = await req.json()
  const { lineItems, customer, clientRequestId } = body
  
  if (!lineItems || lineItems.length === 0) {
    return Response.json({ error: 'Items required' }, { status: 400 })
  }
  
  // Idempotency check
  if (clientRequestId) {
    const existing = await db.query.invoices.findFirst({
      where: and(eq(invoices.tenantId, tenantId), eq(invoices.erpDocname, clientRequestId))
    })
    if (existing) return Response.json(existing)
  }
  
  // Customer resolution & Credit check
  let customerId = body.customerId
  let customerRecord = null
  
  if (!customerId && customer) {
    customerRecord = await db.query.customers.findFirst({
      where: and(eq(customers.tenantId, tenantId), eq(customers.phone, customer.phone))
    })
    if (customerRecord) {
      customerId = customerRecord.id
    } else {
      const [newCustomer] = await db.insert(customers).values({
        tenantId,
        customerName: customer.name,
        phone: customer.phone,
      }).returning()
      customerRecord = newCustomer
      customerId = newCustomer.id
    }
  } else if (customerId) {
    customerRecord = await db.query.customers.findFirst({
      where: and(eq(customers.tenantId, tenantId), eq(customers.id, customerId))
    })
  }

  const totals = calcGST(lineItems)
  const [{ seq }] = await db.execute(sql`SELECT nextval('invoice_seq') AS seq`)

  const invoiceNo = `INV-${tenantId.slice(0, 4).toUpperCase()}-${seq}`
  
  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx.insert(invoices).values({
      invoiceNumber: invoiceNo,
      publicId: nanoid(10),
      tenantId,
      customerId,
      subtotal: totals.subtotal.toString(),
      cgst: totals.cgst.toString(),
      sgst: totals.sgst.toString(),
      grandTotal: totals.total.toString(),
      status: 'unpaid',
      erpDocname: clientRequestId,
    }).returning()
    
    await tx.insert(invoiceItems).values(
      lineItems.map((i: any) => ({
        invoiceId: invoice.id,
        tenantId,
        itemCode: i.itemCode,
        name: i.name,
        qty: i.qty.toString(),
        rate: i.rate.toString(),
        amount: (i.qty * i.rate).toString(),
        gstRate: i.gstRate.toString(),
      }))
    )
    
    // Ledger entry for Udhaar
    await tx.insert(ledgerEntries).values({
      tenantId,
      customerId,
      invoiceId: invoice.id,
      type: 'debit',
      amount: invoice.grandTotal.toString(),
      description: `Invoice ${invoice.invoiceNumber}`
    })

    await tx.update(customers)
      .set({ udharBalance: sql`udhar_balance + ${invoice.grandTotal}` })
      .where(eq(customers.id, customerId))
    
    await tx.insert(outbox).values({
      tenantId,
      type: 'invoice_created',
      payload: { invoiceId: invoice.id },
    })
    
    await tx.insert(activityLogs).values({
      tenantId,
      type: 'invoice_created',
      entityId: invoice.id,
    })
    
    return invoice
  })
  
  return Response.json(result, { status: 201 })
}
