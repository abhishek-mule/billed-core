'use client'

import { useState } from 'react'
import { MerchantInvoicePayload, MerchantInvoiceResponse } from './merchant'

interface UseInvoiceAPIOptions {
  authToken: string
}

export function useInvoiceAPI({ authToken }: UseInvoiceAPIOptions) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createInvoice = async (payload: MerchantInvoicePayload): Promise<MerchantInvoiceResponse | null> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/merchant/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        body: JSON.stringify(payload),
      })

      const data: MerchantInvoiceResponse = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to create invoice')
        return null
      }

      return data
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { createInvoice, loading, error }
}