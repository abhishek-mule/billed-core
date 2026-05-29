import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = getCookie('bz_tenant')
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
}
