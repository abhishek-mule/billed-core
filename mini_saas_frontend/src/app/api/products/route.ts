import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db, uuid } from '@/lib/billzo/db'
import type { Product } from '@/lib/billzo/types'

function getTenantId(request: NextRequest): string | null {
  const cookieStore = cookies()
  return cookieStore.get('bz_tenant')?.value || null
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, barcode, hsn, gstRate, stock, lowStockAt, salePrice, purchasePrice, unit } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const product: Product = {
      id: uuid(),
      tenantId,
      name: name.trim(),
      barcode: barcode || undefined,
      hsn: hsn || undefined,
      gstRate: gstRate ?? 0,
      stock: stock ?? 0,
      lowStockAt: lowStockAt ?? 10,
      salePrice: salePrice ?? 0,
      purchasePrice: purchasePrice ?? 0,
      unit: unit || 'pcs',
      createdAt: now,
      updatedAt: now,
    }

    await db().products.add(product)
    return NextResponse.json({ success: true, product })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const products = await db().products.where('tenantId').equals(tenantId).toArray()
    return NextResponse.json({ success: true, products })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}