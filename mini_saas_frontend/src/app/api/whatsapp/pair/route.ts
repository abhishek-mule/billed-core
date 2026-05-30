import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { createRedisClient } from '@/lib/billzo/redis'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await writeOutboxEvent({
    idempotencyKey: `whatsapp:pair:${tenantId}:${new Date().toISOString().slice(0, 10)}`,
    type: 'whatsapp.pair.requested',
    tenantId,
    entityId: null,
    payload: {},
    causationId: null,
    correlationId: `pair:${tenantId}:${Date.now()}`,
    version: 1,
  })

  return NextResponse.json({ success: true })
}

async function tryRedisOp<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = await fn()
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  }

  const redisResult = await tryRedisOp(() => {
    const r = createRedisClient()
    return r
  })
  if (!redisResult.ok) {
    return NextResponse.json({ status: 'waiting', connectionState: 'disconnected', health: null })
  }

  const redis = redisResult.value
  try {
    const [qr, exists, stateRaw] = await Promise.all([
      tryRedisOp(() => redis.get(`baileys:qr:${tenantId}`)),
      tryRedisOp(() => redis.exists(`baileys:auth:${tenantId}`)),
      tryRedisOp(() => redis.get(`baileys:state:${tenantId}`)),
    ])

    let connectionState = 'disconnected'
    let health: Record<string, any> | null = null

    if (stateRaw.ok && stateRaw.value) {
      try {
        const parsed = JSON.parse(stateRaw.value)
        connectionState = parsed.connectionState || connectionState
        health = {
          lastHeartbeatAt: parsed.lastHeartbeatAt || null,
          lastConnectedAt: parsed.lastConnectedAt || null,
          deliverySuccessRate: parsed.deliverySuccessRate || null,
          error: parsed.error || null,
        }
      } catch {}
    }

    if (exists.ok && exists.value && connectionState === 'disconnected') {
      connectionState = 'connected'
    }

    if (qr.ok && qr.value) {
      return NextResponse.json({ status: 'awaiting_scan', qr: qr.value, connectionState, health })
    }
    return NextResponse.json({ status: connectionState === 'connected' ? 'connected' : 'waiting', connectionState, health })
  } finally {
    await redis.quit().catch(() => {})
  }
}

export async function DELETE(request: NextRequest) {
  const tenantId = getCookie('bz_tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { tenantId: targetTenant } = body

  await writeOutboxEvent({
    idempotencyKey: `whatsapp:unpair:${tenantId}:${Date.now()}`,
    type: 'whatsapp.unpaired',
    tenantId: targetTenant || tenantId,
    entityId: null,
    payload: {},
    causationId: null,
    correlationId: `unpair:${tenantId}:${Date.now()}`,
    version: 1,
  })

  return NextResponse.json({ success: true })
}
