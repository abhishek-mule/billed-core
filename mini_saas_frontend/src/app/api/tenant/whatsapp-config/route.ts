import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/billzo/supabase'
import type { TenantWhatsAppConfig } from '@/lib/billzo/types'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { submitIntent } from '@/lib/authority/transport'

export const dynamic = 'force-dynamic'

const DEFAULT_CONFIG: TenantWhatsAppConfig = {
  autoSend: false,
  paymentLinkEnabled: false,
  paymentLinkExpiry: 7,
  optInMessage: 'Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.',
  templateNames: {},
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabase) {
      return NextResponse.json({ config: DEFAULT_CONFIG })
    }

    const { data, error } = await supabase
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    if (error) {
      console.error('[WhatsAppConfig] GET supabase error:', error.message)
      return NextResponse.json({ config: DEFAULT_CONFIG })
    }

    const config: TenantWhatsAppConfig = data?.whatsapp_config || DEFAULT_CONFIG
    return NextResponse.json({ config })
  } catch (err: any) {
    console.error('[WhatsAppConfig] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await validateJsonBody<{ config: Partial<TenantWhatsAppConfig> }>(request, {
      fields: {
        config: { required: true, type: 'object', message: 'Config object is required' },
      },
    })
    if (body.response) return body.response
    const { config } = body.data!

    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 })
    }

    const { data: existingData, error: fetchError } = await supabase
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    if (fetchError) {
      console.error('[WhatsAppConfig] PUT fetch error:', fetchError.message)
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const existing: TenantWhatsAppConfig = existingData?.whatsapp_config || DEFAULT_CONFIG

    const updated: TenantWhatsAppConfig = {
      ...existing,
      ...config,
      templateNames: { ...existing.templateNames, ...(config.templateNames || {}) },
    }

    if (config.gupshupApiKey === '') updated.gupshupApiKey = undefined
    if (config.gupshupAppName === '') updated.gupshupAppName = undefined
    if (config.sourceNumber === '') updated.sourceNumber = undefined

    const intentResult = await submitIntent({
      intentId: crypto.randomUUID(),
      intentType: 'tenant.update_whatsapp_config',
      intentVersion: 1,
      tenantId,
      actor: `tenant:${tenantId}`,
      source: 'app',
      timestamp: new Date().toISOString(),
      causationId: null,
      correlationId: null,
      payload: { whatsappConfig: updated },
      nonce: crypto.randomUUID(),
    }, 'app')

    if (!intentResult.accepted) {
      console.error('[WhatsAppConfig] Authority rejected update:', intentResult.error)
      return NextResponse.json({ error: 'Authority rejected update' }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: updated })
  } catch (err: any) {
    console.error('[WhatsAppConfig] PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
