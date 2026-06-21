import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const updates: Record<string, any> = {}
    if (body.display_name !== undefined) updates.display_name = body.display_name
    if (body.provider !== undefined) updates.provider = body.provider
    if (body.phone_number !== undefined) updates.phone_number = body.phone_number
    if (body.config !== undefined) updates.config = body.config
    if (body.is_active !== undefined) updates.is_active = body.is_active
    if (body.priority !== undefined) updates.priority = body.priority
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
    const tenantId = request.cookies.get('bz_tenant')?.value
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
