import { createHmac, timingSafeEqual } from 'node:crypto'

function requireUpiSecret(): string {
  const secret = process.env.UPI_SIGNING_SECRET
  // Fail closed: falling back to the service-role key reuses a master key for
  // payment-link signing, and a hardcoded dev secret makes links forgeable.
  // Misconfiguration must surface loudly, never silently mint weak tokens.
  if (!secret) throw new Error('[BillZo] UPI_SIGNING_SECRET env var is required')
  return secret
}

export interface UpiTokenPayload {
  invoiceId: string
  tenantId: string
  amount: number
  upiId: string
  exp: number
}

export function signUpiToken(payload: UpiTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', requireUpiSecret()).update(data).digest('hex')
  return `${data}.${signature}`
}

export function verifyUpiToken(token: string): UpiTokenPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null

  const data = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = createHmac('sha256', requireUpiSecret()).update(data).digest('hex')
  if (expected.length !== signature.length) return null

  try {
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (!timingSafeEqual(sigBuf, expBuf)) return null
  } catch {
    return null
  }

  let payload: UpiTokenPayload
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString())
  } catch {
    return null
  }

  if (payload.exp && Date.now() > payload.exp) return null

  return payload
}
