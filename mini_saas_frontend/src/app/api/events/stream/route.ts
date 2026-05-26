import { NextRequest } from 'next/server'
import { db } from '@/lib/billzo/db'
import { createRedisSubscriber } from '@/lib/billzo/redis'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const tenantId =
    request.nextUrl.searchParams.get('tenantId') ||
    request.cookies.get('bz_tenant')?.value ||
    request.headers.get('x-tenant-id')

  if (!tenantId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const encoder = new TextEncoder()
  let isClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        if (isClosed) return
        const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          isClosed = true
        }
      }

      sendEvent('connected', { timestamp: Date.now() })

      let redisSub: Awaited<ReturnType<typeof createRedisSubscriber>> | null = null

      try {
        redisSub = createRedisSubscriber()
        await redisSub.subscribe(`events:${tenantId}`)
        redisSub.on('message', (_channel, message) => {
          try {
            const parsed = JSON.parse(message)
            sendEvent(parsed.type, parsed.data)
          } catch {
            // ignore malformed messages
          }
        })
      } catch {
        console.warn('[SSE] Redis pub/sub unavailable, falling back to Dexie hooks only')
      }

      const database = db()

      const onInvoiceCreate = (_primKey: any, obj: any) => {
        if (obj.tenantId !== tenantId) return
        sendEvent('invoice.created', {
          invoiceId: obj.id,
          customerName: obj.customerName,
          total: obj.total,
          status: obj.status,
        })
      }

      const onPaymentCreate = (_primKey: any, obj: any) => {
        if (obj.tenantId !== tenantId) return
        sendEvent('payment.success', {
          paymentId: obj.id,
          invoiceId: obj.invoiceId,
          amount: obj.amount,
          provider: obj.provider,
        })
      }

      const onWhatsappCreate = (_primKey: any, obj: any) => {
        if (obj.tenantId !== tenantId) return
        sendEvent('whatsapp.sent', {
          eventId: obj.id,
          invoiceId: obj.invoiceId,
          status: obj.status,
          messageType: obj.messageType,
        })
      }

      database.invoices.hook('creating', onInvoiceCreate)
      database.payments.hook('creating', onPaymentCreate)
      database.whatsappEvents.hook('creating', onWhatsappCreate)

      const heartbeat = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeat)
          return
        }
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 30000)

      request.signal.addEventListener('abort', async () => {
        isClosed = true
        clearInterval(heartbeat)
        if (redisSub) {
          try {
            await redisSub.unsubscribe(`events:${tenantId}`)
            redisSub.disconnect()
          } catch {
            // ignore cleanup errors
          }
        }
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
