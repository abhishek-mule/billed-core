import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export const dynamic = 'force-dynamic'

interface EnrichmentResult {
  name: string
  brand?: string
  category?: string
  gstRate: number
  purchasePrice: number
  salePrice: number
  suggestedStock: number
  suggestedUnit: string
  source: string
  confidence: number
}

function buildEnrichPrompt(barcode: string): string {
  let prompt = `You are a product cataloging assistant for an Indian small business inventory management app.\n\n`
  prompt += `Barcode: ${barcode}\n`
  prompt += `\nBased on the barcode, estimate the following for an Indian retail/wholesale business:\n`
  prompt += `- "name": The clean product name (English, max 60 chars)\n`
  prompt += `- "brand": Brand name or "Generic" if unknown\n`
  prompt += `- "category": Product category (e.g., "Beverages", "Dairy", "Snacks", "Personal Care", "Groceries", "Electronics", "Stationery")\n`
  prompt += `- "gstRate": GST rate — use 0, 5, 12, 18, or 28. Default to 18% for most items.\n`
  prompt += `- "purchasePrice": Estimated wholesale/invoice price in INR\n`
  prompt += `- "salePrice": Recommended retail selling price in INR (typically 10-30% above purchase price)\n`
  prompt += `- "suggestedStock": Initial stock quantity (suggest 10 for new products)\n`
  prompt += `- "suggestedUnit": Unit of measurement (e.g., "pcs", "boxes", "packs", "kg", "liters", "dozen")\n`
  prompt += `- "confidence": 0-100 confidence in your suggestions\n`
  prompt += `Respond ONLY with valid JSON:\n`
  prompt += `{"name": "", "brand": "", "category": "", "gstRate": 18, "purchasePrice": 0, "salePrice": 0, "suggestedStock": 10, "suggestedUnit": "pcs", "confidence": 50}`

  return prompt
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 400,
        topP: 0.8,
      },
    }),
  })

  if (!response.ok) throw new Error(`Gemini API error ${response.status}`)
  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Empty Gemini response')
  return text
}

function parseGeminiResponse(text: string): Partial<EnrichmentResult> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON')

  const p = JSON.parse(jsonMatch[0])
  return {
    name: p.name || '',
    brand: p.brand || undefined,
    category: p.category || undefined,
    gstRate: [0, 5, 12, 18, 28].includes(p.gstRate) ? p.gstRate : 18,
    purchasePrice: Number(p.purchasePrice) || 0,
    salePrice: Number(p.salePrice) || 0,
    suggestedStock: Number(p.suggestedStock) || 10,
    suggestedUnit: p.suggestedUnit || 'pcs',
    confidence: Number(p.confidence) || 50,
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const body = await request.json()
    const { barcode } = body

    if (!barcode) {
      return NextResponse.json({ error: 'Barcode required' }, { status: 400 })
    }

    const geminiEnrichment = await callGemini(buildEnrichPrompt(barcode))
    const enrichment = parseGeminiResponse(geminiEnrichment)

    const result: EnrichmentResult = {
      name: enrichment.name || 'Unknown Product',
      brand: enrichment.brand || undefined,
      category: enrichment.category || undefined,
      gstRate: enrichment.gstRate || 18,
      purchasePrice: enrichment.purchasePrice || 0,
      salePrice: enrichment.salePrice || 0,
      suggestedStock: enrichment.suggestedStock || 10,
      suggestedUnit: enrichment.suggestedUnit || 'pcs',
      source: 'gemini',
      confidence: enrichment.confidence || 50,
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[OCR Enrich] Error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Enrichment failed' }, { status: 500 })
  }
}
