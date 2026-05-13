import { db } from './db'

export type BarcodeLookupSource = 'local' | 'openfoodfacts' | 'openproductsfacts' | 'manual'

export type BarcodeLookupResult = {
  barcode: string
  name: string
  brand?: string
  imageUrl?: string
  source: BarcodeLookupSource
  confidence: number
}

type LookupOptions = {
  tenantId?: string | null
}

const CACHE_KEY = 'billzo_barcode_lookup_cache_v1'

function readCache(): Record<string, BarcodeLookupResult> {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeCache(code: string, value: BarcodeLookupResult) {
  if (typeof localStorage === 'undefined') return
  const cache = readCache()
  cache[code] = value
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

export function normalizeBarcode(raw: string) {
  return raw.trim().replace(/\D/g, '')
}

export function isValidGtin(code: string) {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code)) return false

  const digits = code.split('').map(Number)
  const check = digits.pop()
  if (check === undefined) return false

  let sum = 0
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) {
    sum += digits[i] * (pos % 2 === 0 ? 3 : 1)
  }

  return (10 - (sum % 10)) % 10 === check
}

function compactName(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .filter((part, index, arr) => arr.findIndex((p) => p?.toLowerCase() === part?.toLowerCase()) === index)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function lookupLocal(code: string, tenantId?: string | null): Promise<BarcodeLookupResult | null> {
  if (!tenantId) return null
  const product = await db().products.where('tenantId').equals(tenantId).and((p) => p.barcode === code).first()
  if (!product) return null

  return {
    barcode: code,
    name: product.name,
    source: 'local',
    confidence: 1,
  }
}

async function lookupOpenFacts(code: string, baseUrl: string, source: Exclude<BarcodeLookupSource, 'local' | 'manual'>) {
  const fields = [
    'product_name',
    'product_name_en',
    'generic_name',
    'brands',
    'quantity',
    'image_front_url',
    'image_url',
  ].join(',')
  const url = `${baseUrl}/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) return null

  const data = await response.json()
  const product = data?.product
  if (!product) return null

  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0]?.trim() : undefined
  const name = compactName([
    brand,
    product.product_name,
    product.product_name_en,
    product.generic_name,
    product.quantity,
  ])

  if (!name) return null

  return {
    barcode: code,
    name,
    brand,
    imageUrl: product.image_front_url || product.image_url,
    source,
    confidence: source === 'openfoodfacts' ? 0.82 : 0.72,
  } satisfies BarcodeLookupResult
}

export async function lookupBarcode(raw: string, options: LookupOptions = {}): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(raw)

  if (!barcode) {
    return { barcode: raw.trim(), name: '', source: 'manual', confidence: 0 }
  }

  const local = await lookupLocal(barcode, options.tenantId)
  if (local) return local

  const cached = readCache()[barcode]
  if (cached) return cached

  if (isValidGtin(barcode)) {
    const providers: Array<() => Promise<BarcodeLookupResult | null>> = [
      () => lookupOpenFacts(barcode, 'https://world.openfoodfacts.org', 'openfoodfacts'),
      () => lookupOpenFacts(barcode, 'https://world.openproductsfacts.org', 'openproductsfacts'),
    ]

    for (const provider of providers) {
      try {
        const result = await provider()
        if (result) {
          writeCache(barcode, result)
          return result
        }
      } catch {
        // Try the next free source.
      }
    }
  }

  return {
    barcode,
    name: '',
    source: 'manual',
    confidence: isValidGtin(barcode) ? 0.2 : 0.05,
  }
}
