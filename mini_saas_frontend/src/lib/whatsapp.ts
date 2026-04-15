export type WhatsAppProvider = 'gupshup' | 'twilio'

export interface WhatsAppConfig {
  provider: WhatsAppProvider
  apiKey?: string
  phoneNumberId?: string
  fromPhone?: string
  templateName?: string
}

export interface WhatsAppMessage {
  to: string
  template: string
  params: string[]
}

export interface WhatsAppResponse {
  success: boolean
  messageId?: string
  error?: string
}

const MOCK_MODE = true

export async function sendWhatsAppMessage(
  config: WhatsAppConfig,
  message: WhatsAppMessage
): Promise<WhatsAppResponse> {
  if (MOCK_MODE) {
    console.log(`[MOCK WhatsApp] Sending to ${message.to}`)
    console.log(`[MOCK WhatsApp] Template: ${message.template}`)
    console.log(`[MOCK WhatsApp] Params: ${message.params.join(', ')}`)

    await new Promise((resolve) => setTimeout(resolve, 500))

    return {
      success: true,
      messageId: `MSG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }
  }

  if (config.provider === 'gupshup') {
    return sendViaGupshup(config, message)
  } else if (config.provider === 'twilio') {
    return sendViaTwilio(config, message)
  }

  return { success: false, error: 'Invalid provider' }
}

async function sendViaGupshup(
  config: WhatsAppConfig,
  message: WhatsAppMessage
): Promise<WhatsAppResponse> {
  const url = 'https://api.gupshup.io/failsafe/wam/sendTemplateMessage'

  const params = new URLSearchParams({
    api_key: config.apiKey || '',
    destination: message.to.startsWith('91') ? message.to : `91${message.to}`,
    template_id: message.template,
    params: message.params.join(','),
  })

  try {
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
    })

    const data = await response.json()

    if (data.status === 'success') {
      return { success: true, messageId: data.id }
    } else {
      return { success: false, error: data.message || 'Failed to send' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function sendViaTwilio(
  config: WhatsAppConfig,
  message: WhatsAppMessage
): Promise<WhatsAppResponse> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.apiKey}/Messages.json`

  const body = new URLSearchParams({
    From: `whatsapp:${config.fromPhone}`,
    To: `whatsapp:+${message.to}`,
    ContentSid: config.templateName || '',
    ContentVariables: JSON.stringify(message.params),
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`ACCOUNT_SID:${config.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const data = await response.json()

    if (data.sid) {
      return { success: true, messageId: data.sid }
    } else {
      return { success: false, error: data.message || 'Failed to send' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export const WHATSAPP_TEMPLATES = {
  welcome: {
    id: 'billed_welcome',
    params: ['ownerName', 'shopName', 'siteUrl', 'email'],
  },
  credentials: {
    id: 'billed_credentials',
    params: ['siteUrl', 'email', 'password'],
  },
  dailySummary: {
    id: 'billed_daily_summary',
    params: ['shopName', 'totalSales', 'invoiceCount', 'topItem'],
  },
  lowStock: {
    id: 'billed_low_stock',
    params: ['shopName', 'itemName', 'currentStock', 'reorderLevel'],
  },
  paymentReminder: {
    id: 'billed_payment_reminder',
    params: ['shopName', 'amount', 'dueDate'],
  },
  planExpiry: {
    id: 'billed_plan_expiry',
    params: ['shopName', 'planName', 'expiryDate'],
  },
}

export const formatPhoneNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `91${digits}`
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`
  }
  if (digits.startsWith('91') && digits.length === 12) {
    return digits
  }
  return digits
}
