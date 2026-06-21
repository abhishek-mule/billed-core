'use client'

import { useState, useCallback } from 'react'

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`
  if ((digits.length === 12 || digits.length > 12) && digits.startsWith('91')) return `+${digits.slice(0, 12)}`
  if (digits.length === 11 && digits.startsWith('91')) return `+${digits}`
  if (digits.length > 10) return `+${digits}`
  return `+${digits}`
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`
  return phone
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 13
}

export function getPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

export interface Contact {
  name: string
  phone: string
  whatsapp_number?: string
  email?: string
  isDuplicate?: boolean
}


export interface ImportState {
  contacts: Contact[]
  duplicateCount: number
  validCount: number
  invalidCount: number
  loading: boolean
  error: string | null
}

export function useContactImport() {
  const [state, setState] = useState<ImportState>({
    contacts: [],
    duplicateCount: 0,
    validCount: 0,
    invalidCount: 0,
    loading: false,
    error: null,
  })

  const checkDuplicates = useCallback(async (contacts?: Contact[]) => {
    const toCheck = contacts ?? state.contacts
    if (toCheck.length === 0) return

    setState(s => ({ ...s, loading: true }))

    try {
      const res = await fetch('/api/customers', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch existing customers')
      const { customers } = await res.json()

      const existingPhones = new Set(customers.map((c: any) => c.phone))
      const checked = toCheck.map(c => ({
        ...c,
        isDuplicate: existingPhones.has(c.phone),
      }))
      const duplicateCount = checked.filter(c => c.isDuplicate).length

      setState(s => ({ ...s, contacts: checked, duplicateCount, loading: false }))
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }))
    }
  }, [state.contacts])

  const pickFromPhonebook = useCallback(async () => {
    if (!('contacts' in navigator)) {
      setState(s => ({ ...s, error: 'Contacts API not supported in this browser. Use CSV import instead.' }))
      return
    }

    setState(s => ({ ...s, loading: true, error: null }))

    try {
      const [contact] = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple: false })
      if (!contact) {
        setState(s => ({ ...s, loading: false }))
        return
      }

      const name = contact.name?.formatted || contact.name?.[0] || ''
      const phone = contact.tel?.[0]?.value || contact.tel?.[0] || ''
      const email = contact.email?.[0] || ''

      if (!name || !phone) {
        setState(s => ({ ...s, loading: false, error: 'Could not read contact details. Please try again.' }))
        return
      }

      const contacts: Contact[] = [{
        name,
        phone: normalizePhone(phone),
        email: email || undefined,
      }]

      setState(s => ({
        ...s,
        contacts,
        duplicateCount: 0,
        validCount: 1,
        invalidCount: 0,
        loading: false,
        error: null,
      }))
      checkDuplicates(contacts)
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setState(s => ({
          ...s,
          loading: false,
          error: 'Contact access denied. Please grant permission or use CSV import.',
        }))
      } else {
        setState(s => ({ ...s, loading: false, error: err.message }))
      }
    }
  }, [checkDuplicates])

  const pickMultiple = useCallback(async () => {
    if (!('contacts' in navigator)) {
      setState(s => ({ ...s, error: 'Contacts API not supported. Use CSV import.' }))
      return
    }

    setState(s => ({ ...s, loading: true, error: null }))

    try {
      const contactsRaw = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple: true })
      if (!contactsRaw || contactsRaw.length === 0) {
        setState(s => ({ ...s, loading: false }))
        return
      }

      const contacts: Contact[] = contactsRaw
        .map((contact: any) => {
          const name = contact.name?.formatted || contact.name?.[0] || ''
          const phone = contact.tel?.[0]?.value || contact.tel?.[0] || ''
          const email = contact.email?.[0] || ''
          if (!name || !phone) return null
          return { name, phone: normalizePhone(phone), email: email || undefined }
        })
        .filter(Boolean) as Contact[]

      const validCount = contacts.filter(c => isValidPhone(c.phone)).length
      const invalidCount = contacts.length - validCount

      setState(s => ({
        ...s,
        contacts,
        duplicateCount: 0,
        validCount,
        invalidCount,
        loading: false,
        error: null,
      }))
      checkDuplicates(contacts)
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }))
    }
  }, [checkDuplicates])

  const parseCSV = useCallback(async (file: File) => {
    setState(s => ({ ...s, loading: true, error: null }))

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) {
        setState(s => ({ ...s, loading: false, error: 'CSV must have a header row and at least one data row' }))
        return
      }

      const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
      const nameIdx = header.findIndex(h => ['name', 'customer name', 'customer_name'].includes(h))
      const phoneIdx = header.findIndex(h => ['phone', 'mobile', 'contact', 'phone number', 'phone_number', 'tel'].includes(h))
      const whatsappIdx = header.findIndex(h => ['whatsapp', 'whatsapp_number', 'whatsapp number', 'wa'].includes(h))
      const gstinIdx = header.findIndex(h => ['gstin', 'gst in', 'gst'].includes(h))
      const emailIdx = header.findIndex(h => ['email', 'e-mail', 'mail'].includes(h))

      if (nameIdx === -1 || phoneIdx === -1) {
        setState(s => ({ ...s, loading: false, error: 'CSV must have at least "Name" and "Phone" columns' }))
        return
      }

      const contacts: Contact[] = []
      const errors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
        const name = (nameIdx >= 0 ? vals[nameIdx] : '') || ''
        const phoneRaw = (phoneIdx >= 0 ? vals[phoneIdx] : '') || ''
        const normalizedPhone = normalizePhone(phoneRaw)

        if (!name && !phoneRaw) continue

        if (!name || !isValidPhone(phoneRaw)) {
          errors.push(`Row ${i + 1}: ${!name ? 'Missing name' : 'Invalid phone'}`)
          continue
        }

        contacts.push({
          name,
          phone: normalizedPhone,
          whatsapp_number: whatsappIdx >= 0 ? normalizePhone(vals[whatsappIdx]) : undefined,
          email: emailIdx >= 0 ? vals[emailIdx] : undefined,
        })
      }

      const validCount = contacts.length
      const invalidCount = errors.length

      setState(s => ({
        ...s,
        contacts,
        duplicateCount: 0,
        validCount,
        invalidCount,
        loading: false,
        error: errors.length > 0 ? `Skipped ${errors.length} invalid rows: ${errors[0]}` : null,
      }))
      checkDuplicates(contacts)
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }))
    }
  }, [checkDuplicates])

  const submitImport = useCallback(async (mode: 'skip' | 'overwrite' = 'skip') => {
    if (state.contacts.length === 0) return

    setState(s => ({ ...s, loading: true }))

    try {
      const nonDuplicates = state.contacts.filter(c => !c.isDuplicate)
      const res = await fetch('/api/customers/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rows: nonDuplicates, mode }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Import failed')
      }

      const result = await res.json()
      return result
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }))
      return null
    }
  }, [state.contacts])

  const reset = useCallback(() => {
    setState({ contacts: [], duplicateCount: 0, validCount: 0, invalidCount: 0, loading: false, error: null })
  }, [])

  return { state, pickFromPhonebook, pickMultiple, parseCSV, checkDuplicates, submitImport, reset }
}
