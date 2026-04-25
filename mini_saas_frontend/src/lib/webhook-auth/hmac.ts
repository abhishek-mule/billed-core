import crypto from 'crypto'

export function verifyHmacSignature(payload: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const provided = signatureHeader.replace(/^sha256=/i, '').trim()

  if (!provided) return false
  if (provided.length !== expected.length) return false

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}
