import { WhatsAppConnection } from '@/lib/billzo/whatsapp-connection'

const GUPSHUP_API_URL = process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'

export interface SendMessageOptions {
  previewUrl?: boolean
}

export interface SendTemplateOptions {
  language?: { code: string; policy?: string }
  components?: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>
}

export async function sendWhatsAppMessage(
  connection: WhatsAppConnection,
  to: string,
  text: string,
  options: SendMessageOptions = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!connection.accessToken) {
    return { success: false, error: 'No access token available' }
  }

  const cleanTo = to.replace(/\D/g, '')
  const e164 = cleanTo.startsWith('91') ? `+${cleanTo}` : `+91${cleanTo}`

  try {
    const response = await fetch(`${process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'}/sm/api/v1/msg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.accessToken}`,
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        source: connection.phoneNumberId,
        destination: e164,
        message: {
          type: 'text',
          text,
          preview_url: options.previewUrl ?? false,
        },
        src_name: connection.displayName,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[GupshupAdapter] Send failed:', data)
      return { success: false, error: data.message || 'Failed to send message' }
    }

    return { success: true, messageId: data.message_id }
  } catch (error: any) {
    console.error('[GupshupAdapter] Send error:', error)
    return { success: false, error: error.message }
  }
}

export async function sendWhatsAppTemplate(
  connection: WhatsAppConnection,
  to: string,
  templateName: string,
  language?: { code: string; policy?: string },
  components?: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!connection.accessToken) {
    return { success: false, error: 'No access token available' }
  }

  const cleanTo = to.replace(/\D/g, '')
  const e164 = cleanTo.startsWith('91') ? `+${cleanTo}` : `+91${cleanTo}`

  try {
    const response = await fetch(`${process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'}/sm/api/v1/template/msg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.accessToken}`,
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        source: connection.phoneNumberId,
        destination: to.replace(/\D/g, ''),
        template: {
          name: templateName,
          language: language || { code: 'en' },
          components: components || [],
        },
        src_name: connection.displayName,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[GupshupAdapter] Template send failed:', data)
      return { success: false, error: data.message || 'Failed to send template' }
    }

    return { success: true, messageId: data.message_id }
  } catch (error: any) {
    console.error('[GupshupAdapter] Template send error:', error)
    return { success: false, error: error.message }
  }
}

export async function registerPhoneNumber(
  accessToken: string,
  phoneNumberId: string,
  displayName: string,
  verificationCode: string,
  method: 'voice' | 'sms' = 'voice'
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'}/sm/api/v1/app/phone/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        phone_number_id: phoneNumberId,
        display_name: displayName,
        verification_code: verificationCode,
        method,
      }),
    })

    const data = await response.json()
    return { success: response.ok, error: data.message }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getPhoneNumberStatus(
  accessToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(`${process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'}/sm/api/v1/app/phone/${phoneNumberId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const data = await response.json()
    return { success: response.ok, data: response.ok ? data : undefined, error: data.message }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function submitTemplate(
  accessToken: string,
  wabaId: string,
  template: {
    name: string
    language: string
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
    components: Array<{
      type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
      format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
      text?: string
      example?: { header_handles?: string[] }
      buttons?: Array<{
        type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
        text: string
        url?: string
        phone_number?: string
      }>
    }>
  }
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  try {
    const response = await fetch(`${process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'}/sm/api/v1/template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        waba_id: wabaId,
        ...template,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.message || data.error }
    }

    return { success: true, templateId: data.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}