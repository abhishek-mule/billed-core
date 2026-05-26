import { createHmac, timingSafeEqual } from 'node:crypto'

const UPI_SECRET = process.env.UPI_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret-change-in-prod'

export interface UpiTokenPayload {
  invoiceId: string
  tenantId: string
  amount: number
  upiId: string
  exp: number
}

export function signUpiToken(payload: UpiTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', UPI_SECRET).update(data).digest('hex')
  return `${data}.${signature}`
}

export function verifyUpiToken(token: string): UpiTokenPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null

  const data = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = createHmac('sha256', UPI_SECRET).update(data).digest('hex')
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
