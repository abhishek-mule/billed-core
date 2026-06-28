import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { checkRateLimit, incrementRateLimit } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimit(`phone_validate:ip:${ip}`, 30, 60)
    if (!rl.allowed) return NextResponse.json({ error: rl.reason }, { status: 429 })
    await incrementRateLimit(`phone_validate:ip:${ip}`, 60)

    const body = await validateJsonBody<{ phone: string }>(request, {
      fields: {
        phone: {
          required: true,
          type: 'string',
          message: 'Please enter a valid 10-digit mobile number',
        },
      },
    })
    if (body.response) return body.response
    const { phone } = body.data!

    const cleanPhone = phone.replace(/\D/g, '').slice(-10)

    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        exists: true,
        merchantId: existing.id,
        businessName: existing.name,
        message: 'This WhatsApp number is already linked to another BillZo account.',
      })
    }

    return NextResponse.json({ exists: false })

  } catch (error: any) {
    console.error('[MerchantValidatePhone] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
