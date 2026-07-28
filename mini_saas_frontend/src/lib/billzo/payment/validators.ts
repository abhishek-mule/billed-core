import type { PaymentConfig } from './types'

export const UPI_REGEX = /^[\w.-]+@[\w.-]+$/
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const ACCOUNT_REGEX = /^\d{9,18}$/

export function validatePaymentConfig(config: PaymentConfig): string | null {
  if (config.method === 'upi') {
    if (!config.upiId) return 'UPI ID is required'
    if (!UPI_REGEX.test(config.upiId)) return 'Invalid UPI ID format'
    return null
  }
  if (config.method === 'bank') {
    if (!config.bankAccount) return 'Account number is required'
    if (!ACCOUNT_REGEX.test(config.bankAccount)) return 'Account number must be 9-18 digits'
    if (!config.bankIfsc) return 'IFSC code is required'
    if (!IFSC_REGEX.test(config.bankIfsc)) return 'Invalid IFSC format'
    return null
  }
  if (config.method === 'cash') return null
  return 'Invalid payment method'
}
