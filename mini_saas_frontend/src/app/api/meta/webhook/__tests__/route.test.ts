import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

import { POST } from '../route'

const APP_SECRET = 'test-meta-app-secret'

function sign(body: string): string {
  return crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

describe('/api/meta/webhook POST — whatsapp_events NOT NULL contract', () => {
  let whatsappEventsBodies: Array<Record<string, unknown>>

  function mockRest() {
    whatsappEventsBodies = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || 'GET').toUpperCase()

      if (url.includes('/rest/v1/whatsapp_events') && method === 'POST') {
        whatsappEventsBodies.push(JSON.parse(String(init?.body)))
        return new Response(null, { status: 201 })
      }
      if (url.includes('/rest/v1/customers')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (method === 'POST') {
        return new Response(null, { status: 201 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }))
  }

  beforeEach(() => {
    process.env.META_APP_SECRET = APP_SECRET
    mockRest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.META_APP_SECRET
  })

  async function postInbound(sender: string | undefined) {
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '1229387453587153', waba_id: 'bw' },
                messages: [
                  sender
                    ? { from: sender, id: 'wamid.TEST.1', timestamp: '1700000000', type: 'text', text: { body: 'Hello' } }
                    : { id: 'wamid.TEST.1', timestamp: '1700000000', type: 'text', text: { body: 'Hello' } },
                ],
              },
            },
          ],
        },
      ],
    })

    const request = new NextRequest('https://app.billzo.in/api/meta/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${sign(payload)}`,
      },
      body: payload,
    })
    return POST(request)
  }

  it('inbound insert supplies every NOT NULL whatsapp_events column', async () => {
    const res = await postInbound('919371343891')
    expect(res.status).toBe(200)

    expect(whatsappEventsBodies).toHaveLength(1)
    const row = whatsappEventsBodies[0]
    expect(row).toMatchObject({
      direction: 'inbound',
      tenant_id: 'meta_webhook',
      provider_message_id: 'wamid.TEST.1',
      phone: '919371343891',
      conversation_id: 'conv_919371343891',
    })
    expect(typeof row.billzo_message_id).toBe('string')
    expect(String(row.billzo_message_id).length).toBeGreaterThan(0)
    expect(typeof row.id).toBe('string')
    expect(String(row.id).length).toBeGreaterThan(0)
    expect(typeof row.occurred_at).toBe('string')
  })

  it('falls back to conv_unknown when the sender phone is missing', async () => {
    const res = await postInbound(undefined)
    expect(res.status).toBe(200)

    const row = whatsappEventsBodies[0]
    expect(row.conversation_id).toBe('conv_unknown')
    expect(typeof row.billzo_message_id).toBe('string')
    expect(String(row.billzo_message_id).length).toBeGreaterThan(0)
  })
})