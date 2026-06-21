import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

interface CatalogProduct {
  id: string
  name: string
  barcode?: string
  salePrice: number
  unit?: string
}

interface MatchRequestItem {
  name: string
  quantity: number
  rate: number
}

interface MatchRequest {
  items: MatchRequestItem[]
  vendorName: string
  catalog: CatalogProduct[]
}

interface ProductMatchResult {
  ocrName: string
  matchedProductId: string | null
  matchedProductName: string | null
  confidence: number
  suggestedName: string | null
  reason: string
}

function buildPrompt(req: MatchRequest): string {
  const { items, vendorName, catalog } = req
  const catalogStr = catalog.map(p =>
    `  - id: ${p.id}, name: "${p.name}"${p.barcode ? `, barcode: ${p.barcode}` : ''}, price: ${p.salePrice}${p.unit ? `, unit: ${p.unit}` : ''}`
  ).join('\n')

  const itemsStr = items.map(i => `  - "${i.name}" (qty: ${i.quantity}, rate: ${i.rate})`).join('\n')

  return `You are a product matching specialist for an Indian retail billing app.

A merchant scanned an invoice from vendor "${vendorName || 'Unknown'}".
The OCR extracted these items:
${itemsStr}

The merchant's product catalog has these items:
${catalogStr}

Task: For each OCR-extracted item, find the best matching product in the catalog.

Rules:
- Match based on name similarity, even with OCR typos (e.g., "Amul G0ld" → "Amul Gold")
- Consider common Indian product name variations
- If no good match exists (>50% confidence), return null for matchedProductId
- Suggest a corrected name if the OCR name is clearly wrong
- For items with exact or near-exact matches, return high confidence (85-99)
- For partial matches, return medium confidence (50-84)
- Consider the vendor name context

Return ONLY valid JSON:
{"matches": [
  {
    "ocrName": "original OCR name",
    "matchedProductId": "catalog product id or null",
    "matchedProductName": "catalog product name or null",
    "confidence": 92,
    "suggestedName": "corrected name or null",
    "reason": "brief match explanation"
  }
]}

If no matches found for any item, return {"matches": []}`
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured')

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
    }),
  })

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const req: MatchRequest = await request.json()

    if (!req.items || req.items.length === 0 || !req.catalog || req.catalog.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    const prompt = buildPrompt(req)
    const raw = await callGemini(prompt)

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ matches: [] })

    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json({ matches: result.matches || [] })
  } catch (err: any) {
    console.error('[ProductMatch] Error:', err)
    return NextResponse.json({ matches: [] })
  }
}
