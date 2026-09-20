import { describe, it, expect } from 'vitest'
import {
  signWorkerRequest,
  verifyWorkerRequest,
  WORKER_TIMESTAMP_TOLERANCE_SEC,
} from '../worker-auth'

const SECRET = 'test-worker-internal-secret'

function signed(path = '/api/v1/recovery/override', body = '{"a":1}') {
  const { timestamp, nonce, signature } = signWorkerRequest({
    method: 'POST',
    path,
    body,
    secret: SECRET,
  })
  return { method: 'POST', path, body, timestamp, nonce, signature }
}

describe('worker inter-service auth (B-01)', () => {
  it('accepts a well-formed signature', () => {
    const result = verifyWorkerRequest({ ...signed(), secret: SECRET })
    expect(result).toEqual({ ok: true })
  })

  it('fails closed when the secret is unconfigured', () => {
    const result = verifyWorkerRequest({ ...signed(), secret: null })
    expect(result).toEqual({ ok: false, reason: 'missing_secret' })
  })

  it('rejects missing credentials', () => {
    const base = signed()
    expect(verifyWorkerRequest({ ...base, signature: null, secret: SECRET })).toEqual({
      ok: false,
      reason: 'missing_credentials',
    })
    expect(verifyWorkerRequest({ ...base, timestamp: null, secret: SECRET })).toEqual({
      ok: false,
      reason: 'missing_credentials',
    })
  })

  it('rejects a tampered body', () => {
    const base = signed('/api/v1/recovery/override', '{"invoiceId":"A"}')
    const result = verifyWorkerRequest({
      ...base,
      body: '{"invoiceId":"B"}',
      secret: SECRET,
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a wrong secret', () => {
    const result = verifyWorkerRequest({ ...signed(), secret: 'wrong-secret' })
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rejects a replayed (stale) timestamp', () => {
    const now = Math.floor(Date.now() / 1000)
    const old = String(now - WORKER_TIMESTAMP_TOLERANCE_SEC - 1)
    const { nonce, signature } = signWorkerRequest({
      method: 'POST',
      path: '/api/v1/recovery/override',
      body: '{}',
      secret: SECRET,
      timestamp: old,
    })
    const result = verifyWorkerRequest({
      method: 'POST',
      path: '/api/v1/recovery/override',
      body: '{}',
      timestamp: old,
      nonce,
      signature,
      secret: SECRET,
      nowSec: now,
    })
    expect(result).toEqual({ ok: false, reason: 'stale' })
  })

  it('binds the signature to the path (cross-endpoint replay fails)', () => {
    const base = signed('/api/v1/recovery/override', '{}')
    const result = verifyWorkerRequest({
      ...base,
      path: '/api/v1/recovery/trigger-reminder',
      secret: SECRET,
    })
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' })
  })
})
