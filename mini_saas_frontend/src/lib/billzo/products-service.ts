import { db, uuid, notifyChanged } from './db'
import { scheduleBackgroundSync } from './sync'
import type { Product, QueueItem, Activity } from './types'

const now = () => new Date().toISOString()

function enqueue(entity: QueueItem['entity'], entityId: string, action: QueueItem['action'], payload: unknown, tenantId: string) {
  const current = now()
  const idempotencyKey = `${tenantId}:${entity}:${entityId}:${action}`
  return db().queue.put({
    id: uuid(),
    tenantId,
    entity,
    entityId,
    action,
    payload,
    createdAt: current,
    updatedAt: current,
    attempts: 0,
    nextAttemptAt: current,
    status: 'pending',
    idempotencyKey,
    conflictPolicy: 'latest_write_wins',
  })
}

async function logActivity(tenantId: string, label: string, amount?: number, cta?: string) {
  const activity: Activity = { id: uuid(), tenantId, label, amount, cta, createdAt: now() }
  await db().activity.add(activity)
}

export interface CreateProductInput {
  tenantId: string
  name: string
  barcode?: string
  hsn?: string
  gstRate: number
  stock: number
  lowStockAt: number
  salePrice: number
  purchasePrice: number
  unit?: string
}

export async function createProduct(input: CreateProductInput): Promise<{ success: boolean; product?: Product; error?: string }> {
  try {
    const productId = uuid()
    const current = now()

    const product: Product = {
      id: productId,
      tenantId: input.tenantId,
      name: input.name.trim(),
      barcode: input.barcode || undefined,
      hsn: input.hsn || undefined,
      gstRate: input.gstRate ?? 0,
      stock: input.stock ?? 0,
      lowStockAt: input.lowStockAt ?? 10,
      salePrice: input.salePrice ?? 0,
      purchasePrice: input.purchasePrice ?? 0,
      unit: input.unit || 'pcs',
      createdAt: current,
      updatedAt: current,
    }

    await db().products.add(product)
    await enqueue('product', product.id, 'upsert', product, input.tenantId)
    await logActivity(input.tenantId, `Product created: ${product.name}`, product.salePrice)

    notifyChanged()
    scheduleBackgroundSync()

    return { success: true, product }
  } catch (error: any) {
    if (error.name === 'ConstraintError') {
      return { success: false, error: 'A product with this barcode already exists.' }
    }
    console.error('[Products] Create failed:', error)
    return { success: false, error: error.message || 'Failed to create product' }
  }
}

export async function updateProduct(productId: string, tenantId: string, updates: Partial<Product>): Promise<{ success: boolean; error?: string }> {
  try {
    const current = now()
    const existing = await db().products.get(productId)
    if (!existing) return { success: false, error: 'Product not found' }
    if (existing.tenantId !== tenantId) return { success: false, error: 'Unauthorized' }

    await db().products.update(productId, { ...updates, updatedAt: current })
    const updated = { ...existing, ...updates, updatedAt: current }
    await enqueue('product', productId, 'upsert', updated, tenantId)
    await logActivity(tenantId, `Product updated: ${updated.name}`)

    notifyChanged()
    scheduleBackgroundSync()

    return { success: true }
  } catch (error: any) {
    console.error('[Products] Update failed:', error)
    return { success: false, error: error.message || 'Failed to update product' }
  }
}

export async function deleteProduct(productId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db().products.get(productId)
    if (!existing) return { success: false, error: 'Product not found' }
    if (existing.tenantId !== tenantId) return { success: false, error: 'Unauthorized' }

    await db().products.delete(productId)
    await enqueue('product', productId, 'delete', { id: productId }, tenantId)
    await logActivity(tenantId, `Product deleted: ${existing.name}`)

    notifyChanged()
    scheduleBackgroundSync()

    return { success: true }
  } catch (error: any) {
    console.error('[Products] Delete failed:', error)
    return { success: false, error: error.message || 'Failed to delete product' }
  }
}

export async function retryProductSync(): Promise<number> {
  const due = new Date().toISOString()
  const failed = await db()
    .queue
    .where('status')
    .anyOf('failed', 'conflict')
    .filter((item) => item.nextAttemptAt <= due && item.attempts < 10)
    .toArray()

  for (const item of failed) {
    await db().queue.update(item.id, {
      status: 'pending',
      nextAttemptAt: now(),
      lastError: undefined,
      updatedAt: now(),
    })
  }

  notifyChanged()
  scheduleBackgroundSync(100)

  return failed.length
}
