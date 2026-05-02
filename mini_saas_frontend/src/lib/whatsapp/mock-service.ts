import { query } from '../db/client'

interface WhatsAppMessage {
  phone: string
  message: string
  mediaUrl?: string
}

/**
 * Mock WhatsApp Service for BillZo Startup Demo.
 * In production, this would integrate with Meta's Graph API or a provider like Twilio/AISensy.
 */
export async function sendWhatsAppMessage({ phone, message, mediaUrl }: WhatsAppMessage): Promise<boolean> {
  // 1. Validate phone number (simple check)
  if (!phone || phone.length < 10) {
    console.error('[WHATSAPP_MOCK] Invalid phone number:', phone)
    return false
  }

  // 2. Log the "sent" message to the console for demonstration
  console.log('--- START WHATSAPP MOCK ---')
  console.log(`TO: +91 ${phone}`)
  console.log(`MESSAGE: ${message}`)
  if (mediaUrl) console.log(`ATTACHMENT: ${mediaUrl}`)
  console.log('--- END WHATSAPP MOCK ---')

  // 3. Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 1200))

  return true
}

/**
 * Automates sending an invoice link to a customer.
 */
export async function automateInvoiceReminder(invoiceId: string, phone: string, amount: string): Promise<boolean> {
  const message = `Hello! Your invoice ${invoiceId} for ${amount} has been generated. View it here: https://billzo.in/v/${invoiceId}`
  
  return await sendWhatsAppMessage({
    phone,
    message
  })
}
