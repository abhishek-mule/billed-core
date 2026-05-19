import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/billzo/db'
import { normalizePhoneE164 } from '@/lib/billzo/auth-utils'
import type { Customer } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

function getTenantId(request: NextRequest): string | null {
  const cookieStore = cookies()
  return cookieStore.get('bz_tenant')?.value || null
}

function getUserId(request: NextRequest): string | null {
  const cookieStore = cookies()
  const token = cookieStore.get('bz_access')?.value
  if (!token) return null
  try {
    return JSON.parse(atob(token.split('.')[1])).userId || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    let customers = await db().customers.where('tenantId').equals(tenantId).toArray()

    if (search) {
      const q = search.toLowerCase()
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.whatsapp_number || '').includes(q) ||
        (c.gstin || '').toLowerCase().includes(q)
      )
    }

    customers.sort((a, b) => (b.lastUsedAt > a.lastUsedAt ? 1 : -1))

    const total = customers.length
    const paginated = customers.slice(offset, offset + limit)

    return NextResponse.json({ customers: paginated, total, limit, offset })
  } catch (err: any) {
    console.error('[CustomerAPI] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    const userId = getUserId(request)
    if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, phone, whatsapp_number, gstin, email, address, notes, opt_in } = body

    if (!name || !name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!phone || !phone.trim()) return NextResponse.json({ error: 'Phone is required' }, { status: 400 })

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone || normalizedPhone === '+91') return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

    const existing = await db().customers
      .where('tenantId').equals(tenantId)
      .filter(c => normalizePhone(c.phone) === normalizedPhone)
      .first()

    if (existing) {
      return NextResponse.json({ error: 'Customer with this phone already exists', existingId: existing.id }, { status: 409 })
    }

    const now = new Date().toISOString()
    const customer: Customer = {
      id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      name: name.trim(),
      phone: normalizedPhone,
      whatsapp_number: whatsapp_number ? normalizePhone(whatsapp_number) : undefined,
      gstin: gstin?.trim() || undefined,
      email: email?.trim() || undefined,
      address: address?.trim() || undefined,
      notes: notes?.trim() || undefined,
      opt_in: opt_in || false,
      opt_in_at: opt_in ? now : undefined,
      defaultTone: 'hinglish',
      invoiceCount: 0,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await db().customers.add(customer)
    return NextResponse.json({ customer }, { status: 201 })
  } catch (err: any) {
    console.error('[CustomerAPI] POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'Customer ID required' }, { status: 400 })

    const existing = await db().customers.get(id)
    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (updates.phone) {
      const normalized = normalizePhone(updates.phone)
      const duplicate = await db().customers
        .where('tenantId').equals(tenantId)
        .filter(c => normalizePhone(c.phone) === normalized && c.id !== id)
        .first()
      if (duplicate) return NextResponse.json({ error: 'Phone already in use' }, { status: 409 })
      updates.phone = normalized
    }

    if (updates.whatsapp_number) {
      updates.whatsapp_number = normalizePhone(updates.whatsapp_number)
    }

    updates.updatedAt = new Date().toISOString()
    await db().customers.update(id, updates)

    const updated = await db().customers.get(id)
    return NextResponse.json({ customer: updated })
  } catch (err: any) {
    console.error('[CustomerAPI] PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Customer ID required' }, { status: 400 })

    const existing = await db().customers.get(id)
    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    await db().customers.delete(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[CustomerAPI] DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function normalizePhone(phone: string): string {
  return normalizePhoneE164(phone)
}