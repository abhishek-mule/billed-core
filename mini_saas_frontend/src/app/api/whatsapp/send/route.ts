import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getWhatsAppConnectionByTenant } from '@/lib/billzo/whatsapp-connection'
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/billzo/gupshup-adapter'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { to, type = 'text', text, template, language, components, previewUrl } = body

    if (!to) {
      return NextResponse.json({ error: 'Recipient phone number required' }, { status: 400 })
    }

    const connection = await getWhatsAppConnectionByTenant(tenantId)
    if (!connection || connection.connectionStatus !== 'connected') {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 })
    }

    if (type === 'template' && template) {
      return NextResponse.json(
        await sendWhatsAppTemplate(connection, to, template, language, components)
      )
    }

    return NextResponse.json(
      await sendWhatsAppMessage(connection, to, text, { previewUrl })
    )
  } catch (error: any) {
    console.error('[WhatsAppSend] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to send message' }, { status: 500 })
  }
}