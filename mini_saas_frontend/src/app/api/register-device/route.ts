import { NextRequest, NextResponse } from 'next/server'
import { db, uuid } from '@/lib/billzo/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, fcmToken, deviceType } = body

    if (!tenantId || !fcmToken || !deviceType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['android', 'ios', 'web'].includes(deviceType)) {
      return NextResponse.json({ error: 'Invalid device type' }, { status: 400 })
    }

    // Check if token already exists for this tenant
    const existing = await db().deviceTokens
      .where('tenantId')
      .equals(tenantId)
      .and(t => t.fcmToken === fcmToken)
      .first()

    if (existing) {
      return NextResponse.json({ success: true, message: 'Token already registered' })
    }

    // Add new device token
    await db().deviceTokens.add({
      id: uuid(),
      tenantId,
      fcmToken,
      deviceType,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Register device error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, fcmToken } = body

    if (!tenantId || !fcmToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Find and delete the token
    const existing = await db().deviceTokens
      .where('tenantId')
      .equals(tenantId)
      .and(t => t.fcmToken === fcmToken)
      .first()

    if (existing) {
      await db().deviceTokens.delete(existing.id)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Unregister device error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}