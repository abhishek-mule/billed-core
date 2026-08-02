import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { submitIntent } from '@/lib/authority/transport'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('logo') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 })
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. PNG, JPEG, WebP, SVG, or GIF only.' }, { status: 400 })
    }

    const ext = file.type.split('/')[1] === 'svg+xml' ? 'svg' : file.type.split('/')[1]
    const fileName = `logos/${tenantId}/${crypto.randomUUID()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('merchant-assets')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabaseAdmin
      .storage
      .from('merchant-assets')
      .getPublicUrl(fileName)

    const intentResult = await submitIntent({
      intentId: crypto.randomUUID(),
      intentType: 'tenant.update_logo',
      intentVersion: 1,
      tenantId,
      actor: `tenant:${tenantId}`,
      source: 'app',
      timestamp: new Date().toISOString(),
      causationId: null,
      correlationId: null,
      payload: { logo: publicUrl },
      nonce: crypto.randomUUID(),
    }, 'app')

    if (!intentResult.accepted) {
      return NextResponse.json({ error: intentResult.error || 'Authority rejected update' }, { status: 500 })
    }

    return NextResponse.json({ url: publicUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const intentResult = await submitIntent({
      intentId: crypto.randomUUID(),
      intentType: 'tenant.remove_logo',
      intentVersion: 1,
      tenantId,
      actor: `tenant:${tenantId}`,
      source: 'app',
      timestamp: new Date().toISOString(),
      causationId: null,
      correlationId: null,
      payload: { logo: null },
      nonce: crypto.randomUUID(),
    }, 'app')

    if (!intentResult.accepted) {
      return NextResponse.json({ error: intentResult.error || 'Authority rejected update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
