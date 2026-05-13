import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import { autofillFromInput, validateGSTIN, validateUPI } from '@/lib/billzo/autofill'
import { getTokenFromRequest, verifyAccessToken } from '@/lib/billzo/auth-jwt'
import { type PlanType } from '@/lib/billzo/plan-limits'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shopName, phone, upiId, gstin } = body
    const token = getTokenFromRequest(request)
    const authPayload = token ? verifyAccessToken(token) : null
    const userId = authPayload?.userId

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!shopName?.trim()) {
      return NextResponse.json(
        { error: 'Shop name is required' },
        { status: 400 }
      )
    }

    if (shopName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Shop name must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (gstin) {
      const gstValidation = validateGSTIN(gstin)
      if (!gstValidation.valid) {
        return NextResponse.json(
          { error: gstValidation.error },
          { status: 400 }
        )
      }
    }

    if (upiId) {
      const upiValidation = validateUPI(upiId)
      if (!upiValidation.valid) {
        return NextResponse.json(
          { error: upiValidation.error },
          { status: 400 }
        )
      }
    }

    const existingTenant = await db().tenants
      .where('ownerUserId')
      .equals(userId)
      .first()

    if (existingTenant) {
      await db().tenants.update(existingTenant.id, {
        name: shopName.trim(),
        phone: phone || existingTenant.phone,
        upiId: upiId || existingTenant.upiId,
        gstin: gstin || existingTenant.gstin,
        updatedAt: new Date().toISOString(),
      })

      return NextResponse.json({
        success: true,
        tenantId: existingTenant.id,
        updated: true,
        name: shopName.trim(),
      }, {
        headers: {
          'Set-Cookie': `bz_tenant_name=${encodeURIComponent(shopName.trim())}; Path=/; Max-Age=${30*24*3600}${process.env.NODE_ENV === 'production' ? '; SameSite=Lax; Secure' : '; SameSite=Lax'}`,
        },
      })
    }

    const { shopName: inferredName, phone: inferredPhone, upiId: finalUPI, gstin: finalGSTIN } =
      await autofillFromInput({ shopName, phone, upiId, gstin })

    const tenantId = `tenant_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const now = new Date().toISOString()

    await db().tenants.add({
      id: tenantId,
      name: inferredName,
      ownerUserId: userId,
      phone: inferredPhone || phone,
      upiId: finalUPI,
      gstin: finalGSTIN,
      plan: 'starter' as PlanType,
      paywallUnlocked: false,
      invoiceCount: 0,
      reminderCount: 0,
      createdAt: now,
      updatedAt: now,
    } as any)

    return NextResponse.json({
      success: true,
      tenantId,
      created: true,
      name: inferredName,
    }, {
      headers: {
        'Set-Cookie': `bz_tenant_name=${encodeURIComponent(inferredName)}; Path=/; Max-Age=${30*24*3600}${process.env.NODE_ENV === 'production' ? '; SameSite=Lax; Secure' : '; SameSite=Lax'}`,
      },
    })
  } catch (error) {
    console.error('Tenant creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create shop. Please try again.' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const tenant = await db().tenants
      .where('ownerUserId')
      .equals(userId)
      .first()

    if (!tenant) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        phone: tenant.phone,
        invoiceCount: tenant.invoiceCount,
        reminderCount: tenant.reminderCount,
      },
    })
  } catch (error) {
    console.error('Tenant fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tenant' },
      { status: 500 }
    )
  }
}
