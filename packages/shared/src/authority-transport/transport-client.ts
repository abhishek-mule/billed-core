import crypto from 'crypto'
import type { AuthorityConfig } from '../authority-config'
import type { AuthorityResult, IntentSource, InternalIntent } from './types'
import { canonicalJson } from './canonicalize'

class TransportError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: string,
  ) {
    super(message)
    this.name = 'TransportError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface UnsignedEnvelope {
  intentId: string
  intentType: string
  intentVersion: number
  tenantId: string
  actor: string
  source: IntentSource
  timestamp: string
  causationId: string | null
  correlationId: string | null
  payload: Record<string, unknown>
  nonce: string
}

function computeHmac(secret: string, method: string, path: string, timestamp: string, nonce: string, rawBody: string): string {
  const payload = [method, path, timestamp, nonce, rawBody].join('\n')
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function submitAuthorityIntent(
  config: AuthorityConfig,
  intent: InternalIntent,
  source: IntentSource,
): Promise<AuthorityResult> {
  const nonce = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const intentId = crypto.randomUUID()
  const gatewayUrl = config.gatewayUrl
  const timeoutMs = config.transportTimeoutMs
  const retryCount = config.transportRetryCount
  const retryBaseMs = config.transportRetryBaseMs

  const secret = config.hmacSecrets[source]
  if (!secret) {
    return {
      accepted: false,
      intentId,
      decisionId: null,
      error: `No HMAC secret configured for source: ${source}`,
    }
  }

  const envelope: UnsignedEnvelope = {
    intentId,
    intentType: intent.intentType,
    intentVersion: intent.intentVersion ?? 1,
    tenantId: intent.tenantId,
    actor: intent.actor,
    source,
    timestamp,
    causationId: null,
    correlationId: null,
    payload: intent.payload,
    nonce,
  }

  const rawBody = JSON.stringify(envelope)
  const path = '/api/v1/authority/evaluate'
  const signature = computeHmac(secret, 'POST', path, timestamp, nonce, rawBody)

  const signedBody = JSON.stringify({ ...envelope, signature })

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const result = await sendWithTimeout(gatewayUrl, path, signedBody, timeoutMs)
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (!isRetryableError(err) || attempt >= retryCount) break

      await sleep(retryBaseMs * Math.pow(2, attempt))
    }
  }

  return {
    accepted: false,
    intentId,
    decisionId: null,
    error: `Transport failure after ${retryCount + 1} attempts: ${lastError?.message}`,
  }
}

async function sendWithTimeout(
  baseUrl: string,
  path: string,
  body: string,
  timeoutMs: number,
): Promise<AuthorityResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })

    const text = await response.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new TransportError(`Invalid JSON response (${response.status})`, response.status, text)
    }

    if (!response.ok && response.status !== 403 && response.status !== 409 && response.status !== 422) {
      throw new TransportError(`Gateway returned ${response.status}`, response.status, text)
    }

    return parsed as AuthorityResult
  } finally {
    clearTimeout(timer)
  }
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TransportError) {
    const code = err.statusCode
    if (code === undefined) return true
    if (code >= 500) return true
    return false
  }
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof TypeError) return true
  return false
}
