import { NextResponse } from 'next/server'
import { sendWhatsAppMessage, WHATSAPP_TEMPLATES, formatPhoneNumber } from '@/lib/whatsapp'

export async function POST(request: Request) {
  try {
    const { template, phone, params } = await request.json()

    if (!template || !phone) {
      return NextResponse.json(
        { success: false, error: 'Template and phone are required' },
        { status: 400 }
      )
    }

    const templateConfig = WHATSAPP_TEMPLATES[template as keyof typeof WHATSAPP_TEMPLATES]
    if (!templateConfig) {
      return NextResponse.json(
        { success: false, error: 'Invalid template name' },
        { status: 400 }
      )
    }

    if (!params || params.length !== templateConfig.params.length) {
      return NextResponse.json(
        { success: false, error: `Template requires ${templateConfig.params.length} parameters` },
        { status: 400 }
      )
    }

    const config = {
      provider: (process.env.WHATSAPP_PROVIDER as 'gupshup' | 'twilio') || 'gupshup',
      apiKey: process.env.GUPSHUP_API_KEY || process.env.TWILIO_ACCOUNT_SID || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      fromPhone: process.env.TWILIO_FROM_NUMBER || '',
      templateName: templateConfig.id,
    }

    const result = await sendWhatsAppMessage(config, {
      to: formatPhoneNumber(phone),
      template: templateConfig.id,
      params,
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'WhatsApp message sent successfully',
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('WhatsApp send error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send WhatsApp message' },
      { status: 500 }
    )
  }
}
