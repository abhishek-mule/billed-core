import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

interface AutoCorrectRequest {
  rawText: string
  extractedData: Record<string, any>
  vendorName: string
  knownCorrections: { fieldType: string; rawValue: string; correctedValue: string; count: number }[]
  tenantId?: string
}

interface CorrectionSuggestion {
  field: string
  from: string
  to: string
  confidence: number
  reason: string
}

interface AutoCorrectResponse {
  suggestions: CorrectionSuggestion[]
}

function buildPrompt(req: AutoCorrectRequest): string {
  const { rawText, extractedData, vendorName, knownCorrections } = req
  const extracted = JSON.stringify(extractedData, null, 2)
  const corrections = knownCorrections.map(c =>
    `  ${c.fieldType}: "${c.rawValue}" → "${c.correctedValue}" (applied ${c.count}x)`
  ).join('\n')

  return `You are an OCR error correction specialist for Indian invoices.

A user scanned an invoice from vendor "${vendorName || 'Unknown'}".
The OCR engine extracted these fields:
${extracted}

The raw OCR text was:
"""${(rawText || '').slice(0, 2000)}"""

Known corrections from past scans of this vendor:
${corrections || '  (none yet)'}

Task: Compare the extracted values against known corrections and the raw text. Suggest corrections for any field that likely has an OCR error.

Rules:
- Only suggest corrections where you are confident (>60%)
- For items: compare item.name against known item_name corrections
- For total: check if the total looks wrong vs past corrections
- Never suggest corrections for fields that look correct
- Consider the raw text as ground truth when it's clear

Return ONLY valid JSON:
{"suggestions": [{"field": "field_name", "from": "current_value", "to": "corrected_value", "confidence": 85, "reason": "Brief reason"}]}

If no corrections needed, return {"suggestions": []}`
}

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured')

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
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

    const req: AutoCorrectRequest = await request.json()

    if (!req.extractedData) {
      return NextResponse.json({ suggestions: [] })
    }

    const prompt = buildPrompt(req)
    const raw = await callGemini(prompt)

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ suggestions: [] })
    }

    const result: AutoCorrectResponse = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[AutoCorrect] Error:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
