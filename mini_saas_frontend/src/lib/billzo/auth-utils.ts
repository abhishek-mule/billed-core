const OTP_TTL_MS = 5 * 60 * 1000

export function hashOTP(otp: string, phone: string): string {
  if (typeof window !== 'undefined') {
    throw new Error('hashOTP can only be called on the server')
  }
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(`${phone}:${otp}`).digest('hex')
}

export function verifyOTPHash(
  storedHash: string,
  providedOTP: string,
  phone: string
): boolean {
  if (typeof window !== 'undefined') {
    throw new Error('verifyOTPHash can only be called on the server')
  }
  const hash = hashOTP(providedOTP, phone)
  return timingSafeEqual(storedHash, hash)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  
  if (typeof window === 'undefined') {
    try {
      const crypto = require('crypto')
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
    } catch {
      // Fallback to manual implementation
    }
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function validatePhone(phone: string): { valid: boolean; error?: string } {
  const cleaned = phone.replace(/\D/g, '')

  if (!cleaned) {
    return { valid: false, error: 'Phone number is required' }
  }

  if (cleaned.startsWith('91') && cleaned.length !== 12) {
    return { valid: false, error: 'Invalid Indian phone number' }
  }

  if (!cleaned.startsWith('91') && cleaned.length !== 10) {
    return { valid: false, error: 'Please enter a valid 10-digit mobile number' }
  }

  return { valid: true }
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('91')) return cleaned
  return `91${cleaned}`
}

export function getPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

export function normalizePhone(phone: string): { e164: string; local: string } {
  const local = getPhoneDigits(phone)
  return {
    e164: `91${local}`,
    local,
  }
}

export function normalizePhoneE164(phone: string): string {
  const local = getPhoneDigits(phone)
  return `+91${local}`
}

export interface TenantCreateInput {
  shopName: string
  phone: string
  upiId?: string
  gstin?: string
}

export function isOTPExpired(createdAt: number): boolean {
  return Date.now() - createdAt > OTP_TTL_MS
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function maskPhone(phone: string): string {
  const formatted = formatPhone(phone)
  return `${formatted.slice(0, 3)}******${formatted.slice(-4)}`
}
