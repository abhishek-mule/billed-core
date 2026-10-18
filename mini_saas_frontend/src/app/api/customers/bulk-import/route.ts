import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { normalizePhoneE164 } from '@/lib/billzo/auth-utils'
import type { CustomerImportRow, BulkImportResult } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

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
  // Uppercase before test — matches single-create validateGSTIN behavior.
  if (row.gstin?.trim() && !GSTIN_RE.test(row.gstin.trim().toUpperCase())) {
    return { valid: false, reason: 'Invalid GSTIN format' }
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return { valid: false, reason: 'Invalid email format' }
  }
  return { valid: true }
}

function newCustomerId(): string {
  return `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
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

    // ── P0: Postgres is canonical. Never touch IndexedDB/Dexie server-side. ──
    const { data: existingCustomers, error: loadError } = await supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone')
      .eq('tenant_id', tenantId)

    if (loadError) {
      console.error('[BulkImport] Failed to load existing customers:', loadError.message)
      return NextResponse.json({ error: 'Failed to read existing customers' }, { status: 500 })
    }

    const phoneIndex = new Map(
      (existingCustomers || []).map((c: any) => [normalizePhone(c.phone || ''), c]),
    )
    // In-file dedup: without this, two same-phone rows in one payload both miss
    // the pre-existing index and double-create (no DB unique constraint on phone).
    const seenPhones = new Set<string>()

    const result: BulkImportResult = { created: 0, updated: 0, skipped: [], errors: [] }
    const toCreate: Record<string, any>[] = []
    const toUpdate: { id: string; updates: Record<string, any>; row: CustomerImportRow }[] = []
    const now = new Date().toISOString()

    for (const row of rows) {
      const validation = validateRow(row)
      if (!validation.valid) {
        result.errors.push({ row, error: validation.reason || 'Invalid' })
        continue
      }

      const phone = normalizePhone(row.phone)!
      if (seenPhones.has(phone)) {
        result.skipped.push({ row, reason: `Duplicate phone within this file: ${phone}` })
        continue
      }
      seenPhones.add(phone)

      const existing = phoneIndex.get(phone)

      if (existing) {
        if (mode === 'skip') {
          result.skipped.push({ row, reason: `Phone ${phone} already exists: ${existing.customer_name}` })
        } else {
          toUpdate.push({
            id: existing.id,
            updates: {
              customer_name: row.name.trim(),
              whatsapp_number: row.whatsapp_number?.trim()
                ? normalizePhone(row.whatsapp_number)
                : null,
              email: row.email?.trim() || null,
              gstin: row.gstin?.trim().toUpperCase() || null,
              updated_at: now,
            },
            row,
          })
        }
      } else {
        toCreate.push({
          id: newCustomerId(),
          tenant_id: tenantId,
          customer_name: row.name.trim(),
          phone,
          whatsapp_number: row.whatsapp_number?.trim()
            ? normalizePhone(row.whatsapp_number)
            : null,
          email: row.email?.trim() || null,
          gstin: row.gstin?.trim().toUpperCase() || null,
          automation_mode: 'full_auto',
          opt_in: false,
          created_at: now,
          updated_at: now,
        })
        result.created++
      }
    }

    // Single-statement insert: atomic — a retry sees the rows as existing and
    // skips them, so sequential retries are idempotent (no duplicate customers).
    if (toCreate.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('customers').insert(toCreate)
      if (insertError) {
        if (insertError.code === '23505') {
          // Lost a race with a concurrent writer (uq_customers_tenant_phone):
          // converge per-row instead of failing the whole batch. A row that
          // now exists is a safe skip, never a duplicate.
          result.created = 0
          for (const row of toCreate) {
            const { data: raced } = await supabaseAdmin
              .from('customers')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('phone', row.phone)
              .limit(1)
            if (raced && raced.length > 0) {
              result.skipped.push({
                row: { name: row.customer_name, phone: row.phone },
                reason: `Phone ${row.phone} already exists (concurrent import)`,
              })
              continue
            }
            const { error: singleError } = await supabaseAdmin.from('customers').insert(row)
            if (singleError) {
              if (singleError.code === '23505') {
                result.skipped.push({
                  row: { name: row.customer_name, phone: row.phone },
                  reason: `Phone ${row.phone} already exists (concurrent import)`,
                })
              } else {
                console.error('[BulkImport] Single-insert error:', singleError.message)
                result.errors.push({
                  row: { name: row.customer_name, phone: row.phone },
                  error: 'Failed to save customer',
                })
              }
            } else {
              result.created++
            }
          }
        } else {
          console.error('[BulkImport] Insert error:', insertError.message)
          return NextResponse.json({ error: 'Failed to save imported customers' }, { status: 500 })
        }
      }
    }

    for (const { id, updates, row } of toUpdate) {
      const { error: updateError } = await supabaseAdmin
        .from('customers')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
      if (updateError) {
        console.error('[BulkImport] Update error:', updateError.message)
        result.errors.push({ row, error: 'Failed to update existing customer' })
      } else {
        result.updated++
      }
    }

    // Response contract preserved exactly — onboarding + parties/import consume it.
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
    return NextResponse.json({ error: 'Import failed. Please try again.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: customers, error } = await supabaseAdmin
      .from('customers')
      .select('customer_name, phone, email, gstin, opt_in')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[BulkImport] GET error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
    }

    const csvContent = [
      'Name,Phone,WhatsApp Number,GSTIN,Email,Opt-in',
      ...(customers || []).map((c: any) =>
        [
          escapeCsv(c.customer_name || ''),
          c.phone || '',
          '',
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
    return NextResponse.json({ error: 'Export failed. Please try again.' }, { status: 500 })
  }
}
