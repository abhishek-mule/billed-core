import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export const dynamic = 'force-dynamic'

interface ExtractedItem {
  name: string
  quantity: number
  rate: number
  amount: number
}

interface ExtractedData {
  supplier?: string
  invoice_number?: string
  date?: string
  items: ExtractedItem[]
  subtotal?: number
  tax?: number
  total?: number
  raw_text?: string
  confidence: number
}

function buildInvoicePrompt(rawText: string): string {
  return `You are an expert Indian invoice parser. Extract structured billing data from this invoice/receipt text.

Return ONLY a valid JSON object with this exact schema:
{
  "supplier": "supplier name or null",
  "invoice_number": "invoice number or null",
  "date": "invoice date in YYYY-MM-DD format or null",
  "items": [{"name": "item name", "quantity": number, "rate": number, "amount": number}],
  "subtotal": number or null,
  "tax": number or null (GST amount in rupees),
  "total": number or null,
  "confidence": number (0-100, estimate how reliable your extraction is),
  "notes": "any warnings about missing/unclear fields"
}

Rules:
- If text is unclear, guess intelligently and lower confidence score
- GST is almost always 18% in India, calculate if not explicit
- Item names should be in original text form, in English
- Quantities and rates should be numbers, not strings
- Ignore transport/delivery charges unless clearly line items
- If total is missing, sum all item amounts + tax
- Date formats to parse: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or written dates
- If supplier name is in letterhead/logo area, still extract it
- "Subtotal" or "Grand Total" or "Amount Payable" are the key fields to find

Invoice text:
---
${rawText.slice(0, 4000)}
---`
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 800,
        topP: 0.8,
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Empty Gemini response')

  return text
}

function parseGeminiResponse(text: string): Partial<ExtractedData> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse JSON from Gemini response')

  const parsed = JSON.parse(jsonMatch[0])
  return {
    supplier: parsed.supplier || undefined,
    invoice_number: parsed.invoice_number || undefined,
    date: parsed.date || undefined,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : undefined,
    tax: typeof parsed.tax === 'number' ? parsed.tax : undefined,
    total: typeof parsed.total === 'number' ? parsed.total : undefined,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
    raw_text: text,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rawText, imageBase64, tenantId } = body

    if (!rawText || rawText.trim().length < 10) {
      return NextResponse.json(
        { error: 'Not enough text extracted. Please upload a clearer image.' },
        { status: 400 }
      )
    }

    const geminiResponse = await callGemini(buildInvoicePrompt(rawText))
    const extracted = parseGeminiResponse(geminiResponse)

    const result: ExtractedData = {
      supplier: extracted.supplier,
      invoice_number: extracted.invoice_number,
      date: extracted.date,
      items: extracted.items || [],
      subtotal: extracted.subtotal,
      tax: extracted.tax,
      total: extracted.total,
      confidence: extracted.confidence || 60,
      raw_text: rawText,
    }

    if (tenantId && result.supplier) {
      const existingSupplier = await db().purchases
        .where('tenantId')
        .equals(tenantId)
        .filter((p) => p.supplier?.toLowerCase() === result.supplier!.toLowerCase())
        .first()

      if (existingSupplier) {
        result.supplier = existingSupplier.supplier
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[OCR Extract] Error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Extraction failed' }, { status: 500 })
  }
}