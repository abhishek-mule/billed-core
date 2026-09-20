import crypto from 'crypto'
import { hmacSignHttp } from '@billzo/shared'

/**
 * Signs server-to-worker requests for the raw worker endpoints (B-01).
 * Same HMAC scheme the worker verifies (`worker/src/lib/worker-auth.ts`).
 * Server-side only — never import from client components.
 *
 * Returns null when WORKER_INTERNAL_SECRET is unconfigured; callers must
 * fail closed (503) in that case.
 */
export function workerAuthHeaders(
  method: string,
  path: string,
  body: string,
): Record<string, string> | null {
  const secret = process.env.WORKER_INTERNAL_SECRET
  if (!secret) {
    console.error('[WorkerAuth] WORKER_INTERNAL_SECRET not configured')
    return null
  }
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = crypto.randomUUID()
  const signature = hmacSignHttp(method, path, timestamp, nonce, body, secret)
  return {
    'x-billzo-timestamp': timestamp,
    'x-billzo-nonce': nonce,
    'x-billzo-signature': signature,
  }
}
