import { NextRequest, NextResponse } from 'next/server'
import Tesseract from 'tesseract.js'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

interface ProductMatch {
  id: string
  item_name: string
  item_code: string
  rate: number
  matchScore: number
  matchedOn: string[]
}

function cleanOCRText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeywords(text: string): string[] {
  const cleaned = cleanOCRText(text).toUpperCase()
  const keywords: string[] = []
  
  const patterns = [
    /([A-Z]{2,}\d+)/g,
    /(\d+(?:W|HP|KW|G|KG|MM|ML)\b)/gi,
    /([A-Z][A-Z]+)/g,
  ]
  
  for (const pattern of patterns) {
    const matches = cleaned.match(pattern)
    if (matches) keywords.push(...matches)
  }
  
  if (keywords.length === 0 && cleaned.length > 0) {
    keywords.push(...cleaned.split(' ').filter(w => w.length > 2))
  }
  
  return Array.from(new Set(keywords)).slice(0, 10)
}

function fuzzyMatchScore(ocrText: string, productName: string, productCode: string, aliases: string[]): { score: number; matchedOn: string[] } {
  const ocr = ocrText.toUpperCase()
  const name = productName.toUpperCase()
  const code = productCode.toUpperCase()
  
  let score = 0
  const matchedOn: string[] = []
  
  for (const a of [name, code, ...(aliases || [])]) {
    const upper = a.toUpperCase()
    if (upper.length < 2) continue
    
    if (ocr.includes(upper)) {
      score += 30
      matchedOn.push('exact')
    } else {
      const ocrWords = ocr.split(' ')
      for (const ow of ocrWords) {
        if (ow.length > 2 && upper.includes(ow)) {
          score += 15
          matchedOn.push('partial')
        }
      }
    }
  }
  
  return { score, matchedOn: Array.from(new Set(matchedOn)) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = file.type || 'image/png'

    console.log('[OCR] Starting OCR processing, file size:', buffer.length)

    const result = await Tesseract.recognize(`data:${mimeType};base64,${base64}`, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`)
        }
      },
    })

    const ocrText = result.data.text
    const confidence = result.data.confidence

    console.log('[OCR] Raw text:', ocrText)
    console.log('[OCR] Confidence:', confidence)

    if (ocrText.trim().length < 3) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract text from image',
        suggestions: [],
      })
    }

    const keywords = extractKeywords(ocrText)
    console.log('[OCR] Keywords:', keywords)

    const products = await query<Record<string, any>>(
      `SELECT id, item_name, item_code, rate, aliases 
       FROM products 
       WHERE tenant_id = $1 AND is_active = true
       LIMIT 50`,
      [session.tenantId]
    )

    const matches: ProductMatch[] = []

    for (const product of products) {
      const ocrResult = fuzzyMatchScore(
        ocrText,
        product.item_name,
        product.item_code,
        product.aliases || []
      )

      if (ocrResult.score > 0) {
        matches.push({
          id: product.id,
          item_name: product.item_name,
          item_code: product.item_code,
          rate: parseFloat(product.rate || '0'),
          matchScore: ocrResult.score,
          matchedOn: ocrResult.matchedOn,
        })
      }
    }

    matches.sort((a, b) => b.matchScore - a.matchScore)
    const topMatches = matches.slice(0, 5)

    console.log('[OCR] Matches found:', topMatches.length)

    return NextResponse.json({
      success: true,
      ocrText: cleanOCRText(ocrText),
      confidence,
      keywords,
      matches: topMatches,
      matchCount: topMatches.length,
    })

  } catch (error) {
    console.error('[Magic Scan OCR] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'OCR processing failed',
      matches: [],
    })
  }
}