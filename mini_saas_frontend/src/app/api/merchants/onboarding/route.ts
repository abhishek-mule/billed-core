import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

/**
 * Marks a merchant's onboarding as completed.
 * Flips tenants.onboarding_state -> 'active' and sets onboarding_completed_at.
 *
 * Per ARCHITECTURE_FREEZE_POLICY.md this is product/activation work, not a
 * platform expansion. It only writes the two existing onboarding columns.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date().toISOString()

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        onboarding_state: 'active',
        onboarding_completed_at: now,
        updated_at: now,
      })
      .eq('id', tenantId)

    if (error) {
      console.error('[MerchantOnboarding] Update error:', error)
      return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, onboardingState: 'active', completedAt: now })
  } catch (error: any) {
    console.error('[MerchantOnboarding] Unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
