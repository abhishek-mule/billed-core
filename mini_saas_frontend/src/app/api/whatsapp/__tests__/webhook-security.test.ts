import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// Gupshup/WhatsApp webhook must fail closed: missing secret -> 503, missing or
// tampered signature -> 401. This mirrors the Meta webhook hardening (B-02/B-03).

async function loadRoute() {
  vi.resetModules()
  vi.mock('@/lib/billzo/supabase-admin', () => ({
    supabaseAdmin: { from: vi.fn() },
  }))
  const mod = await import('@/app/api/whatsapp/webhook/route')
  return mod
}

function postRequest(body: string, signature: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signature) headers['x-gupshup-signature'] = signature
  return new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    body,
    headers,
  })
}

function hmac(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

describe('whatsapp webhook — fail-closed signature verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST rejects with 503 when GUPSHUP_WEBHOOK_SECRET is unconfigured (fail closed)', async () => {
    delete process.env.GUPSHUP_WEBHOOK_SECRET
    const { POST } = await loadRoute()

    const res = await POST(postRequest('{"event":"message"}', 'a'.repeat(64)))

    expect(res.status).toBe(503)
  })

  it('POST rejects unsigned payloads with 401 when configured', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = 'secret'
    const { POST } = await loadRoute()

    const res = await POST(postRequest('{"event":"message"}', null))

    expect(res.status).toBe(401)
  })

  it('POST rejects tampered payloads with 401', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = 'secret'
    const { POST } = await loadRoute()
    const body = '{"event":"message","data":{}}'

    const res = await POST(postRequest(body, hmac('different_secret', body)))

    expect(res.status).toBe(401)
  })

  it('POST rejects length-mismatched signatures with 401, not 500', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = 'secret'
    const { POST } = await loadRoute()
    const body = '{"event":"message","data":{}}'

    const res = await POST(postRequest(body, 'short'))

    expect(res.status).toBe(401)
  })

  it('POST accepts a validly signed unrecognized payload shape', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = 'secret'
    const { POST } = await loadRoute()
    const body = JSON.stringify({ event: 'message', data: { phone_number_id: 'x' } })

    const res = await POST(postRequest(body, hmac('secret', body)))

    expect(res.status).toBe(200)
  })
})