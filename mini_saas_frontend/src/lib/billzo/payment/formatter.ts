import type { PaymentConfig, PaymentPresentation, PaymentInvoice } from './types'

function formatAmount(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

export function formatPaymentInstructions(
  paymentConfig: PaymentConfig,
  invoice: PaymentInvoice,
): PaymentPresentation {
  const { method } = paymentConfig
  const amount = formatAmount(invoice.total)

  if (method === 'upi' && paymentConfig.upiId) {
    return {
      title: 'Pay via UPI',
      subtitle: `Pay ${amount} to ${paymentConfig.upiId}`,
      button: { label: `Pay ${amount} via UPI`, url: null },
      paymentMethod: 'upi',
      metadata: {
        upiId: paymentConfig.upiId,
        ...(paymentConfig.upiVerifiedByMerchant ? { verified: 'true' } : {}),
      },
    }
  }

  if (method === 'bank' && paymentConfig.bankAccount && paymentConfig.bankIfsc) {
    const meta: Record<string, string> = {
      accountNumber: paymentConfig.bankAccount,
      ifsc: paymentConfig.bankIfsc,
    }
    if (paymentConfig.bankName) meta.bankName = paymentConfig.bankName
    if (paymentConfig.accountHolderName) meta.accountHolderName = paymentConfig.accountHolderName
    return {
      title: 'Bank Transfer',
      subtitle: `Transfer ${amount} to ${paymentConfig.bankName || 'our bank account'}`,
      button: null,
      paymentMethod: 'bank',
      metadata: meta,
    }
  }

  if (method === 'cash') {
    return {
      title: 'Cash Payment',
      subtitle: `Pay ${amount} in cash`,
      button: null,
      paymentMethod: 'cash',
      metadata: {},
    }
  }

  return {
    title: 'Payment Not Configured',
    subtitle: 'This merchant has not set up online payments.',
    button: null,
    paymentMethod: 'cash',
    metadata: {},
  }
}
