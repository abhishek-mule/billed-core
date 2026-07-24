import type { PaymentConfig, PaymentPresentation, PaymentInvoice } from './types'
import { validatePaymentConfig } from './validators'
import { formatPaymentInstructions } from './formatter'

export const PaymentEngine = {
  buildPresentation({
    invoice,
    paymentConfig,
  }: {
    invoice: PaymentInvoice
    paymentConfig: PaymentConfig
  }): PaymentPresentation {
    const validationError = validatePaymentConfig(paymentConfig)
    if (validationError) {
      return {
        title: 'Payment Not Configured',
        subtitle: validationError,
        button: null,
        paymentMethod: paymentConfig.method,
        metadata: {},
      }
    }

    const presentation = formatPaymentInstructions(paymentConfig, invoice)

    if (presentation.paymentMethod === 'upi' && paymentConfig.upiId) {
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(paymentConfig.upiId)}&am=${invoice.total}&cu=INR&tn=${encodeURIComponent(`Invoice ${invoice.invoiceNumber || ''}`)}`
      presentation.button = {
        label: presentation.button?.label || `Pay via UPI`,
        url: upiDeepLink,
      }
    }

    return presentation
  },
}
