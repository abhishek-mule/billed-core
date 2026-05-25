import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { db } from '@/lib/billzo/db'
import { normalizePhoneE164 } from '@/lib/billzo/auth-utils'
import type { Customer, CustomerImportRow, BulkImportResult } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

function normalizePhone(phone: string): string | null {
  if (!phone) return null
  const e164 = normalizePhoneE164(phone)
  return e164 === '+91' ? null : e164
}

function validateRow(row: CustomerImportRow): { valid: boolean; reason?: string } {
  if (!row.name?.trim()) return { valid: false, reason: 'Name is required' }
  if (!row.phone?.trim()) return { valid: false, reason: 'Phone is required' }
  const phone = normalizePhone(row.phone)
  if (!phone) return { valid: false, reason: 'Invalid phone number format' }
  if (row.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(row.gstin)) {
    return { valid: false, reason: 'Invalid GSTIN format' }
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return { valid: false, reason: 'Invalid email format' }
  }
  return { valid: true }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { rows, mode = 'skip' } = body as { rows: CustomerImportRow[]; mode: 'skip' | 'overwrite' }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    if (rows.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 customers per import' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const existingCustomers = await db().customers.where('tenantId').equals(tenantId).toArray()
    const phoneIndex = new Map(existingCustomers.map(c => [normalizePhone(c.phone), c]))

    const result: BulkImportResult = { created: 0, updated: 0, skipped: [], errors: [] }
    const toCreate: Customer[] = []
    const toUpdate: { id: string; updates: Partial<Customer> }[] = []

    for (const row of rows) {
      const validation = validateRow(row)
      if (!validation.valid) {
        result.errors.push({ row, error: validation.reason || 'Invalid' })
        continue
      }

      const phone = normalizePhone(row.phone)!
      const existing = phoneIndex.get(phone)

      if (existing) {
        if (mode === 'skip') {
          result.skipped.push({ row, reason: `Phone ${phone} already exists: ${existing.name}` })
        } else {
          const updates: Partial<Customer> = {
            name: row.name.trim(),
            whatsapp_number: row.whatsapp_number ? (normalizePhone(row.whatsapp_number) ?? undefined) : undefined,
            gstin: row.gstin?.trim() || undefined,
            email: row.email?.trim() || undefined,
            updatedAt: now,
          }
          toUpdate.push({ id: existing.id, updates })
          result.updated++
        }
      } else {
        const customer: Customer = {
          id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tenantId,
          name: row.name.trim(),
          phone,
          whatsapp_number: row.whatsapp_number ? (normalizePhone(row.whatsapp_number) ?? undefined) : undefined,
          gstin: row.gstin?.trim() || undefined,
          email: row.email?.trim() || undefined,
          opt_in: false,
          defaultTone: 'hinglish',
          invoiceCount: 0,
          lastUsedAt: now,
          createdAt: now,
          updatedAt: now,
        }
        toCreate.push(customer)
        result.created++
      }
    }

    if (toCreate.length > 0) await db().customers.bulkAdd(toCreate)
    for (const { id, updates } of toUpdate) {
      await db().customers.update(id, updates)
    }

    return NextResponse.json({
      imported: result.created + result.updated,
      total: rows.length,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped.length,
      failed: result.errors.length,
      details: result,
    })
  } catch (err: any) {
    console.error('[BulkImport] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const customers = await db().customers.where('tenantId').equals(tenantId).toArray()

    const csvContent = [
      'Name,Phone,WhatsApp Number,GSTIN,Email,Opt-in',
      ...customers.map(c =>
        [
          `"${c.name}"`,
          c.phone,
          c.whatsapp_number || '',
          c.gstin || '',
          c.email || '',
          c.opt_in ? 'Yes' : 'No',
        ].join(',')
      ),
    ].join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err: any) {
    console.error('[BulkImport] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
