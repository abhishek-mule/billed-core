import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage, WHATSAPP_TEMPLATES, formatPhoneNumber } from '@/lib/whatsapp'
import { query } from '@/lib/db/client'
import { generateId } from '@/lib/db/encryption'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { template, phone, params, invoiceId, tenantId } = body

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

    // Create message record for tracking
    const messageId = generateId('WA')
    
    if (tenantId) {
      await query(
        `INSERT INTO whatsapp_messages (id, tenant_id, invoice_id, phone, message_text, status, attempts, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', 1, NOW())`,
        [messageId, tenantId, invoiceId || null, phone, JSON.stringify(params)]
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
      // Update message status
      if (tenantId) {
        await query(
          `UPDATE whatsapp_messages SET status = 'SENT', sent_at = NOW() WHERE id = $1`,
          [messageId]
        )
      }
      
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        trackingId: messageId,
        message: 'WhatsApp message sent successfully',
      })
    } else {
      // Mark as failed
      if (tenantId) {
        await query(
          `UPDATE whatsapp_messages SET status = 'FAILED', error_message = $1, attempts = attempts + 1 WHERE id = $2`,
          [result.error, messageId]
        )
      }
      
      return NextResponse.json(
        { success: false, error: result.error, trackingId: messageId },
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

// Webhook for WhatsApp delivery status updates
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { messageId, status, deliveredAt } = body

    if (!messageId || !status) {
      return NextResponse.json({ error: 'Message ID and status required' }, { status: 400 })
    }

    // Valid statuses: SENT, DELIVERED, READ, FAILED
    const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    await query(
      `UPDATE whatsapp_messages SET 
        status = $1, 
        delivered_at = $2,
        updated_at = NOW() 
       WHERE id = $3`,
      [status, deliveredAt || null, messageId]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}