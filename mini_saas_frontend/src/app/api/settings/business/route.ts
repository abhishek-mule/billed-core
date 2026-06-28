import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { validateJsonBody } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const config = (data?.whatsapp_config || {}) as Record<string, any>

    return NextResponse.json({
      autoSend: config.autoSend ?? false,
      paymentLinkEnabled: config.paymentLinkEnabled ?? false,
      paymentLinkExpiry: config.paymentLinkExpiry ?? 7,
      optInMessage: config.optInMessage ?? 'Hi {{name}}, you have been added as a customer.',
      templateNames: config.templateNames ?? {},
      operatingHours: config.operatingHours ?? null,
      escalationPolicy: config.escalationPolicy ?? null,
    })
  } catch (err: any) {
    console.error('[SettingsBusiness GET] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await validateJsonBody(request)
    if (body.response) return body.response

    const allowedFields = [
      'autoSend', 'paymentLinkEnabled', 'paymentLinkExpiry',
      'optInMessage', 'templateNames', 'operatingHours', 'escalationPolicy',
    ]

    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (body.data![key] !== undefined) {
        updates[key] = body.data![key]
      }
    }

    const { data: current } = await supabaseAdmin
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    const currentConfig = (current?.whatsapp_config || {}) as Record<string, any>
    const newConfig = { ...currentConfig, ...updates }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ whatsapp_config: newConfig })
      .eq('id', tenantId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: newConfig })
  } catch (err: any) {
    console.error('[SettingsBusiness PATCH] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
