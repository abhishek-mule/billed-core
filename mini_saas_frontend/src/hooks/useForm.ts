'use client'

import { useState, useCallback, useEffect } from 'react'

interface UseFormOptions<T> {
  initialValues: T
  validate?: (values: T) => Record<string, string>
  onSubmit: (values: T) => Promise<void>
}

interface FormState<T> {
  values: T
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
  isValid: boolean
}

export function useForm<T extends Record<string, any>>(options: UseFormOptions<T>) {
  const { initialValues, validate, onSubmit } = options

  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Validate on change
  useEffect(() => {
    if (validate) {
      const validationErrors = validate(values)
      setErrors(validationErrors)
    }
  }, [values, validate])

  const isValid = Object.keys(errors).length === 0

  const handleChange = useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }, [])

  const handleReset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    setSubmitError(null)
  }, [initialValues])

  const handleSubmit = useCallback(async () => {
    // Touch all fields
    const allTouched: Record<string, boolean> = {}
    Object.keys(values).forEach(key => {
      allTouched[key] = true
    })
    setTouched(allTouched)

    // Validate
    const validationErrors = validate ? validate(values) : {}
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      await onSubmit(values)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }, [values, validate, onSubmit])

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    submitError,
    handleChange,
    handleBlur,
    handleReset,
    handleSubmit,
    setValues,
    setErrors,
  }
}

// Invoice Form Specific Hook
interface InvoiceItem {
  id: string
  itemCode: string
  itemName: string
  qty: number
  rate: number
}

interface InvoiceFormValues {
  customerName: string
  customerPhone: string
  paymentMode: 'cash' | 'upi' | 'card' | 'credit'
  items: InvoiceItem[]
  notes: string
}

export function useInvoiceForm(onSuccess: (values: InvoiceFormValues) => Promise<void>) {
  const [totals, setTotals] = useState({
    subtotal: 0,
    tax: 0,
    total: 0,
  })

  const form = useForm<InvoiceFormValues>({
    initialValues: {
      customerName: '',
      customerPhone: '',
      paymentMode: 'cash',
      items: [{ id: '1', itemCode: '', itemName: '', qty: 1, rate: 0 }],
      notes: '',
    },
    validate: (values) => {
      const errors: Record<string, string> = {}

      if (!values.customerPhone || values.customerPhone.length < 10) {
        errors.customerPhone = 'Valid phone number required'
      }

      if (!values.items || values.items.length === 0) {
        errors.items = 'At least one item required'
      }

      return errors
    },
    onSubmit: async (values) => {
      // Calculate totals
      const subtotal = values.items.reduce((sum, item) => sum + item.qty * item.rate, 0)
      const tax = subtotal * 0.18
      const total = subtotal + tax

      setTotals({ subtotal, tax, total })

      await onSuccess(values)
    },
  })

  const addItem = useCallback(() => {
    const newItem: InvoiceItem = {
      id: `item_${Date.now()}`,
      itemCode: '',
      itemName: '',
      qty: 1,
      rate: 0,
    }
    form.handleChange('items', [...form.values.items, newItem])
  }, [form.values.items, form.handleChange])

  const removeItem = useCallback((id: string) => {
    if (form.values.items.length > 1) {
      form.handleChange('items', form.values.items.filter(item => item.id !== id))
    }
  }, [form.values.items])

  const updateItem = useCallback((id: string, field: keyof InvoiceItem, value: any) => {
    form.handleChange('items', form.values.items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ))
  }, [form.values.items])

  // Recalculate totals when items change
  useEffect(() => {
    const subtotal = form.values.items.reduce((sum, item) => sum + item.qty * item.rate, 0)
    const tax = subtotal * 0.18
    const total = subtotal + tax
    setTotals({ subtotal, tax, total })
  }, [form.values.items])

  return {
    ...form,
    totals,
    addItem,
    removeItem,
    updateItem,
  }
}