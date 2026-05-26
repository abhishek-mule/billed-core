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

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenantId')
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  }

  const redis = createRedisClient()
  try {
    const [qr, exists] = await Promise.all([
      redis.get(`baileys:qr:${tenantId}`),
      redis.exists(`baileys:auth:${tenantId}`),
    ])

    if (exists) {
      return NextResponse.json({ status: 'connected' })
    }
    if (qr) {
      return NextResponse.json({ status: 'awaiting_scan', qr })
    }
    return NextResponse.json({ status: 'waiting' })
  } finally {
    await redis.quit()
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
