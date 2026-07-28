import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { uuid } from '@/lib/billzo/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('recovery_activities')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ activities: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId, customerId, type, actor, metadata } = body

    if (!invoiceId || !type || !actor) {
      return NextResponse.json({ error: 'invoiceId, type, and actor required' }, { status: 400 })
    }

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('tenant_id')
      .eq('id', invoiceId)
      .single()

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const activity = {
      id: uuid(),
      tenant_id: invoice.tenant_id,
      invoice_id: invoiceId,
      customer_id: customerId || null,
      type,
      actor,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    }

    const { error } = await supabaseAdmin
      .from('recovery_activities')
      .insert(activity)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, activity })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
