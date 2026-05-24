'use client'

import { useState, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

export function useRazorpay() {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (document.querySelector('script[src*="checkout.razorpay"]')) {
      if ((window as any).Razorpay) {
        setLoaded(true)
        return
      }
      const check = setInterval(() => {
        if ((window as any).Razorpay) {
          setLoaded(true)
          clearInterval(check)
        }
      }, 300)
      return () => clearInterval(check)
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => setLoaded(true)
    script.onerror = () => setError('Failed to load payment gateway. Please refresh and try again.')
    document.body.appendChild(script)
  }, [])

  const createOrder = useCallback(async (
    invoiceId: string,
    amount: number,
    customerName?: string,
    customerPhone?: string,
    tenantId?: string,
  ) => {
    const res = await fetch('/api/payment/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, amount, customerName, customerPhone, tenantId }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to create order')
    }
    return res.json()
  }, [])

  const verifyPayment = useCallback(async (
    razorpay_order_id: string,
    razorpay_payment_id: string,
    razorpay_signature: string,
    invoiceId?: string,
  ) => {
    const res = await fetch('/api/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Payment verification failed')
    }
    return res.json()
  }, [])

  const openCheckout = useCallback(async (options: {
    key_id: string
    order_id: string
    amount: number
    currency?: string
    name?: string
    description?: string
    image?: string
    prefill?: { name?: string; email?: string; contact?: string }
    notes?: Record<string, string>
    invoiceId?: string
    onSuccess: (payload: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void
    onDismiss?: () => void
    onError?: (error: any) => void
  }) => {
    if (!loaded) {
      throw new Error('Razorpay not loaded yet')
    }

    const rzpOptions = {
      key: options.key_id,
      amount: options.amount,
      currency: options.currency || 'INR',
      name: options.name || 'BillZo',
      description: options.description || 'Invoice Payment',
      image: options.image || '/logo_new.png',
      order_id: options.order_id,
      prefill: {
        name: options.prefill?.name || '',
        email: options.prefill?.email || '',
        contact: options.prefill?.contact || '',
      },
      notes: options.notes || {},
      handler: function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
        options.onSuccess(response)
      },
      modal: {
        ondismiss: () => {
          options.onDismiss?.()
        },
      },
    }

    const rzp = new (window as any).Razorpay(rzpOptions)
    rzp.on('payment.failed', (response: any) => {
      options.onError?.(response.error || { description: 'Payment failed' })
    })
    rzp.open()
  }, [loaded])

  return { loaded, error, createOrder, verifyPayment, openCheckout }
}
