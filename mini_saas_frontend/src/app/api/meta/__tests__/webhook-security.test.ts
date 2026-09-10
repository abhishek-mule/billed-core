import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

// B-02/B-03: the Meta webhook verification secret must never be committed,
// echoed in responses, or written to logs. Signature verification must fail
// closed when the app secret is unconfigured.

const COMMITTED_LEAK = 'billzo_meta_verify_2024'

function logFile(): string {
  return path.join(os.tmpdir(), `meta-webhook-security-${process.pid}.log`)
}

async function loadRoute() {
  vi.resetModules()
  process.env.META_WEBHOOK_LOG_FILE = logFile()
  const mod = await import('@/app/api/meta/webhook/route')
  return mod
}

function getRequest(url: string) {
  return new NextRequest(url)
}

function postRequest(body: string, signature: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signature) headers['x-hub-signature-256'] = `sha256=${signature}`
  return new Request('http://localhost/api/meta/webhook', {
    method: 'POST',
    body,
    headers,
  }) as any
}

function hmac(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

describe('meta webhook — B-02/B-03 secret handling + fail-closed signature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET verification rejects with 503 when the verify token is not configured', async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN
    const { GET } = await loadRoute()

    const res = await GET(
      getRequest(
        `http://localhost/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${COMMITTED_LEAK}&hub.challenge=abc`,
      ),
    )

    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain(COMMITTED_LEAK)
  })

  it('GET verification responds 200 only with the configured token', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'correct_token_42'
    const { GET } = await loadRoute()

    const ok = await GET(
      getRequest(
        'http://localhost/api/meta/webhook?hub.mode=subscribe&hub.verify_token=correct_token_42&hub.challenge=challenge_123',
      ),
    )
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('challenge_123')

    const bad = await GET(
      getRequest(
        'http://localhost/api/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge_123',
      ),
    )
    expect(bad.status).toBe(403)
    const badBody = await bad.text()
    expect(badBody).not.toContain('wrong')
    expect(badBody).not.toContain('correct_token_42')
  })

  it('B-02: failure response never echoes the attacker-provided token', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'real_secret'
    const { GET } = await loadRoute()

    const res = await GET(
      getRequest(
        'http://localhost/api/meta/webhook?hub.mode=subscribe&hub.verify_token=ATTACKER_SUPPLIED_TOKEN&hub.challenge=x',
      ),
    )

    expect(res.status).toBe(403)
    const body = await res.text()
    expect(body).not.toContain('ATTACKER_SUPPLIED_TOKEN')
    expect(body).not.toContain('real_secret')
  })

  it('B-03: verification never writes the token to the log file', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'super_secret_verify'
    const { GET } = await loadRoute()

    await GET(
      getRequest(
        'http://localhost/api/meta/webhook?hub.mode=subscribe&hub.verify_token=ANOTHER_TOK&hub.challenge=x',
      ),
    )

    const content = fs.readFileSync(logFile(), 'utf8')
    expect(content).not.toContain('super_secret_verify')
    expect(content).not.toContain('ANOTHER_TOK')
  })

  it('POST rejects with 503 when META_APP_SECRET is unconfigured (fail closed)', async () => {
    process.env.META_APP_SECRET = undefined as any
    delete process.env.META_APP_SECRET
    const { POST } = await loadRoute()

    const res = await POST(postRequest('{"object":"whatsapp_business_account","entry":[]}', 'a'.repeat(64)))

    expect(res.status).toBe(503)
  })

  it('POST rejects unsigned payloads with 401 when configured', async () => {
    process.env.META_APP_SECRET = 'secret'
    const { POST } = await loadRoute()

    const res = await POST(postRequest('{"object":"x"}', null))

    expect(res.status).toBe(401)
  })

  it('POST rejects tampered payloads with 401', async () => {
    process.env.META_APP_SECRET = 'secret'
    const { POST } = await loadRoute()
    const body = '{"object":"x","entry":[]}'

    const res = await POST(postRequest(body, hmac('different_secret', body)))

    expect(res.status).toBe(401)
  })

  it('POST rejects length-mismatched signatures with 401, not 500', async () => {
    process.env.META_APP_SECRET = 'secret'
    const { POST } = await loadRoute()
    const body = '{"object":"x","entry":[]}'

    const res = await POST(postRequest(body, 'short'))

    expect(res.status).toBe(401)
  })

  it('POST accepts a validly signed payload', async () => {
    process.env.META_APP_SECRET = 'secret'
    const { POST } = await loadRoute()
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

    const res = await POST(postRequest(body, hmac('secret', body)))

    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
  })
})