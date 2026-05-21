import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/billzo/supabase'
import type { TenantWhatsAppConfig } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  const cookieStore = cookies()
  return cookieStore.get('bz_tenant')?.value || null
}

const DEFAULT_CONFIG: TenantWhatsAppConfig = {
  autoSend: false,
  paymentLinkEnabled: false,
  paymentLinkExpiry: 7,
  optInMessage: 'Hi {{name}}, you have been added as a customer. We may send you WhatsApp updates. Reply YES to opt in.',
  templateNames: {},
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
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
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { config } = body as { config: Partial<TenantWhatsAppConfig> }

    if (!config) return NextResponse.json({ error: 'Config required' }, { status: 400 })

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

    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        whatsapp_config: updated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[WhatsAppConfig] PUT update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: updated })
  } catch (err: any) {
    console.error('[WhatsAppConfig] PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
