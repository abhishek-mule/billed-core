import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const ALLOWED_CHANNEL_TYPES = ['whatsapp', 'sms', 'email']
const ALLOWED_PROVIDERS = ['gupshup', 'twilio', 'msg91']
const ALLOWED_CONFIG_KEYS = ['api_key', 'app_name', 'source_number', 'webhook_url', 'template_id', 'sender_id']

export async function GET(request: NextRequest) {
  const tenantId = getVerifiedTenantIdFromRequest(request)
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('messaging_channels')
    .select('id, channel_type, provider, phone_number, connection_state, quality_score, delivery_success_rate, last_heartbeat_at, last_connected_at, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('priority', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ channels: data || [] })
}

export async function POST(request: NextRequest) {
  const tenantId = getVerifiedTenantIdFromRequest(request)
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await validateJsonBody<{
    channel_type?: string
    provider?: string
    phone_number?: string
    display_name?: string
    priority?: number
    config?: Record<string, any>
  }>(request, {
    fields: {
      channel_type: { type: 'string' },
      provider: { type: 'string' },
      phone_number: { type: 'string' },
      display_name: { type: 'string' },
      priority: { type: 'number' },
      config: { type: 'object' },
    },
  })
  if (body.response) return body.response
  const { channel_type, provider, phone_number, display_name, priority, config } = body.data!

  // Validate enum values
  if (channel_type && !ALLOWED_CHANNEL_TYPES.includes(channel_type)) {
    return NextResponse.json({ error: `Invalid channel_type. Must be one of: ${ALLOWED_CHANNEL_TYPES.join(', ')}` }, { status: 400 })
  }
  if (provider && !ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `Invalid provider. Must be one of: ${ALLOWED_PROVIDERS.join(', ')}` }, { status: 400 })
  }

  // Whitelist config keys to prevent mass assignment
  const sanitizedConfig: Record<string, any> = {}
  if (config && typeof config === 'object') {
    for (const key of ALLOWED_CONFIG_KEYS) {
      if (config[key] !== undefined) sanitizedConfig[key] = config[key]
    }
  }

  const { data, error } = await supabaseAdmin
    .from('messaging_channels')
    .insert({
      tenant_id: tenantId,
      channel_type: channel_type || 'whatsapp',
      provider: provider || 'gupshup',
      phone_number: phone_number || 'unknown',
      display_name: display_name || null,
      priority: priority || 0,
      config: sanitizedConfig,
      is_active: true,
    })
    .select('id, channel_type, provider, phone_number, display_name, connection_state, is_active, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ channel: data }, { status: 201 })
}
