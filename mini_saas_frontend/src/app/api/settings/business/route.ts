import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tenantId = getCookie('bz_tenant')
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
}

export async function PATCH(request: NextRequest) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const allowedFields = [
    'autoSend', 'paymentLinkEnabled', 'paymentLinkExpiry',
    'optInMessage', 'templateNames', 'operatingHours', 'escalationPolicy',
  ]

  const updates: Record<string, any> = {}
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key]
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
}
