export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Customer Memory — merchant-owned long-term notes about a customer.
 * GET list (pinned first, then newest) · POST create · PATCH edit/pin ·
 * DELETE (soft archive). Nothing here is ever auto-modified by the
 * recommendation engine or AI — merchant memory is sacred.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const customerId = request.nextUrl.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('merchant_customer_notes')
    .select('id, note, is_pinned, created_at, updated_at, author_user_id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .is('archived_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  const userId = auth.userId
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const customerId = body?.customerId
  const note = (body?.note || '').trim()
  if (!customerId || !note) return NextResponse.json({ error: 'customerId and note required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('merchant_customer_notes')
    .insert({ tenant_id: tenantId, customer_id: customerId, note, author_user_id: userId ?? null })
    .select('id, note, is_pinned, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: any = { updated_at: new Date().toISOString() }
  if (typeof body?.note === 'string') patch.note = body.note.trim()
  if (typeof body?.is_pinned === 'boolean') patch.is_pinned = body.is_pinned

  const { data, error } = await supabaseAdmin
    .from('merchant_customer_notes')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('archived_at', null)
    .select('id, note, is_pinned, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ note: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('merchant_customer_notes')
    .update({ archived_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('archived_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
