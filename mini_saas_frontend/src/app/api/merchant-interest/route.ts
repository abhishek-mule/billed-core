import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['growth', 'business', 'enterprise'] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, phone, plan, note } = body as {
      tenantId?: string
      phone?: string
      plan?: string
      note?: string
    }

    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Missing tenant ID' }, { status: 400 })
    }

    if (!phone || typeof phone !== 'string' || phone.length < 10) {
      return NextResponse.json({ error: 'Valid phone number required' }, { status: 400 })
    }

    if (!plan || !VALID_TYPES.includes(plan as any)) {
      return NextResponse.json({ error: 'Plan must be growth, business, or enterprise' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('merchant_interest').insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      phone,
      type: plan,
      note: note || null,
    })

    if (error) {
      console.error('[MerchantInterest] DB insert error:', error)
      return NextResponse.json({ error: 'Failed to record interest' }, { status: 500 })
    }

    console.log(`
🚀 MERCHANT INTEREST

Plan: ${plan}
Tenant: ${tenantId}
Phone: ${phone}
Note: ${note || '(none)'}
Time: ${new Date().toISOString()}
`)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[MerchantInterest] Error:', err)
    return NextResponse.json({ error: 'Failed to record interest' }, { status: 500 })
  }
}
