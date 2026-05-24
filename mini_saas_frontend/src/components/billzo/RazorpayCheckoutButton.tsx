'use client'

import { useState } from 'react'
import { ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useRazorpay } from '@/lib/billzo/useRazorpay'

interface RazorpayCheckoutButtonProps {
  invoiceId: string
  amount: number
  customerName?: string
  customerPhone?: string
  tenantId?: string
  className?: string
  onPaymentSuccess?: () => void
  disabled?: boolean
}

export function RazorpayCheckoutButton({
  invoiceId,
  amount,
  customerName,
  customerPhone,
  tenantId,
  className = '',
  onPaymentSuccess,
  disabled,
}: RazorpayCheckoutButtonProps) {
  const { loaded, error: scriptError, createOrder, verifyPayment, openCheckout } = useRazorpay()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handlePay = async () => {
    setProcessing(true)
    setError(null)

    try {
      if (!loaded) {
        throw new Error('Payment gateway is loading. Please wait...')
      }

      const order = await createOrder(invoiceId, amount, customerName, customerPhone, tenantId)

      await openCheckout({
        key_id: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        name: 'BillZo',
        description: `Invoice #${invoiceId.slice(-8)}`,
        prefill: {
          name: customerName,
          contact: customerPhone,
        },
        notes: { invoiceId },
        invoiceId,
        onSuccess: async (response) => {
          try {
            const result = await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature,
              invoiceId,
            )
            if (result.verified) {
              setSuccess(true)
              onPaymentSuccess?.()
            }
          } catch (verifyErr: any) {
            setError(verifyErr.message || 'Payment verification failed')
          }
        },
        onDismiss: () => {
          setProcessing(false)
        },
        onError: (err: any) => {
          setError(err?.description || 'Payment failed. Please try again.')
          setProcessing(false)
        },
      })
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setProcessing(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 border border-green-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Payment successful
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handlePay}
        disabled={disabled || processing || !!scriptError}
        className={`flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50 ${className}`}
      >
        {processing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ExternalLink className="h-4 w-4" />
        )}
        {processing ? 'Processing...' : 'Pay Now'}
      </button>
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 border border-red-200">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
      {scriptError && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs font-medium text-yellow-700 border border-yellow-200">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {scriptError}
        </div>
      )}
    </div>
  )
}
