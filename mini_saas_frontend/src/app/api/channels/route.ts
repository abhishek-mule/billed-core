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
    .from('messaging_channels')
    .select('id, channel_type, provider, phone_number, display_name, connection_state, quality_score, delivery_success_rate, last_heartbeat_at, last_connected_at, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('priority', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ channels: data || [] })
}

export async function POST(request: NextRequest) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('messaging_channels')
    .insert({
      tenant_id: tenantId,
      channel_type: body.channel_type || 'whatsapp',
      provider: body.provider || 'gupshup',
      phone_number: body.phone_number || 'unknown',
      display_name: body.display_name || null,
      priority: body.priority || 0,
      config: body.config || {},
      is_active: true,
    })
    .select('id, channel_type, provider, phone_number, display_name, connection_state, is_active, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ channel: data }, { status: 201 })
}
