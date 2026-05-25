import { NextRequest } from 'next/server'
import { getScanJob } from '@/lib/billzo/scan-job-store'

export const dynamic = 'force-dynamic'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function GET(request: NextRequest) {
  const scanJobId = request.nextUrl.searchParams.get('scanJobId')
  if (!scanJobId) {
    return new Response('scanJobId is required', { status: 400 })
  }

  const job = getScanJob(scanJobId)
  if (!job) {
    return new Response('scan job not found', { status: 404 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let index = 0
      let closed = false

      const send = (data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      request.signal.addEventListener('abort', () => {
        closed = true
        controller.close()
      })

      send({ type: 'connected', scanJobId })

      while (!closed) {
        const current = getScanJob(scanJobId)
        if (!current) {
          send({ type: 'error', error: 'scan job missing' })
          break
        }

        while (index < current.events.length) {
          send(current.events[index])
          index += 1
        }

        if ((current.status === 'completed' || current.status === 'failed') && index >= current.events.length) {
          break
        }

        await delay(200)
      }

      if (!closed) controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
