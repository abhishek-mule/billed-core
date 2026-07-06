import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('provider')
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    if (channel.provider === 'baileys') {
      const { writeOutboxEvent } = await import('@/lib/billzo/outbox')
      await writeOutboxEvent({
        idempotencyKey: `whatsapp:unpair:${tenantId}:${Date.now()}`,
        type: 'whatsapp.unpaired',
        tenantId,
        entityId: null,
        payload: { channelId: params.id },
        causationId: null,
        correlationId: `unpair:${tenantId}:${Date.now()}`,
        version: 1,
      })
    }

    await supabaseAdmin
      .from('messaging_channels')
      .update({ connection_state: 'disconnected', updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Channels/Disconnect] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
