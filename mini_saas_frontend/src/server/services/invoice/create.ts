import { db } from '@/lib/db'
import { invoices, invoiceItems, customers, outbox, activityLogs, ledgerEntries } from '@/lib/schema'
import { eq, and, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { calcGST } from '@/lib/gst'
import { trackEvent } from '@/lib/analytics'

export async function createInvoice(tenantId: string, data: any, userId?: string) {
  const { lineItems, customer, customerId: existingCustomerId, clientRequestId } = data

  return await db.transaction(async (tx) => {
    // 1. Idempotency Check
    if (clientRequestId) {
      const existing = await tx.query.invoices.findFirst({
        where: and(eq(invoices.tenantId, tenantId), eq(invoices.erpDocname, clientRequestId))
      })
      if (existing) return existing
    }

    // 2. Resolve Customer
    let customerId = existingCustomerId
    if (!customerId && customer) {
      const customerRecord = await tx.query.customers.findFirst({
        where: and(eq(customers.tenantId, tenantId), eq(customers.phone, customer.phone))
      })
      
      if (customerRecord) {
        customerId = customerRecord.id
      } else {
        const [newCustomer] = await tx.insert(customers).values({
          tenantId,
          customerName: customer.name,
          phone: customer.phone,
        }).returning()
        customerId = newCustomer.id
      }
    }

    // 3. Prepare Invoice
    const totals = calcGST(lineItems)
    const [{ seq }] = await tx.execute(sql`SELECT nextval('invoice_seq') AS seq`)
    const invoiceNo = `INV-${tenantId.slice(0, 4).toUpperCase()}-${seq}`

    // 4. Insert Invoice
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

    // 5. Insert Items
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

    // 6. Update Ledger & Customer Balance
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

    // 7. Events & Logging
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

    // 🔥 TRACK
    await trackEvent(tx, {
      tenantId,
      userId,
      eventName: 'invoice.created',
      entityType: 'invoice',
      entityId: invoice.id,
      source: 'system',
      amountPaise: Math.round(Number(invoice.grandTotal) * 100),
      metadata: {
        customer_id: customerId,
        items_count: lineItems.length,
      },
    })


    return invoice
  })
}
