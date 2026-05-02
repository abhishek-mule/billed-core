import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

interface ProductMatch {
  id: string
  item_name: string
  item_code: string
  barcode?: string
  rate: number
  stock_quantity: number
  matchScore: number
  matchType: 'barcode' | 'name' | 'alias' | 'code'
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fuzzyMatch(search: string, target: string, targetCode: string, aliases: string[]): { score: number; type: ProductMatch['matchType'] } {
  const searchNorm = normalizeText(search)
  const targetNorm = normalizeText(target)
  
  let bestScore = 0
  let bestType: ProductMatch['matchType'] = 'name'

  if (searchNorm === targetNorm) {
    return { score: 100, type: 'name' }
  }

  if (targetNorm.includes(searchNorm)) {
    const partialScore = Math.min(50, (searchNorm.length / targetNorm.length) * 100)
    if (partialScore > bestScore) {
      bestScore = partialScore
    }
  }

  if (targetNorm.startsWith(searchNorm)) {
    bestScore = 40
  }

  for (const alias of aliases || []) {
    const aliasNorm = normalizeText(alias)
    if (aliasNorm === searchNorm) {
      bestScore = Math.max(bestScore, 80)
      bestType = 'alias'
      break
    }
    if (aliasNorm.includes(searchNorm)) {
      bestScore = Math.max(bestScore, 35)
    }
  }

  const searchWords = searchNorm.split(' ').filter(w => w.length > 2)
  for (const word of searchWords) {
    if (targetNorm.includes(word)) {
      bestScore += 10 * word.length
    }
  }

  if (searchNorm.length >= 3 && targetNorm.length >= 3) {
    for (let i = 0; i < Math.min(searchNorm.length, targetNorm.length) - 2; i++) {
      if (searchNorm.substring(i, i + 3) === targetNorm.substring(i, i + 3)) {
        bestScore += 5
      }
    }
  }

  return { score: Math.min(bestScore, 100), type: bestType }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '10')

    if (search.length < 2) {
      return NextResponse.json({ success: true, matches: [] })
    }

    const products = await query<Record<string, any>>(
      `SELECT id, item_name, item_code, barcode, rate, stock_qty, aliases
       FROM products 
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY item_name
       LIMIT 50`,
      [session.tenantId]
    )

    const matches: ProductMatch[] = []

    for (const product of products) {
      const searchTerm = search.toLowerCase()
      
      if (product.barcode && product.barcode.includes(search)) {
        matches.push({
          id: product.id,
          item_name: product.item_name,
          item_code: product.item_code,
          barcode: product.barcode,
          rate: parseFloat(product.rate || '0'),
          stock_quantity: parseFloat(product.stock_qty || '0'),
          matchScore: 100,
          matchType: 'barcode',
        })
        continue
      }

      const fuzzyMatchResult = fuzzyMatch(search, product.item_name, product.item_code, product.aliases || [])
      const score = fuzzyMatchResult.score

      if (score > 20) {
        matches.push({
          id: product.id,
          item_name: product.item_name,
          item_code: product.item_code,
          barcode: product.barcode,
          rate: parseFloat(product.rate || '0'),
          stock_quantity: parseFloat(product.stock_qty || '0'),
          matchScore: score,
          matchType: fuzzyMatchResult.type,
        })
      }
    }

    matches.sort((a, b) => {
      if (a.matchType === 'barcode' && b.matchType !== 'barcode') return -1
      if (b.matchType === 'barcode' && a.matchType !== 'barcode') return 1
      return b.matchScore - a.matchScore
    })

    const topMatches = matches.slice(0, limit)

    console.log(`[Search] "${search}" → ${topMatches.length} matches`)

    return NextResponse.json({
      success: true,
      search,
      matches: topMatches,
      count: topMatches.length,
    })

  } catch (error) {
    console.error('[Product Search] Error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}