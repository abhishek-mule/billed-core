import { Hono } from 'hono'
import crypto from 'crypto'
import { evaluate, type AuthorityCoreConfig } from './core'
import { NonceStore } from './nonces'
import type { IntentEnvelope, IntentSource } from './schemas'

const SOURCE_SECRETS: Record<string, string> = {
  n8n_prod: process.env.AUTH_N8N_SECRET ?? 'dev-secret-n8n',
  worker: process.env.AUTH_WORKER_SECRET ?? 'dev-secret-worker',
  internal_worker: process.env.AUTH_INTERNAL_SECRET ?? 'dev-secret-internal',
}

export function createAuthorityGateway(config: AuthorityCoreConfig): Hono {
  const app = new Hono()
  const nonces = new NonceStore()

  app.get('/health', (c) => c.json({ status: 'ok', service: 'authority-gateway' }))

  app.post('/api/v1/authority/evaluate', async (c) => {
    const body: IntentEnvelope = await c.req.json()

    // 1. Nonce replay check
    if (!nonces.checkAndMark(body.nonce).valid) {
      return c.json({ accepted: false, intentId: body.intentId, decisionId: null, decision: null, error: 'nonce replay' }, 409)
    }

    // 2. Signature verification
    const secret = SOURCE_SECRETS[body.source]
    if (!secret) {
      return c.json({ accepted: false, intentId: body.intentId, decisionId: null, decision: null, error: `unknown source: ${body.source}` }, 403)
    }

    const { signature: receivedSig, ...bodyToSign } = body
    const method = c.req.method
    const path = c.req.path
    const rawBody = JSON.stringify(bodyToSign)
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(method + path + body.timestamp + body.nonce + rawBody)
      .digest('hex')

    const sigBuf = Buffer.from(receivedSig)
    const expectedBuf = Buffer.from(expectedSig)
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return c.json({ accepted: false, intentId: body.intentId, decisionId: null, decision: null, error: 'invalid signature' }, 403)
    }

    // 3. Evaluate
    const result = await evaluate(body, config)
    const status = result.accepted ? 200 : 422
    return c.json(result, status)
  })

  return app
}
