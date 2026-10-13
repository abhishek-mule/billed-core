import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest, getVerifiedUserIdFromRequest } from '@/lib/billzo/auth-jwt'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { normalizePhoneE164 } from '@/lib/billzo/auth-utils'
import {
  verifyRequest,
  validateRequired,
  validatePhone,
  validateEmail,
  validateGSTIN,
  errorResponse,
  logApiAccess,
  validateJsonBody,
} from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

function normalizePhone(phone: string): string {
  return normalizePhoneE164(phone)
}

export async function GET(request: NextRequest) {
  try {
    // Verify tenant & user
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const tenantId = auth.tenantId!
    const userId = auth.userId!

    logApiAccess(request, tenantId, userId, 'list_customers')

    const { searchParams } = new URL(request.url)
    const rawSearch = searchParams.get('search') || ''
    // Escape PostgREST LIKE wildcards so a search for "%" can't match everything.
    const search = rawSearch.trim().replace(/[%_\\]/g, (m) => `\\${m}`)
    const parsedLimit = parseInt(searchParams.get('limit') || '100', 10)
    const parsedOffset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100, 500)
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0

    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })

    if (search && search.trim()) {
      query = query.or(`customer_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`)
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1)
    if (error) {
      console.error('[CustomerAPI] GET error:', error)
      return errorResponse('Failed to fetch customers', 500)
    }

    return NextResponse.json({
      customers: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (err: any) {
    console.error('[CustomerAPI] GET error:', err)
    return errorResponse(err.message || 'Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify tenant & user
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const tenantId = auth.tenantId!
    const userId = auth.userId!

    // Validate JSON
    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response

    const body = bodyResult.data!
    const { name, phone, whatsapp_number, gstin, email, address, notes, opt_in } = body

    // Validate required fields
    const required = validateRequired(body, ['name'])
    if (!required.valid) {
      return errorResponse(
        `Missing required fields: ${Object.keys(required.errors!).join(', ')}`,
        400
      )
    }

    // Validate types and formats
    if (typeof name !== 'string' || !name.trim()) {
      return errorResponse('Name must be a non-empty string', 400)
    }

    let normalizedPhone = ''
    if (phone && typeof phone === 'string' && phone.trim()) {
      const phoneValidation = validatePhone(phone)
      if (!phoneValidation.valid) {
        return errorResponse(phoneValidation.error!, 400)
      }
      normalizedPhone = normalizePhone(phone)
    }
    if (phone && typeof phone === 'string' && phone.trim() && !normalizedPhone) {
      return errorResponse('Could not normalize phone number', 400)
    }

    // Validate optional fields
    if (email) {
      const emailValidation = validateEmail(email)
      if (!emailValidation.valid) {
        return errorResponse(emailValidation.error!, 400)
      }
    }

    if (gstin) {
      const gstinValidation = validateGSTIN(gstin)
      if (!gstinValidation.valid) {
        return errorResponse(gstinValidation.error!, 400)
      }
    }

    logApiAccess(request, tenantId, userId, 'create_customer')

    const now = new Date().toISOString()
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        id: customerId,
        tenant_id: tenantId,
        customer_name: name.trim(),
        phone: normalizedPhone,
        email: email?.trim() || null,
        gstin: gstin?.trim() || null,
        billing_address: address?.trim() || null,
        automation_mode: 'full_auto',
        opt_in: opt_in === true,
        opt_in_at: opt_in === true ? now : null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return errorResponse('Customer with this phone already exists', 409)
      }
      console.error('[CustomerAPI] Insert error:', error)
      return errorResponse('Failed to create customer', 500)
    }

    return NextResponse.json({ customer: data }, { status: 201 })
  } catch (err: any) {
    console.error('[CustomerAPI] POST error:', err)
    return errorResponse(err.message || 'Internal server error', 500)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response

    const body = bodyResult.data!
    const { id, ...updates } = body

    if (!id) {
      return errorResponse('Customer ID required', 400)
    }

    logApiAccess(request, tenantId, userId, 'update_customer')

    const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (typeof updates.name === 'string' && updates.name.trim()) dbUpdates.customer_name = updates.name.trim()
    if (typeof updates.phone === 'string' && updates.phone.trim()) {
      const phoneValidation = validatePhone(updates.phone)
      if (!phoneValidation.valid) return errorResponse(phoneValidation.error!, 400)
      dbUpdates.phone = normalizePhone(updates.phone)
    }
    if (typeof updates.email === 'string' && updates.email.trim()) {
      const emailValidation = validateEmail(updates.email)
      if (!emailValidation.valid) return errorResponse(emailValidation.error!, 400)
      dbUpdates.email = updates.email.trim()
    }
    if (typeof updates.gstin === 'string' && updates.gstin.trim()) {
      const gstinValidation = validateGSTIN(updates.gstin)
      if (!gstinValidation.valid) return errorResponse(gstinValidation.error!, 400)
      dbUpdates.gstin = updates.gstin.trim().toUpperCase()
    }
    if (typeof updates.address === 'string') dbUpdates.billing_address = updates.address.trim() || null
    if (updates.automationMode !== undefined) {
      if (!['full_auto', 'manual', 'muted'].includes(updates.automationMode)) {
        return errorResponse('Invalid automationMode', 400)
      }
      dbUpdates.automation_mode = updates.automationMode
    }
    if (typeof updates.opt_in === 'boolean') {
      dbUpdates.opt_in = updates.opt_in
      dbUpdates.opt_in_at = updates.opt_in ? new Date().toISOString() : null
    }

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(dbUpdates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return errorResponse('Another customer already uses this phone number', 409)
      }
      throw new Error(error.message)
    }

    return NextResponse.json({ customer: data })
  } catch (err: any) {
    console.error('[CustomerAPI] PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Customer ID required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id')

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[CustomerAPI] DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
