import crypto from 'crypto'
import type { IntentEnvelope } from './types'
import { canonicalJson } from './canonicalize'

const ALGORITHM = 'sha256'

export function hmacSignEnvelope(
  envelope: Omit<IntentEnvelope, 'signature'>,
  secret: string,
): string {
  const payload = [
    envelope.intentId,
    envelope.timestamp,
    envelope.nonce,
    canonicalJson(envelope.payload),
  ].join('\n')
  return crypto.createHmac(ALGORITHM, secret).update(payload).digest('hex')
}

export function hmacVerify(envelope: IntentEnvelope, secret: string): boolean {
  const { signature, ...rest } = envelope
  const expected = hmacSignEnvelope(rest, secret)
  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export function hmacSignHttp(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string,
  secret: string,
): string {
  const payload = [method, path, timestamp, nonce, body].join('\n')
  return crypto.createHmac(ALGORITHM, secret).update(payload).digest('hex')
}
