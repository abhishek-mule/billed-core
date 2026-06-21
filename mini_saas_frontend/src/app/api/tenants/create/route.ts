import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedUserIdFromRequest } from '@/lib/billzo/auth-jwt'

export async function POST(request: NextRequest) {
  try {
    const userId = getVerifiedUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { shopName, phone, upiId, gstin } = body

    if (!shopName || !shopName.trim()) {
      return NextResponse.json({ error: 'Shop name is required' }, { status: 400 })
    }

    // Check if user already has an active tenant membership
    const { data: existingMembership, error: membershipError } = await supabaseAdmin
      .from('tenant_memberships')
      .select('tenant_id, role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (membershipError) {
      console.error('[TenantCreate] Membership check error:', membershipError)
      return NextResponse.json({ error: 'Failed to check existing tenant' }, { status: 500 })
    }

    if (existingMembership) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('id, name, onboarding_state')
        .eq('id', existingMembership.tenant_id)
        .single()

      return NextResponse.json({
        tenantId: tenant?.id || existingMembership.tenant_id,
        tenantName: tenant?.name || shopName.trim(),
        onboardingState: tenant?.onboarding_state || 'incomplete',
        role: existingMembership.role,
        alreadyExists: true
      })
    }

    // Create new tenant
    const tenantId = `tenant_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()

    const { error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        id: tenantId,
        name: shopName.trim(),
        phone: phone?.trim() || null,
        upi_id: upiId?.trim() || null,
        gstin: gstin?.trim().toUpperCase() || null,
        plan: 'starter',
        paywall_unlocked: false,
        white_label: false,
        auto_mode: true,
        invoice_count: 0,
        reminder_count: 0,
        onboarding_state: 'incomplete',
        created_at: now,
        updated_at: now
      })

    if (tenantError) {
      console.error('[TenantCreate] Tenant insert error:', tenantError)
      return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 })
    }

    // Create membership
    const { error: membershipInsertError } = await supabaseAdmin
      .from('tenant_memberships')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        role: 'owner',
        is_active: true
      })

    if (membershipInsertError) {
      console.error('[TenantCreate] Membership insert error:', membershipInsertError)
      // Attempt rollback
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
      return NextResponse.json({ error: 'Failed to create tenant membership' }, { status: 500 })
    }

    return NextResponse.json({
      tenantId,
      tenantName: shopName.trim(),
      onboardingState: 'incomplete',
      role: 'owner',
      alreadyExists: false
    })

  } catch (error: any) {
    console.error('[TenantCreate] Unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}