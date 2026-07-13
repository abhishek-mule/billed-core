import { NextRequest, NextResponse } from 'next/server'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const body = await request.json().catch(() => ({}))
    const method: 'qr' | 'pairing' = body.method === 'pairing' ? 'pairing' : 'qr'
    const phoneNumber = body.phoneNumber || null

    const correlationId = `pair:${tenantId}:${Date.now()}`
    const eventId = await writeOutboxEvent({
      idempotencyKey: `whatsapp:pair:${tenantId}:${Date.now()}`,
      type: 'whatsapp.pair.requested',
      tenantId: tenantId!,
      entityId: null,
      payload: { method, phone: phoneNumber },
      causationId: null,
      correlationId,
      version: 1,
    })

    console.log('[WhatsApp/Pair] Outbox event written:', eventId, method, phoneNumber ? '(with phone)' : '(no phone)')
    return NextResponse.json({ success: true, eventId, correlationId, method })
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

  const workerUrl = process.env.WORKER_API_URL
  if (!workerUrl) {
    console.error('[WhatsApp/Pair] WORKER_API_URL not set')
    return NextResponse.json({ status: 'waiting', connectionState: 'disconnected', health: null, error: 'Worker not configured' })
  }

  try {
    const res = await fetch(`${workerUrl}/api/whatsapp/pair/${tenantId}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error('[WhatsApp/Pair] Worker returned', res.status)
      return NextResponse.json({ status: 'waiting', connectionState: 'disconnected', health: null })
    }
    const data = await res.json()
    return NextResponse.json(data)
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
