import type { ExtractionPassBundle, FieldEvidence, GeometryEvidence, ScanSessionPayload } from './scan-types'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

function cleanLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseAmount(text: string) {
  const match = text.match(/(\d[\d,]*\.?\d{0,2})\s*$/)
  if (!match) return undefined
  return Number(match[1].replace(/,/g, ''))
}

function moneyEvidence(field: string, reason: string, confidence: number, zone: GeometryEvidence['zone']): FieldEvidence {
  return { field, pass: 'numeric_pass', reason, confidence, zone }
}

function extractDate(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/)
    if (match) return match[1]
  }
  return undefined
}

function extractGstin(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d]Z[A-Z\d]\b/i)
    if (match) return match[0].toUpperCase()
  }
  return undefined
}

function extractInvoiceNumber(lines: string[]) {
  for (const line of lines.slice(0, 10)) {
    const normalized = line.toLowerCase()
    if (normalized.includes('invoice') || normalized.includes('bill no') || normalized.includes('bill#')) {
      const match = line.match(/(?:invoice|bill)\s*(?:no|#|number)?[:\-\s]*([A-Z0-9\-\/]+)/i)
      if (match) return match[1]
    }
  }
  return undefined
}

function extractSupplier(lines: string[]) {
  return lines[0] || undefined
}

function extractTotals(lines: string[]) {
  let subtotal: number | undefined
  let tax: number | undefined
  let total: number | undefined
  let totalCandidates: Array<{ value: number; line: string }> = []

  for (const line of lines) {
    const raw = line.toLowerCase()
    const amount = parseAmount(line)
    if (amount === undefined) continue

    if (raw.includes('total') || raw.includes('grand total') || raw.includes('net amount') || /^total\b/.test(raw)) {
      totalCandidates.push({ value: amount, line })
    } else if (raw.includes('sub total') || raw.includes('subtotal')) {
      subtotal = amount
    } else if (raw.includes('gst') || raw.includes('tax') || raw.includes('cgst') || raw.includes('sgst') || raw.includes('igst')) {
      tax = (tax || 0) + amount
    }
  }

  if (totalCandidates.length > 0) {
    total = totalCandidates[totalCandidates.length - 1].value
  }
  if (total === undefined && subtotal !== undefined) {
    total = subtotal + (tax || 0)
  }

  return { subtotal, tax, total }
}

function extractItems(lines: string[]): ExtractionPassBundle['productPass']['items'] {
  const items: ExtractionPassBundle['productPass']['items'] = []

  for (const line of lines) {
    if (items.length >= 20) break

    const raw = line.toLowerCase()
    if (
      raw.includes('total') ||
      raw.includes('gst') ||
      raw.includes('tax') ||
      raw.includes('sub total') ||
      raw.includes('subtotal') ||
      raw.includes('change') ||
      raw.includes('cash') ||
      raw.includes('round') ||
      raw.includes('invoice') ||
      raw.includes('bill') ||
      raw.includes('date') ||
      raw.includes('gstin') ||
      raw.includes('supplier') ||
      raw.includes('address') ||
      raw.includes('phone')
    ) continue

    const amount = parseAmount(line)
    if (!amount || amount <= 0) continue

    const name = line.replace(/\s+\d[\d,]*\.?\d{0,2}\s*$/, '').trim()
    if (!name || name.length < 3) continue

    items.push({
      name,
      quantity: 1,
      rate: amount,
      amount,
      confidence: 68,
      evidence: [
        { field: `item:${name}`, pass: 'product_pass', confidence: 68, reason: 'Parsed from receipt row', zone: 'table' },
      ],
    })
  }

  return items
}

async function callGemini(imageBase64: string | undefined, rawText: string) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey || !imageBase64) return null

  const prompt = `You are extracting structured purchase receipt data for an Indian retail billing system.
Return JSON only:
{"supplier":"","invoice_number":"","date":"","gstin":"","subtotal":0,"tax":0,"total":0,"items":[{"name":"","quantity":1,"rate":0,"amount":0}],"confidence":0}
Prefer deterministic reading. Use OCR text only as support:
${rawText.slice(0, 4000)}`

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 700,
      },
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) return null
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

function buildGeometry(lines: string[]) {
  const totalIdx = lines.findIndex((line) => {
    const raw = line.toLowerCase()
    return raw.includes('total') || raw.includes('grand total') || raw.includes('net amount')
  })

  const evidence: GeometryEvidence[] = []
  if (totalIdx >= 0) {
    const totalLine = totalIdx + 1
    evidence.push({ zone: 'totals', startLine: totalLine, endLine: totalLine, confidence: 85, reason: `Total found at row ${totalLine}` })
    evidence.push({ zone: 'header', startLine: 1, endLine: 3, confidence: 90, reason: 'First rows detected as header' })
    evidence.push({ zone: 'table', startLine: 4, endLine: Math.max(4, totalLine - 1), confidence: 75, reason: `Rows before total (${totalLine - 1}) detected as table` })
  } else {
    evidence.push({ zone: 'table', startLine: 1, endLine: lines.length, confidence: 60, reason: 'Flat structure — no totals row found' })
  }

  return evidence
}

function preferString(primary: string | undefined, fallback: unknown) {
  const normalized = String(fallback || '').trim()
  return primary || normalized || undefined
}

function preferNumber(primary: number | undefined, fallback: unknown) {
  if (primary !== undefined) return primary
  const parsed = Number(fallback || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export async function runExtractionPasses(input: ScanSessionPayload): Promise<ExtractionPassBundle> {
  const rawText = input.rawText || ''
  const lines = cleanLines(rawText)
  const geometry = buildGeometry(lines)
  const totals = extractTotals(lines)
  let supplier: string | undefined = extractSupplier(lines)
  let invoiceNumber: string | undefined = extractInvoiceNumber(lines)
  let date: string | undefined = extractDate(lines)
  let gstin: string | undefined = extractGstin(lines)
  let items = extractItems(lines)

  const needsFallback = !supplier || !totals.total || items.length === 0
  if (needsFallback) {
    const ai = await callGemini(input.croppedCompressedImage || input.previewImage, rawText)
    if (ai) {
      supplier = preferString(supplier, ai.supplier)
      invoiceNumber = preferString(invoiceNumber, ai.invoice_number)
      date = preferString(date, ai.date)
      gstin = preferString(gstin, ai.gstin)
      totals.subtotal = preferNumber(totals.subtotal, ai.subtotal)
      totals.tax = preferNumber(totals.tax, ai.tax)
      totals.total = preferNumber(totals.total, ai.total)
      if (items.length === 0 && Array.isArray(ai.items)) {
        items = (ai.items as Array<Record<string, unknown>>).map((item) => ({
          name: String(item.name || ''),
          quantity: Number(item.quantity || 1),
          rate: Number(item.rate || 0),
          amount: Number(item.amount || 0),
          confidence: Number(ai.confidence || 68),
          evidence: [
            { field: `item:${String(item.name || '')}`, pass: 'ai_fallback' as const, confidence: Number(ai.confidence || 68), reason: 'Recovered from multimodal fallback', zone: 'table' as const },
          ] as FieldEvidence[],
        })).filter((item) => item.name)
      }
    }
  }

  return {
    barcodePass: {
      barcodes: [],
      confidence: 0,
    },
    geometryPass: {
      totalsZoneFound: geometry.some((item) => item.zone === 'totals'),
      rowsDetected: items.length,
      columnGroups: items.length > 0 ? 4 : 1,
      evidence: geometry,
    },
    layoutPass: {
      headerLines: lines.slice(0, 3),
      tableLines: [],
      totalLines: [],
    },
    numericPass: {
      supplier,
      invoiceNumber,
      date,
      gstin,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    },
    productPass: {
      items,
    },
  }
}

export function buildFastHeaderPayload(bundle: ExtractionPassBundle) {
  return {
    supplier: bundle.numericPass.supplier,
    invoiceNumber: bundle.numericPass.invoiceNumber,
    date: bundle.numericPass.date,
    gstin: bundle.numericPass.gstin,
  }
}

export function buildTotalsPayload(bundle: ExtractionPassBundle) {
  return {
    subtotal: bundle.numericPass.subtotal,
    tax: bundle.numericPass.tax,
    total: bundle.numericPass.total,
  }
}
