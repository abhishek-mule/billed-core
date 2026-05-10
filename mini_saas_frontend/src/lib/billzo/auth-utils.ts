import type { PlanType } from './plan-limits'

export interface PhoneOTPResult {
  success: boolean
  error?: string
}

export interface VerifyOTPResult {
  success: boolean
  userId?: string
  phone?: string
  error?: string
}

export interface SessionUser {
  userId: string
  phone: string
  createdAt: string
}

const OTP_TTL_MS = 5 * 60 * 1000

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function hashOTP(otp: string, phone: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(`${phone}:${otp}`).digest('hex')
}

export function verifyOTPHash(
  storedHash: string,
  providedOTP: string,
  phone: string
): boolean {
  const hash = hashOTP(providedOTP, phone)
  return timingSafeEqual(storedHash, hash)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export function isOTPExpired(createdAt: number): boolean {
  return Date.now() - createdAt > OTP_TTL_MS
}

export function validatePhone(phone: string): { valid: boolean; error?: string } {
  const cleaned = phone.replace(/\D/g, '')

  if (!cleaned) {
    return { valid: false, error: 'Phone number is required' }
  }

  if (cleaned.startsWith('91') && cleaned.length !== 12) {
    return { valid: false, error: 'Invalid Indian phone number' }
  }

  if (!cleaned.startsWith('91') && cleaned.length < 10) {
    return { valid: false, error: 'Invalid phone number' }
  }

  return { valid: true }
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('91')) return cleaned
  return `91${cleaned}`
}

export function maskPhone(phone: string): string {
  const formatted = formatPhone(phone)
  return `${formatted.slice(0, 3)}******${formatted.slice(-4)}`
}

export interface UsageCheck {
  allowed: boolean
  current: number
  limit: number
  remaining: number
  plan: PlanType
}

export interface OnboardingState {
  state: 'NO_TENANT' | 'TENANT_NO_PLAN' | 'ACTIVE'
  tenant?: {
    id: string
    name: string
    plan: PlanType
    phone: string
  }
  usage: {
    invoices: number
    reminders: number
  }
  limits: {
    invoices: number
    reminders: number
    autoRecovery: boolean
  }
  paywall?: {
    blocked: boolean
    type?: 'invoice' | 'reminder'
    upgradeNeeded: boolean
  }
}

export interface TenantCreateInput {
  shopName: string
  phone: string
  upiId?: string
  gstin?: string
}

export interface TenantCreateResult {
  success: boolean
  tenantId?: string
  error?: string
}
