import { db } from '@/lib/db'
import { invoices } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { generatePdf } from '@/lib/pdf'
import { uploadToStorage } from '@/lib/storage'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/meta'

export async function processInvoiceNotification(invoiceId: string) {
  // 1. Fetch data
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: { items: true, customer: true }
  })
  
  if (!invoice) throw new Error('Invoice not found')
  
  // 2. Idempotency Check
  if (invoice.waStatus === 'sent') return
  
  try {
    // 3. Get or Generate PDF
    let pdfUrl = invoice.pdfUrl
    if (!pdfUrl) {
      const pdfBuffer = await generatePdf(invoice)
      const key = `invoices/${invoice.id}.pdf`
      pdfUrl = await uploadToStorage(pdfBuffer, key)
      
      await db.update(invoices)
        .set({ pdfUrl })
        .where(eq(invoices.id, invoice.id))
    }
    
    // 4. Send via Meta WhatsApp
    const res = await sendWhatsAppTemplate({
      phone: invoice.customer?.phone || '',
      template: 'invoice_delivery',
      params: { 
        name: invoice.customer?.customerName || 'Customer',
        invoice_no: invoice.invoiceNumber,
        pdf_url: pdfUrl
      }
    })
    
    // 5. Mark as sent and store messageId
    const messageId = res.messages?.[0]?.id
    await db.update(invoices)
      .set({ waStatus: 'sent', metaMessageId: messageId })
      .where(eq(invoices.id, invoice.id))
      
  } catch (err) {
    console.error(`[WA_ERROR] Invoice ${invoiceId}:`, err)
    // Only mark failed if we haven't already sent it
    await db.update(invoices)
      .set({ waStatus: 'failed' })
      .where(eq(invoices.id, invoice.id))
    throw err // Allow BullMQ to retry
  }
}
