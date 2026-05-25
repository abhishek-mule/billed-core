import Dexie, { type Table } from 'dexie'

export type CorrectionFieldType = 'item_name' | 'item_quantity' | 'item_rate' | 'total' | 'supplier' | 'invoice_number' | 'date' | 'gstin'

export interface OcrCorrection {
  id: string
  tenantId: string
  vendorName: string
  fieldType: CorrectionFieldType
  rawValue: string
  correctedValue: string
  count: number
  rawHash: string
  firstCorrectedAt: string
  lastCorrectedAt: string
}

export interface AppliedCorrection {
  field: string
  from: string
  to: string
  confidence: number
  reason: string
}

class CorrectionDB extends Dexie {
  corrections!: Table<OcrCorrection, string>

  constructor() {
    super('billzo_corrections_v1')
    this.version(1).stores({
      corrections: 'id, tenantId, vendorName, fieldType, rawHash, [tenantId+vendorName]',
    })
  }
}

let instance: CorrectionDB | null = null

function getDB(): CorrectionDB {
  if (!instance) instance = new CorrectionDB()
  return instance
}

function hashValue(val: string): string {
  let h = 0
  const s = val.toLowerCase().trim()
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(16)
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function learnCorrection(
  tenantId: string,
  vendorName: string,
  fieldType: CorrectionFieldType,
  rawValue: string,
  correctedValue: string
): Promise<void> {
  if (!tenantId || !vendorName || rawValue === correctedValue) return

  const raw = String(rawValue).trim()
  const corrected = String(correctedValue).trim()
  if (!raw || !corrected || raw === corrected) return

  const db = getDB()
  const rvHash = hashValue(raw)

  const existing = await db.corrections
    .where('[tenantId+vendorName]')
    .equals([tenantId, vendorName.toLowerCase()])
    .filter(c => c.fieldType === fieldType && c.rawHash === rvHash && c.rawValue.toLowerCase() === raw.toLowerCase())
    .first()

  if (existing) {
    await db.corrections.update(existing.id, {
      correctedValue: corrected,
      count: existing.count + 1,
      lastCorrectedAt: new Date().toISOString(),
    })
  } else {
    await db.corrections.add({
      id: uuid(),
      tenantId,
      vendorName: vendorName.toLowerCase(),
      fieldType,
      rawValue: raw,
      correctedValue: corrected,
      count: 1,
      rawHash: rvHash,
      firstCorrectedAt: new Date().toISOString(),
      lastCorrectedAt: new Date().toISOString(),
    })
  }
}

export async function getCorrectionsForVendor(
  tenantId: string,
  vendorName: string
): Promise<OcrCorrection[]> {
  if (!tenantId || !vendorName) return []
  const db = getDB()
  return db.corrections
    .where('[tenantId+vendorName]')
    .equals([tenantId, vendorName.toLowerCase()])
    .toArray()
}

export async function applyKnownCorrections(
  data: Record<string, any>,
  vendorName: string,
  tenantId: string
): Promise<{ corrected: Record<string, any>; applied: AppliedCorrection[] }> {
  const corrections = await getCorrectionsForVendor(tenantId, vendorName)
  if (corrections.length === 0) return { corrected: { ...data }, applied: [] }

  const result = { ...data }
  const applied: AppliedCorrection[] = []

  for (const c of corrections) {
    if (c.count < 2) continue

    let currentValue: string | undefined

    switch (c.fieldType) {
      case 'supplier':
        currentValue = result.supplier
        break
      case 'invoice_number':
        currentValue = result.invoice_number
        break
      case 'date':
        currentValue = result.date
        break
      case 'total':
        currentValue = String(result.total ?? '')
        break
      case 'item_name':
        if (Array.isArray(result.items)) {
          for (const item of result.items) {
            if (item.name?.toLowerCase().trim() === c.rawValue.toLowerCase().trim()) {
              const from = item.name
              item.name = c.correctedValue
              applied.push({ field: `item_name:${item.name}`, from, to: c.correctedValue, confidence: Math.min(95, 70 + c.count * 5), reason: `Corrected from ${c.count} past fix(es)` })
            }
          }
        }
        continue
      default:
        continue
    }

    if (currentValue && currentValue.toLowerCase().trim() === c.rawValue.toLowerCase().trim()) {
      const from = currentValue
      if (c.fieldType === 'total') {
        result.total = Number(c.correctedValue)
      } else {
        result[c.fieldType] = c.correctedValue
      }
      applied.push({ field: c.fieldType, from, to: c.correctedValue, confidence: Math.min(95, 70 + c.count * 5), reason: `Corrected from ${c.count} past fix(es)` })
    }
  }

  return { corrected: result, applied }
}

export async function getVendorCorrectionStats(tenantId: string): Promise<{ vendorName: string; totalCorrections: number }[]> {
  const db = getDB()
  const all = await db.corrections.where('tenantId').equals(tenantId).toArray()
  const stats = new Map<string, number>()
  for (const c of all) {
    stats.set(c.vendorName, (stats.get(c.vendorName) || 0) + c.count)
  }
  return Array.from(stats.entries())
    .map(([vendorName, totalCorrections]) => ({ vendorName, totalCorrections }))
    .sort((a, b) => b.totalCorrections - a.totalCorrections)
}

export async function clearCorrectionsForVendor(tenantId: string, vendorName: string): Promise<void> {
  const db = getDB()
  const corrections = await db.corrections
    .where('[tenantId+vendorName]')
    .equals([tenantId, vendorName.toLowerCase()])
    .toArray()
  await db.corrections.bulkDelete(corrections.map(c => c.id))
}

export async function getTotalCorrectionCount(tenantId: string): Promise<number> {
  const db = getDB()
  const all = await db.corrections.where('tenantId').equals(tenantId).toArray()
  return all.reduce((s, c) => s + c.count, 0)
}

export function detectFieldType(key: string, value: any): CorrectionFieldType | null {
  switch (key) {
    case 'supplier': return 'supplier'
    case 'invoice_number': return 'invoice_number'
    case 'date': return 'date'
    case 'total': return 'total'
    default: return null
  }
}

export async function learnFromInvoiceDiff(
  original: Record<string, any>,
  final: Record<string, any>,
  tenantId: string,
  vendorName: string
): Promise<void> {
  if (!tenantId || !vendorName) return

  const scalarFields: (keyof typeof original)[] = ['supplier', 'invoice_number', 'date', 'total']

  for (const field of scalarFields) {
    const origVal = String(original[field] ?? '')
    const finalVal = String(final[field] ?? '')
    if (origVal && finalVal && origVal !== finalVal) {
      const ft = detectFieldType(field, original[field])
      if (ft) {
        await learnCorrection(tenantId, vendorName, ft, origVal, finalVal)
      }
    }
  }

  const origItems: any[] = original.items || []
  const finalItems: any[] = final.items || []

  for (let i = 0; i < Math.min(origItems.length, finalItems.length); i++) {
    const oi = origItems[i]
    const fi = finalItems[i]
    if (!oi || !fi) continue

    if (oi.name && fi.name && oi.name !== fi.name) {
      await learnCorrection(tenantId, vendorName, 'item_name', oi.name, fi.name)
    }

    if (oi.quantity !== undefined && fi.quantity !== undefined && oi.quantity !== fi.quantity) {
      await learnCorrection(tenantId, vendorName, 'item_quantity', String(oi.quantity), String(fi.quantity))
    }

    if (oi.rate !== undefined && fi.rate !== undefined && oi.rate !== fi.rate) {
      await learnCorrection(tenantId, vendorName, 'item_rate', String(oi.rate), String(fi.rate))
    }
  }
}
