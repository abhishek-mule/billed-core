import Dexie, { type Table } from 'dexie'

export interface SkuMapping {
  id: string
  tenantId: string
  vendorName: string
  ocrName: string
  productId: string
  productName: string
  matchCount: number
  lastMatchedAt: string
}

export interface ProductMatch {
  ocrName: string
  matchedProduct: { id: string; name: string; barcode?: string; salePrice: number; unit?: string } | null
  confidence: number
  suggestedName?: string
}

class SkuDB extends Dexie {
  skuMappings!: Table<SkuMapping, string>

  constructor() {
    super('billzo_sku_v1')
    this.version(1).stores({
      skuMappings: 'id, tenantId, vendorName, productId, [tenantId+vendorName]',
    })
  }
}

let instance: SkuDB | null = null

function getDB(): SkuDB {
  if (!instance) instance = new SkuDB()
  return instance
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function getSkuSuggestions(
  ocrName: string,
  vendorName: string,
  tenantId: string
): Promise<SkuMapping | null> {
  if (!ocrName || !vendorName || !tenantId) return null
  const db = getDB()
  const name = ocrName.toLowerCase().trim()
  const result = await db.skuMappings
    .where('[tenantId+vendorName]')
    .equals([tenantId, vendorName.toLowerCase()])
    .filter(m => m.ocrName.toLowerCase().trim() === name)
    .first()
  return result || null
}

export async function recordSkuMapping(
  ocrName: string,
  productId: string,
  productName: string,
  vendorName: string,
  tenantId: string
): Promise<void> {
  if (!ocrName || !productId || !vendorName || !tenantId) return
  const db = getDB()
  const normalizedOcr = ocrName.toLowerCase().trim()

  const existing = await db.skuMappings
    .where('[tenantId+vendorName]')
    .equals([tenantId, vendorName.toLowerCase()])
    .filter(m => m.ocrName.toLowerCase().trim() === normalizedOcr && m.productId === productId)
    .first()

  if (existing) {
    await db.skuMappings.update(existing.id, {
      matchCount: existing.matchCount + 1,
      lastMatchedAt: new Date().toISOString(),
    })
  } else {
    await db.skuMappings.add({
      id: uuid(),
      tenantId,
      vendorName: vendorName.toLowerCase(),
      ocrName: normalizedOcr,
      productId,
      productName,
      matchCount: 1,
      lastMatchedAt: new Date().toISOString(),
    })
  }
}

export async function findCatalogProducts(query: string, tenantId: string): Promise<{ id: string; name: string; barcode?: string; salePrice: number; unit?: string }[]> {
  const { db } = await import('@/lib/billzo/db')
  if (!tenantId) return []

  let products: any[]
  if (!query) {
    products = await db().products.where('tenantId').equals(tenantId).limit(50).toArray()
  } else {
    const q = query.toLowerCase().trim()
    products = await db().products
      .where('tenantId')
      .equals(tenantId)
      .filter((p): boolean => !!(p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))))
      .toArray()
  }

  return products.map(p => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    salePrice: p.salePrice,
    unit: p.unit,
  }))
}

export async function listSkuMappingsForTenant(tenantId: string): Promise<SkuMapping[]> {
  if (!tenantId) return []
  return getDB().skuMappings.where('tenantId').equals(tenantId).toArray()
}

export async function batchSuggest(
  items: { name: string; quantity: number; rate: number }[],
  vendorName: string,
  tenantId: string
): Promise<Map<string, ProductMatch>> {
  const matches = new Map<string, ProductMatch>()

  for (const item of items) {
    if (!item.name) continue
    const existingMapping = await getSkuSuggestions(item.name, vendorName, tenantId)
    if (existingMapping) {
      const product = await findCatalogProducts(existingMapping.productName, tenantId)
      const matched = product.find(p => p.id === existingMapping.productId)
      matches.set(item.name, {
        ocrName: item.name,
        matchedProduct: matched || null,
        confidence: Math.min(98, 70 + existingMapping.matchCount * 10),
        suggestedName: existingMapping.productName,
      })
    } else {
      const catalogHits = await findCatalogProducts(item.name, tenantId)
      if (catalogHits.length > 0) {
        const best = catalogHits[0]
        matches.set(item.name, {
          ocrName: item.name,
          matchedProduct: best,
          confidence: 65,
        })
      }
    }
  }

  return matches
}
