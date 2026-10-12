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
  gstin?: string
  email?: string
  isDuplicate?: boolean
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

/** Quote-aware CSV line splitter: handles "Sharma, Sons" and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map(v => v.trim())
}

const NAME_ALIASES = ['name', 'customer name', 'customer_name', 'party', 'party name', 'party_name']
const PHONE_ALIASES = ['phone', 'mobile', 'mobile number', 'contact', 'contact number', 'phone number', 'phone_number', 'tel']
const WHATSAPP_ALIASES = ['whatsapp', 'whatsapp_number', 'whatsapp number', 'wa']
const GSTIN_ALIASES = ['gstin', 'gst in', 'gst', 'gst_no', 'gst number']
const EMAIL_ALIASES = ['email', 'e-mail', 'mail']


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
      // Paginate through ALL tenant customers — the default limit=100 caused
      // false "Will import" for tenants with >100 customers.
      const existingPhones = new Set<string>()
      let offset = 0
      let total = Infinity
      while (offset < total) {
        const res = await fetch(`/api/customers?limit=500&offset=${offset}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to fetch existing customers')
        const { customers, total: t } = await res.json()
        for (const c of customers || []) {
          if (c.phone) existingPhones.add(normalizePhone(String(c.phone)))
        }
        total = typeof t === 'number' ? t : (customers || []).length
        offset += (customers || []).length
        if (!customers || customers.length === 0) break
      }
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

  /** Shared row pipeline for CSV and XLSX: header mapping + validation. */
  const rowsToContacts = (header: string[], rows: string[][], label: string) => {
    const norm = header.map(h => h.toLowerCase().trim())
    const nameIdx = norm.findIndex(h => NAME_ALIASES.includes(h))
    const phoneIdx = norm.findIndex(h => PHONE_ALIASES.includes(h))
    const whatsappIdx = norm.findIndex(h => WHATSAPP_ALIASES.includes(h))
    const gstinIdx = norm.findIndex(h => GSTIN_ALIASES.includes(h))
    const emailIdx = norm.findIndex(h => EMAIL_ALIASES.includes(h))

    if (nameIdx === -1 || phoneIdx === -1) {
      setState(s => ({ ...s, loading: false, error: `${label} must have at least "Name" and "Phone" columns` }))
      return
    }

    const contacts: Contact[] = []
    const errors: string[] = []
    const seenPhones = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const vals = rows[i]
      const name = (vals[nameIdx] || '').trim()
      const phoneRaw = (vals[phoneIdx] || '').trim()
      const normalizedPhone = normalizePhone(phoneRaw)

      if (!name && !phoneRaw) continue

      if (!name || !isValidPhone(phoneRaw)) {
        errors.push(`Row ${i + 2}: ${!name ? 'Missing name' : 'Invalid phone'}`)
        continue
      }

      // Never store a bare '+' — normalizePhone('') yields '+'.
      const waRaw = whatsappIdx >= 0 ? (vals[whatsappIdx] || '').trim() : ''
      const gstinRaw = gstinIdx >= 0 ? (vals[gstinIdx] || '').trim().toUpperCase() : ''
      if (gstinRaw && !GSTIN_RE.test(gstinRaw)) {
        errors.push(`Row ${i + 2}: Invalid GSTIN`)
        continue
      }

      const contact: Contact = {
        name,
        phone: normalizedPhone,
        whatsapp_number: waRaw ? normalizePhone(waRaw) : undefined,
        gstin: gstinRaw || undefined,
        email: emailIdx >= 0 && vals[emailIdx]?.trim() ? vals[emailIdx].trim() : undefined,
      }
      // Mark in-file duplicates in preview — server skips them on import.
      if (seenPhones.has(normalizedPhone)) contact.isDuplicate = true
      else seenPhones.add(normalizedPhone)
      contacts.push(contact)
    }

    setState(s => ({
      ...s,
      contacts,
      duplicateCount: 0,
      validCount: contacts.length,
      invalidCount: errors.length,
      loading: false,
      error: errors.length > 0 ? `Skipped ${errors.length} invalid rows: ${errors[0]}` : null,
    }))
    checkDuplicates(contacts)
  }

  const parseCSV = useCallback(async (file: File) => {
    setState(s => ({ ...s, loading: true, error: null }))

    try {
      const isXlsx = /\.xlsx?$/i.test(file.name)
      let header: string[]
      let rows: string[][]

      if (isXlsx) {
        // Real Excel parsing — file picker accepts .xlsx, so honor it.
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        if (!sheet) throw new Error('Excel file has no readable sheet')
        const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false }) as unknown as string[][]
        const nonEmpty = aoa.filter(r => r.some(v => String(v ?? '').trim()))
        if (nonEmpty.length < 2) {
          setState(s => ({ ...s, loading: false, error: 'Excel must have a header row and at least one data row' }))
          return
        }
        header = nonEmpty[0].map(v => String(v ?? ''))
        rows = nonEmpty.slice(1).map(r => r.map(v => String(v ?? '')))
        rowsToContacts(header, rows, 'Excel')
      } else {
        // BOM-strip + CRLF-safe + quote-aware (Tally exports quote commas).
        const text = (await file.text()).replace(/^\uFEFF/, '')
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          setState(s => ({ ...s, loading: false, error: 'CSV must have a header row and at least one data row' }))
          return
        }
        header = splitCsvLine(lines[0])
        rows = lines.slice(1).map(splitCsvLine)
        rowsToContacts(header, rows, 'CSV')
      }
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
