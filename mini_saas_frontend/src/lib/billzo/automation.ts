const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.your-instance.com'
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || ''

export type WhatsAppNotifyType =
  | 'welcome'
  | 'credentials'
  | 'dailySummary'
  | 'lowStock'
  | 'planExpiry'
  | 'invoice_sent'
  | 'collections_reminder'

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
    const webhookUrl = `${N8N_WEBHOOK_URL}/webhook/whatsapp-notify`
    if (webhookUrl.includes('n8n.your-instance.com')) {
      console.log('[Automation] n8n not configured, skipping notification')
      return false
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(N8N_WEBHOOK_SECRET ? { 'X-n8n-secret': N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      console.warn('[Automation] n8n WhatsApp trigger failed:', await response.text())
      return false
    }

    return true
  } catch (error) {
    console.error('[Automation] Failed to trigger WhatsApp notification:', error)
    return false
  }
}

export async function triggerCollectionsWorkflow(invoices: any[]) {
  try {
    const webhookUrl = `${N8N_WEBHOOK_URL}/webhook/billzo-collections`
    if (webhookUrl.includes('n8n.your-instance.com')) {
      console.log('[Automation] n8n collections not configured')
      return false
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(N8N_WEBHOOK_SECRET ? { 'X-n8n-secret': N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        invoices,
        timestamp: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      console.warn('[Automation] n8n collections trigger failed:', await response.text())
      return false
    }

    return true
  } catch (error) {
    console.error('[Automation] Failed to trigger collections workflow:', error)
    return false
  }
}

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
    console.error('[Automation] Failed to trigger push notification:', error)
    return false
  }
}