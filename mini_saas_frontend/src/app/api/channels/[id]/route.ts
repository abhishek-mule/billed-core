import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const ALLOWED_CONFIG_KEYS = ['api_key', 'app_name', 'source_number', 'webhook_url', 'template_id', 'sender_id']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await validateJsonBody<{
      display_name?: string
      provider?: string
      phone_number?: string
      config?: Record<string, any>
      is_active?: boolean
      priority?: number
    }>(request, {
      fields: {
        display_name: { type: 'string' },
        provider: { type: 'string' },
        phone_number: { type: 'string' },
        config: { type: 'object' },
        is_active: { type: 'boolean' },
        priority: { type: 'number' },
      },
    })
    if (body.response) return body.response
    const { display_name, provider, phone_number, config, is_active, priority } = body.data!

    const updates: Record<string, any> = {}
    if (display_name !== undefined) updates.display_name = display_name
    if (provider !== undefined) updates.provider = provider
    if (phone_number !== undefined) updates.phone_number = phone_number
    if (config !== undefined) {
      const sanitizedConfig: Record<string, any> = {}
      for (const key of ALLOWED_CONFIG_KEYS) {
        if (config[key] !== undefined) sanitizedConfig[key] = config[key]
      }
      updates.config = sanitizedConfig
    }
    if (is_active !== undefined) updates.is_active = is_active
    if (priority !== undefined) updates.priority = priority
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('messaging_channels')
      .update(updates)
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
      .select('id, channel_type, provider, phone_number, display_name, connection_state, is_active, config')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ channel: data })
  } catch (err: any) {
    console.error('[Channels PATCH] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabaseAdmin
      .from('messaging_channels')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('tenant_id', tenantId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Channels DELETE] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
