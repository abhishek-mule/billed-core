import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { createRedisClient } from '@/lib/billzo/redis'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: channel, error } = await supabaseAdmin
    .from('messaging_channels')
    .select('provider, connection_state, last_heartbeat_at, last_connected_at, delivery_success_rate, quality_score')
    .eq('id', params.id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  let health: Record<string, any> = {
    connectionState: channel.connection_state,
    isConnected: channel.connection_state === 'connected',
    lastHeartbeatAt: channel.last_heartbeat_at,
    lastConnectedAt: channel.last_connected_at,
    deliverySuccessRate: channel.delivery_success_rate,
    qualityScore: channel.quality_score,
  }

  if (channel.provider === 'baileys') {
    const redis = createRedisClient()
    try {
      const stateRaw = await redis.get(`baileys:state:${tenantId}`)
      if (stateRaw) {
        const state = JSON.parse(stateRaw)
        health = { ...health, ...state }
      }
    } catch {
    } finally {
      await redis.quit()
    }
  }

  return NextResponse.json({ health })
}
