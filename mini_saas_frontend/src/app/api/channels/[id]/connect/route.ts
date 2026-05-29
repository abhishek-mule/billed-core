import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { createRedisClient } from '@/lib/billzo/redis'

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

  await supabaseAdmin
    .from('messaging_channels')
    .update({ connection_state: 'connecting', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (channel.provider === 'baileys') {
    // Trigger Baileys pairing via outbox
    const { writeOutboxEvent } = await import('@/lib/billzo/outbox')
    await writeOutboxEvent({
      idempotencyKey: `whatsapp:pair:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
      type: 'whatsapp.pair.requested',
      tenantId,
      entityId: null,
      payload: { channelId: params.id },
      causationId: null,
      correlationId: `pair:${tenantId}:${Date.now()}`,
      version: 1,
    })
  }

  return NextResponse.json({ success: true, channelId: params.id })
}
