import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/billzo/db'
import type { TenantWhatsAppConfig } from '@/lib/billzo/types'

function getTenantId(request: NextRequest): string | null {
  const cookieStore = cookies()
  return cookieStore.get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenant = await db().tenants.get(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const config: TenantWhatsAppConfig = tenant.whatsappConfig || {
      autoSend: false,
      paymentLinkEnabled: false,
      paymentLinkExpiry: 7,
      optInMessage: 'Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.',
      templateNames: {},
    }

    return NextResponse.json({ config })
  } catch (err: any) {
    console.error('[WhatsAppConfig] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { config } = body as { config: Partial<TenantWhatsAppConfig> }

    if (!config) return NextResponse.json({ error: 'Config required' }, { status: 400 })

    const tenant = await db().tenants.get(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const existing: TenantWhatsAppConfig = tenant.whatsappConfig || {
      autoSend: false,
      paymentLinkEnabled: false,
      paymentLinkExpiry: 7,
      optInMessage: 'Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.',
      templateNames: {},
    }

    const updated: TenantWhatsAppConfig = {
      ...existing,
      ...config,
      templateNames: { ...existing.templateNames, ...(config.templateNames || {}) },
    }

    if (config.gupshupApiKey === '') updated.gupshupApiKey = undefined
    if (config.gupshupAppName === '') updated.gupshupAppName = undefined
    if (config.sourceNumber === '') updated.sourceNumber = undefined

    await db().tenants.update(tenantId, {
      whatsappConfig: updated,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, config: updated })
  } catch (err: any) {
    console.error('[WhatsAppConfig] PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}