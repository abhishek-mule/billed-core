import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedUserIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { checkRateLimit, incrementRateLimit } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const userId = getVerifiedUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimit(`merchant_create:ip:${ip}`, 3, 3600)
    if (!rl.allowed) return NextResponse.json({ error: rl.reason }, { status: 429 })
    await incrementRateLimit(`merchant_create:ip:${ip}`, 3600)

    const body = await validateJsonBody<{
      businessName: string
      phone: string
      gstin?: string
      category?: string
    }>(request, {
      fields: {
        businessName: { required: true, type: 'string', message: 'Business name is required' },
        phone: { required: true, type: 'string', message: 'WhatsApp number is required' },
      },
    })
    if (body.response) return body.response
    const { businessName, phone, gstin, category } = body.data!

    // Normalize phone to 10 digits
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    if (cleanPhone.length !== 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit WhatsApp number' }, { status: 400 })
    }

    // ── Check if user already has a membership (existing tenants table) ──
    const { data: existingMembership } = await supabaseAdmin
      .from('tenant_memberships')
      .select('tenant_id, role, tenants(id, name, onboarding_state)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (existingMembership) {
      const tenant = (existingMembership as any).tenants
      return NextResponse.json({
        merchantId: existingMembership.tenant_id,
        merchantName: tenant?.name || businessName,
        onboardingState: tenant?.onboarding_state || 'incomplete',
        role: existingMembership.role,
        alreadyExists: true,
      })
    }

    // ── Check if phone is already registered to another business ──
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (existingTenant) {
      return NextResponse.json({
        error: 'This WhatsApp number is already linked to another BillZo account.',
        hint: 'Please sign in using the email associated with that business, or contact support.',
        existingMerchantId: existingTenant.id,
      }, { status: 409 })
    }

    // ── Create tenant (merchant) ──
    const tenantId = `tenant_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()

    const { error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        id: tenantId,
        name: businessName.trim(),
        phone: cleanPhone,
        gstin: gstin?.trim().toUpperCase() || null,
        plan: 'starter',
        paywall_unlocked: false,
        white_label: false,
        auto_mode: true,
        invoice_count: 0,
        reminder_count: 0,
        onboarding_state: 'incomplete',
        created_at: now,
        updated_at: now,
      })

    if (tenantError) {
      console.error('[MerchantCreate] Insert error:', tenantError)
      return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 })
    }

    // ── Create membership (owner) ──
    const { error: membershipError } = await supabaseAdmin
      .from('tenant_memberships')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        role: 'owner',
        is_active: true,
      })

    if (membershipError) {
      console.error('[MerchantCreate] Membership insert error:', membershipError)
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
    }

    return NextResponse.json({
      merchantId: tenantId,
      merchantName: businessName.trim(),
      onboardingState: 'incomplete',
      role: 'owner',
      alreadyExists: false,
    })

  } catch (error: any) {
    console.error('[MerchantCreate] Unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
