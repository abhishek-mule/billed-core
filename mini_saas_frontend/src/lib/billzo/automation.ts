/**
 * BillZo Automation Helper
 * Handles triggers for n8n workflows (WhatsApp, Daily Digest, etc.)
 */

const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_URL || 'https://n8n.your-instance.com'

export type WhatsAppNotifyType = 
  | 'welcome' 
  | 'credentials' 
  | 'dailySummary' 
  | 'lowStock' 
  | 'planExpiry' 
  | 'invoice_sent'

export async function triggerWhatsAppNotification(data: {
  type: WhatsAppNotifyType
  phone: string
  ownerName?: string
  shopName?: string
  siteUrl?: string
  email?: string
  totalSales?: number
  invoiceCount?: number
  topItem?: string
  itemName?: string
  currentStock?: number
  reorderLevel?: number
  planName?: string
  expiryDate?: string
  params?: string[]
}) {
  try {
    const response = await fetch(`${N8N_WEBHOOK_URL}/webhook/whatsapp-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    
    if (!response.ok) {
      console.warn('n8n WhatsApp trigger failed:', await response.text())
      return false
    }
    
    return true
  } catch (error) {
    console.error('Failed to trigger WhatsApp notification:', error)
    return false
  }
}

/**
 * Triggers a push notification via the server-side API
 */
export async function triggerPushNotification(tenantId: string, payload: {
  title: string
  body: string
  icon?: string
  type: string
}) {
  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId,
        ...payload
      }),
    })
    
    return response.ok
  } catch (error) {
    console.error('Failed to trigger push notification:', error)
    return false
  }
}
