'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Phone, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/billzo/Button'
import { normalizePhone, isValidPhone } from '@/lib/billzo/useContactImport'
import { db, notifyChanged } from '@/lib/billzo/db'
import { scheduleBackgroundSync } from '@/lib/billzo/sync'
import { getCookie } from '@/lib/cookies'

interface FormData {
  name: string
  phone: string
  whatsapp_number: string
  gstin: string
  email: string
  address: string
  notes: string
}

interface Errors {
  name?: string
  phone?: string
  whatsapp?: string
  gstin?: string
  email?: string
}

export default function AddCustomerPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormData>({ name: '', phone: '', whatsapp_number: '', gstin: '', email: '', address: '', notes: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')
  const [success, setSuccess] = useState(false)
  const [whatsappTouched, setWhatsappTouched] = useState(false)

  const pickContact = async () => {
    if (!('contacts' in navigator)) {
      setErrors(e => ({ ...e, phone: 'Contacts API not supported in this browser' }))
      return
    }
    try {
      const [contact] = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false })
      if (!contact) return
      const name = contact.name?.formatted || contact.name?.[0] || ''
      const phone = normalizePhone(contact.tel?.[0]?.value || contact.tel?.[0] || '')
      setForm(f => ({ ...f, name, phone, whatsapp_number: phone }))
      setWhatsappTouched(false)
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrors(e => ({ ...e, phone: 'Could not read contact. Please enter manually.' }))
      }
    }
  }

  const validate = (): boolean => {
    const e: Errors = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.phone.trim()) e.phone = 'Phone is required'
    else if (!isValidPhone(form.phone)) e.phone = 'Enter a valid 10-digit phone number'
    if (form.whatsapp_number && !isValidPhone(form.whatsapp_number)) e.whatsapp = 'Invalid WhatsApp number'
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin)) e.gstin = 'Invalid GSTIN format'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          whatsapp_number: form.whatsapp_number?.trim() || undefined,
          gstin: form.gstin?.trim() || undefined,
          email: form.email?.trim() || undefined,
          address: form.address?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setErrors({ phone: 'A customer with this phone number already exists' })
        } else {
          setApiError(data.error || 'Failed to create customer')
        }
        return
      }

      const apiCustomer = data.customer
      const tenantId = getCookie('bz_tenant') || ''
      const now = new Date().toISOString()

      await db().customers.put({
        id: apiCustomer.id,
        tenantId,
        name: apiCustomer.customer_name || form.name.trim(),
        phone: apiCustomer.phone || form.phone.trim(),
        whatsapp_number: form.whatsapp_number?.trim() || undefined,
        gstin: apiCustomer.gstin || form.gstin?.trim() || undefined,
        email: apiCustomer.email || form.email?.trim() || undefined,
        address: apiCustomer.billing_address || form.address?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        automationMode: apiCustomer.automation_mode || 'full_auto',
        defaultTone: 'english',
        opt_in: true,
        lastUsedAt: now,
        invoiceCount: 0,
        createdAt: now,
        updatedAt: now,
      })

      notifyChanged()
      scheduleBackgroundSync()

      setSuccess(true)
      toast.success('Customer created')
      router.push('/parties')
    } catch (err: any) {
      setApiError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value
    setForm(f => {
      const updated = { ...f, [field]: val }
      if (field === 'phone' && !whatsappTouched) {
        updated.whatsapp_number = val
      }
      if (field === 'whatsapp_number') {
        setWhatsappTouched(true)
      }
      return updated
    })
    setErrors(er => ({ ...er, [field]: undefined }))
  }

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/parties')} className="p-2 rounded-xl hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Add Customer</h1>
          <p className="text-sm text-muted-foreground">Create a new customer profile</p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Customer created! Redirecting...
        </div>
      )}

      {apiError && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">Name *</label>
            <input
              value={form.name}
              onChange={set('name')}
              placeholder="Customer name"
              className={`w-full h-11 rounded-xl border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${errors.name ? 'border-red-400' : ''}`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold">Phone *</label>
              <button type="button" onClick={pickContact} className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">
                <Phone className="h-3 w-3" />
                Pick from Phonebook
              </button>
            </div>
            <input
              value={form.phone}
              onChange={set('phone')}
              placeholder="+91 98765 43210"
              type="tel"
              className={`w-full h-11 rounded-xl border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${errors.phone ? 'border-red-400' : ''}`}
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">WhatsApp Number</label>
            <input
              value={form.whatsapp_number}
              onChange={set('whatsapp_number')}
              placeholder="+91 98765 43210 (if different from phone)"
              type="tel"
              className={`w-full h-11 rounded-xl border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${errors.whatsapp ? 'border-red-400' : ''}`}
            />
            {errors.whatsapp && <p className="text-xs text-red-500 mt-1">{errors.whatsapp}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">GSTIN</label>
            <input
              value={form.gstin}
              onChange={set('gstin')}
              placeholder="29AAACP1234C1Z5"
              className={`w-full h-11 rounded-xl border bg-card px-4 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring ${errors.gstin ? 'border-red-400' : ''}`}
            />
            {errors.gstin && <p className="text-xs text-red-500 mt-1">{errors.gstin}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Email</label>
            <input
              value={form.email}
              onChange={set('email')}
              placeholder="customer@example.com"
              type="email"
              className={`w-full h-11 rounded-xl border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${errors.email ? 'border-red-400' : ''}`}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Address</label>
            <textarea
              value={form.address}
              onChange={set('address')}
              placeholder="Full address (optional)"
              rows={2}
              className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any notes about this customer (optional)"
              rows={2}
              className="w-full rounded-xl border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        <div className="rounded-xl border p-4 bg-amber-50 border-amber-200">
          <p className="text-xs text-amber-700">
            By adding this customer, you confirm you have their consent to send WhatsApp messages. Opt-in status can be updated later.
          </p>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/parties')} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={submitting || success} className="flex-1">
            {submitting ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </div>
  )
}