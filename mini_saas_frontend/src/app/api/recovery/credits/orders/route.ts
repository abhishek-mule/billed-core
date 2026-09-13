export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import {
  verifyRequest,
  validateJsonBody,
  errorResponse,
  logApiAccess,
} from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { recoveryCreditPacketByCode } from '@billzo/shared'

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null

/**
 * Create a Razorpay order for a recovery-credit top-up packet.
 * The chargeable amount is COMPUTED SERVER-SIDE from the shared packet
 * catalog — a client-supplied amount is never accepted here.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const bodyResult = await validateJsonBody<{ packetCode: string }>(request, {
      fields: { packetCode: { required: true, type: 'string' } },
    })
    if (bodyResult.response) return bodyResult.response

    const packet = recoveryCreditPacketByCode(bodyResult.data!.packetCode)
    if (!packet) {
      return errorResponse('Unknown recovery credit packet', 400)
    }

    if (!razorpay) {
      return errorResponse('Payment gateway not configured', 503)
    }

    logApiAccess(request, tenantId, userId, `recovery_credits.create_order:${packet.code}`)

    const receipt = `rc_${tenantId.slice(-8)}_${packet.code}_${Date.now()}`

    const order = await razorpay.orders.create({
      amount: packet.pricePaise,
      currency: 'INR',
      receipt,
      notes: {
        packetCode: packet.code,
        credits: packet.credits,
        tenantId,
        source: 'billzo_recovery_credits',
      },
    })

    // Server-authoritative order record. The charge is from the packet catalog,
    // never from the client.
    const { error: insertError } = await supabaseAdmin
      .from('recovery_credit_orders')
      .insert({
        tenant_id: tenantId,
        razorpay_order_id: order.id,
        packet_code: packet.code,
        credits: packet.credits,
        amount_paise: order.amount,
        currency: order.currency || 'INR',
        status: 'created',
        metadata: { packetCode: packet.code },
      })

    if (insertError) {
      console.error('[RecoveryCredits] order insert failed', insertError)
      return errorResponse('Failed to persist order', 500)
    }

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      credits: packet.credits,
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('[RecoveryCredits:orders] Error:', error)
    return NextResponse.json(
      { error: error.error?.description || 'Failed to create order' },
      { status: 500 },
    )
  }
}