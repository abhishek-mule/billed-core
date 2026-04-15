import { useState } from 'react'

export type WhatsAppTemplate = 'welcome' | 'credentials' | 'dailySummary' | 'lowStock' | 'planExpiry'

export function useWhatsApp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendNotification = async (
    type: WhatsAppTemplate,
    phone: string,
    params: string[]
  ): Promise<{ success: boolean; messageId?: string }> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: type, phone, params }),
      })

      const data = await response.json()

      if (data.success) {
        return { success: true, messageId: data.messageId }
      } else {
        setError(data.error || 'Failed to send')
        return { success: false }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      setError(message)
      return { success: false }
    } finally {
      setLoading(false)
    }
  }

  const sendWelcome = async (phone: string, ownerName: string, shopName: string, siteUrl: string, email: string) => {
    return sendNotification('welcome', phone, [ownerName, shopName, siteUrl, email])
  }

  const sendCredentials = async (phone: string, siteUrl: string, email: string, password: string) => {
    return sendNotification('credentials', phone, [siteUrl, email, password])
  }

  const sendDailySummary = async (phone: string, shopName: string, totalSales: string, invoiceCount: string, topItem: string) => {
    return sendNotification('dailySummary', phone, [shopName, totalSales, invoiceCount, topItem])
  }

  const sendLowStockAlert = async (phone: string, shopName: string, itemName: string, currentStock: string, reorderLevel: string) => {
    return sendNotification('lowStock', phone, [shopName, itemName, currentStock, reorderLevel])
  }

  const sendPlanExpiryReminder = async (phone: string, shopName: string, planName: string, expiryDate: string) => {
    return sendNotification('planExpiry', phone, [shopName, planName, expiryDate])
  }

  return {
    loading,
    error,
    sendNotification,
    sendWelcome,
    sendCredentials,
    sendDailySummary,
    sendLowStockAlert,
    sendPlanExpiryReminder,
  }
}
