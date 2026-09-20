import crypto from 'crypto'
import { hmacSignHttp } from '@billzo/shared'

/**
 * Inter-service auth for the raw worker HTTP endpoints in `worker/index.ts`
 * (override, trigger-reminder, whatsapp pair). Same HMAC scheme as the
 * authority gateway (`hmacSignHttp`), but a dedicated secret so rotation and
 * blast radius stay independent of intent-envelope traffic.
 *
 * Fail-closed contract (B-01):
 *  - secret unconfigured  → caller must answer 503 (never process)
 *  - missing credentials   → 401
 *  - stale timestamp       → 401 (5-minute replay window)
 *  - bad signature         → 403
 */

export const WORKER_SIGNATURE_HEADER = 'x-billzo-signature'
export const WORKER_TIMESTAMP_HEADER = 'x-billzo-timestamp'
export const WORKER_NONCE_HEADER = 'x-billzo-nonce'
export const WORKER_TIMESTAMP_TOLERANCE_SEC = 300

export function getWorkerInternalSecret(): string | null {
  const secret = process.env.WORKER_INTERNAL_SECRET
  return secret && secret.length > 0 ? secret : null
}

export type WorkerAuthFailure =
  | 'missing_secret'
  | 'missing_credentials'
  | 'stale'
  | 'invalid_signature'

export function signWorkerRequest(args: {
  method: string
  path: string
  body: string
  secret: string
  timestamp?: string
  nonce?: string
}): { timestamp: string; nonce: string; signature: string } {
  const timestamp = args.timestamp ?? String(Math.floor(Date.now() / 1000))
  const nonce = args.nonce ?? crypto.randomUUID()
  const signature = hmacSignHttp(args.method, args.path, timestamp, nonce, args.body, args.secret)
  return { timestamp, nonce, signature }
}

export function verifyWorkerRequest(args: {
  method: string
  path: string
  body: string
  timestamp: string | null | undefined
  nonce: string | null | undefined
  signature: string | null | undefined
  secret: string | null | undefined
  nowSec?: number
}): { ok: true } | { ok: false; reason: WorkerAuthFailure } {
  if (!args.secret) return { ok: false, reason: 'missing_secret' }
  if (!args.timestamp || !args.nonce || !args.signature) {
    return { ok: false, reason: 'missing_credentials' }
  }

  const now = args.nowSec ?? Math.floor(Date.now() / 1000)
  const ts = Number.parseInt(args.timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WORKER_TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, reason: 'stale' }
  }

  const expected = hmacSignHttp(args.method, args.path, args.timestamp, args.nonce, args.body, args.secret)
  if (expected.length !== args.signature.length) return { ok: false, reason: 'invalid_signature' }
  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(args.signature))
  return valid ? { ok: true } : { ok: false, reason: 'invalid_signature' }
}
