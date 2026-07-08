// ============================================================
// UPI PROVIDER — Generates UPI payment URLs and signed tokens
// ============================================================

import { signUpiToken } from '../../../../lib/crypto'
import type { CollectionProvider } from '@billzo/shared'

export interface UpiPaymentRequest {
  invoiceId: string
  tenantId: string
  amount: number
  upiId: string
  businessName?: string
}

export interface UpiPaymentResponse {
  tokenUrl: string
  upiDeepLink: string
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

export class UPIProvider implements CollectionProvider<UpiPaymentRequest, UpiPaymentResponse> {
  readonly name = 'upi'

  create(input: UpiPaymentRequest): UpiPaymentResponse {
    const token = signUpiToken({
      invoiceId: input.invoiceId,
      tenantId: input.tenantId,
      amount: input.amount,
      upiId: input.upiId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    return {
      tokenUrl: `${appUrl}/pay/r/${token}`,
      upiDeepLink: `upi://pay?pa=${encodeURIComponent(input.upiId)}&pn=${encodeURIComponent(input.businessName || 'BillZo')}&am=${input.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Payment to ' + (input.businessName || 'BillZo'))}`,
    }
  }
}

export const upiProvider = new UPIProvider()
