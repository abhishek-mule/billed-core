import { db, uuid } from '@/lib/billzo/db'
import type { Invoice, InvoiceItem, Customer } from '@/lib/billzo/types'
import { generateInvoicePDF } from '@/lib/billzo/pdf'
import type { ParsedInvoice } from '@/lib/billzo/whatsapp-parser'

export async function createInvoiceFromWhatsApp(
  tenantId: string,
  parsed: ParsedInvoice,
  customerPhone: string
): Promise<{ success: boolean; data?: { invoiceId: string; customerId: string; total: number; paymentLink?: string }; error?: string }> {
  try {
    const cleanPhone = customerPhone.replace(/\D/g, '')
    const e164 = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`

    let customer = await db().customers
      .where('tenantId').equals(tenantId)
      .filter(c => c.phone.replace(/\D/g, '') === cleanPhone || c.phone === e164)
      .first()

    if (!customer) {
      const now = new Date().toISOString()
      const customerId = uuid()
      customer = {
        id: customerId,
        tenantId,
        name: parsed.customerName,
        phone: e164,
        whatsapp_number: parsed.phone ? `+91${parsed.phone.replace(/\D/g, '')}` : undefined,
        gstin: parsed.gstin,
        opt_in: false,
        defaultTone: 'hinglish',
        invoiceCount: 0,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await db().customers.add(customer)
    } else {
      await db().customers.update(customer.id, {
        name: parsed.customerName,
        lastUsedAt: new Date().toISOString(),
        invoiceCount: (customer.invoiceCount || 0) + 1,
      })
    }

    const now = new Date().toISOString()
    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const invoiceId = uuid()

    const invoiceItems: InvoiceItem[] = parsed.items.map(item => {
      const lineTotal = item.price * item.qty
      return {
        id: uuid(),
        tenantId,
        invoiceId,
        name: item.name,
        qty: item.qty,
        price: item.price,
        salePrice: item.price,
        purchasePrice: 0,
        gstRate: 18,
        lineTotal,
        createdAt: now,
        updatedAt: now,
      }
    })

    const subtotal = parsed.items.reduce((sum, item) => sum + item.price * item.qty, 0)
    const gst = Math.round(subtotal * 0.18)
    const total = subtotal + gst

    const invoice: Invoice = {
      id: invoiceId,
      tenantId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      total,
      paidAmount: 0,
      status: 'unpaid',
      dueAt,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      recoveryStage: 't0_soft',
      nextRecoveryAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      lastWhatsAppStatus: 'sent',
      lastWhatsAppAt: now,
      reminderCount: 0,
      pdfUrl: '',
      version: 1,
    }

    await db().invoices.add(invoice)
    await db().invoiceItems.bulkAdd(invoiceItems)

    try {
      const tenant = await db().tenants.get(tenantId)
      const pdfDoc = await generateInvoicePDF({
        invoiceNumber: invoice.invoiceNumber || invoice.id.slice(0, 8).toUpperCase(),
        date: invoice.createdAt,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        items: invoiceItems.map(item => ({
          name: item.name,
          hsn: item.hsn,
          qty: item.qty,
          price: item.price,
          gstRate: item.gstRate,
        })),
        subtotal: total - Math.round(total * 0.18 / 1.18),
        tax: Math.round(total * 0.18 / 1.18),
        total,
        businessName: tenant?.name || 'BillZo',
        businessPhone: tenant?.phone,
        businessGstin: tenant?.gstin,
        businessPan: tenant?.pan,
        businessAddress: tenant?.address,
        bankDetails: tenant?.bankDetails,
        upiId: tenant?.upiId,
        whiteLabel: tenant?.whiteLabel,
      })
      if (pdfDoc) {
        const pdfBlob = (pdfDoc as any).output('blob')
        const pdfUrl = URL.createObjectURL(pdfBlob)
        await db().invoices.update(invoiceId, { pdfUrl })
      }
    } catch (err) {
      console.error('[WhatsAppActions] PDF generation failed:', err)
    }

    const paymentLink = undefined

    await db().whatsappEvents.add({
      id: uuid(),
      tenantId,
      invoiceId,
      customerId: customer.id,
      phone: customer.phone,
      messageType: 'invoice',
      status: 'sent',
      occurredAt: now,
      createdAt: now,
    })

    return {
      success: true,
      data: {
        invoiceId,
        customerId: customer.id,
        total,
        paymentLink,
      },
    }
  } catch (err: any) {
    console.error('[WhatsAppActions] Error creating invoice:', err)
    return { success: false, error: err.message || 'Failed to create invoice' }
  }
}