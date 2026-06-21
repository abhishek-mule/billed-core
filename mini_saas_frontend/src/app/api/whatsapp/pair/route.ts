import { NextRequest, NextResponse } from 'next/server'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { createRedisClient } from '@/lib/billzo/redis'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const correlationId = `pair:${tenantId}:${Date.now()}`
    const eventId = await writeOutboxEvent({
      idempotencyKey: `whatsapp:pair:${tenantId}:${Date.now()}`,
      type: 'whatsapp.pair.requested',
      tenantId: tenantId!,
      entityId: null,
      payload: {},
      causationId: null,
      correlationId,
      version: 1,
    })

    console.log('[WhatsApp/Pair] Outbox event written:', eventId)
    return NextResponse.json({ success: true, eventId, correlationId })
  } catch (error: any) {
    console.error('[WhatsApp/Pair] POST Error:', error.message, error.stack)
    return NextResponse.json({
      error: `Failed to start pairing: ${error.message || 'Unknown error'}`,
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = request.nextUrl.searchParams.get('tenantId') || auth.tenantId
  if (!tenantId) {
    return errorResponse('tenantId required', 400)
  }

  const redis = createRedisClient()

  try {
    const [qr, exists, stateRaw] = await Promise.all([
      redis.get(`baileys:qr:${tenantId}`).catch(() => null),
      redis.exists(`baileys:creds:${tenantId}`).catch(() => null),
      redis.get(`baileys:state:${tenantId}`).catch(() => null),
    ])

    let connectionState = 'disconnected'
    let health: Record<string, any> | null = null

    if (stateRaw) {
      try {
        const parsed = JSON.parse(stateRaw)
        connectionState = parsed.connectionState || connectionState
        health = {
          lastHeartbeatAt: parsed.lastHeartbeatAt || null,
          lastConnectedAt: parsed.lastConnectedAt || null,
          deliverySuccessRate: parsed.deliverySuccessRate || null,
          error: parsed.error || null,
        }
      } catch {}
    }

    if (exists && connectionState === 'disconnected') {
      connectionState = 'connected'
    }

    if (qr) {
      return NextResponse.json({ status: 'awaiting_scan', qr, connectionState, health } as const)
    }
    const connStatus: 'connected' | 'waiting' = connectionState === 'connected' ? 'connected' : 'waiting'
    return NextResponse.json({ status: connStatus, connectionState, health })
  } catch (error: any) {
    console.error('[WhatsApp/Pair] GET Error:', error)
    return NextResponse.json({ status: 'waiting', connectionState: 'disconnected', health: null, error: error.message })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const body = await request.json().catch(() => ({}))
    const { tenantId: targetTenant } = body

    await writeOutboxEvent({
      idempotencyKey: `whatsapp:unpair:${tenantId}:${Date.now()}`,
      type: 'whatsapp.unpaired',
      tenantId: targetTenant || tenantId!,
      entityId: null,
      payload: {},
      causationId: null,
      correlationId: `unpair:${tenantId}:${Date.now()}`,
      version: 1,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[WhatsApp/Pair] DELETE Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
