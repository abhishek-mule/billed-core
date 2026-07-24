import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { submitIntent } from '@/lib/authority/transport'
import { validatePaymentConfig } from '@/lib/billzo/payment/validators'
import type { PaymentConfig } from '@/lib/billzo/payment/types'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

async function handlePaymentSection(data: unknown, tenantId: string) {
  const config = data as PaymentConfig
  const validationError = validatePaymentConfig(config)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const paymentConfig: PaymentConfig = { method: config.method }
  if (config.method === 'upi') {
    paymentConfig.upiId = config.upiId?.trim()
    paymentConfig.upiVerifiedByMerchant = config.upiVerifiedByMerchant
  }
  if (config.method === 'bank') {
    paymentConfig.bankAccount = config.bankAccount?.trim()
    paymentConfig.bankIfsc = config.bankIfsc?.toUpperCase().trim()
    paymentConfig.bankName = config.bankName?.trim()
    paymentConfig.accountHolderName = config.accountHolderName?.trim()
  }

  const intentResult = await submitIntent({
    intentId: crypto.randomUUID(),
    intentType: 'tenant.update_payment_config',
    intentVersion: 1,
    tenantId,
    actor: `tenant:${tenantId}`,
    source: 'app',
    timestamp: new Date().toISOString(),
    causationId: null,
    correlationId: null,
    payload: { payment_config: paymentConfig },
    nonce: crypto.randomUUID(),
  }, 'app')

  if (!intentResult.accepted) {
    return NextResponse.json({ error: intentResult.error || 'Authority rejected update' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: paymentConfig })
}

export async function PATCH(request: NextRequest) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await validateJsonBody<{
      section: string
      data: unknown
    }>(request, {
      fields: {
        section: { required: true, type: 'string' },
        data: { required: true, type: 'object' },
      },
    })
    if (body.response) return body.response

    const { section, data } = body.data!

    switch (section) {
      case 'payment':
        return handlePaymentSection(data, tenantId)
      default:
        return NextResponse.json({ error: `Unknown settings section: ${section}` }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[Settings PATCH] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
