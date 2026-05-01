import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'
import { extractInvoiceData, findBestSupplierMatch, findBestProductMatch } from '@/lib/ocr-processor'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = session
    const body = await request.json()
    const { imageData } = body

    if (!imageData) {
      return NextResponse.json({ error: 'Image data required' }, { status: 400 })
    }

    // Step 1: Extract invoice data using Tesseract.js (free, fast)
    const extractedData = await extractInvoiceData(imageData)

    // Step 2: Get existing suppliers for fuzzy matching
    const suppliers = await query<any>(
      `SELECT id, customer_name as name 
       FROM customers 
       WHERE tenant_id = $1 AND is_active = true 
       LIMIT 100`,
      [tenantId]
    )

    // Step 3: Get existing products for fuzzy matching
    const products = await query<any>(
      `SELECT id, item_name as name, item_code 
       FROM products 
       WHERE tenant_id = $1 AND is_active = true 
       LIMIT 500`,
      [tenantId]
    )

    // Step 4: Match supplier
    let matchedSupplier = null
    if (extractedData.supplierName) {
      matchedSupplier = findBestSupplierMatch(extractedData.supplierName, suppliers)
    }

    // Step 5: Match products
    const matchedItems = extractedData.lineItems.map(item => {
      const productMatch = findBestProductMatch(item.itemName, products)
      return {
        ...item,
        matchedProduct: productMatch,
        matchType: productMatch ? 'FUZZY' : 'MANUAL',
        matchScore: productMatch?.confidence || 0
      }
    })

    // Step 6: Calculate overall confidence
    const overallConfidence = calculateOverallConfidence(extractedData, matchedSupplier, matchedItems)

    return NextResponse.json({
      success: true,
      extractedData: {
        supplier: matchedSupplier || {
          name: extractedData.supplierName || 'Unknown Supplier',
          id: null,
          confidence: 0
        },
        items: matchedItems,
        invoiceNumber: extractedData.invoiceNumber,
        invoiceDate: extractedData.invoiceDate,
        total: extractedData.totalAmount,
        confidence: overallConfidence,
        rawText: extractedData.rawText
      }
    })

  } catch (error: any) {
    console.error('[OCR Processing] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process invoice image', details: error.message },
      { status: 500 }
    )
  }
}

function calculateOverallConfidence(
  extractedData: any,
  supplierMatch: any,
  matchedItems: any[]
): number {
  let confidence = extractedData.confidence

  // Boost for supplier match
  if (supplierMatch && supplierMatch.confidence > 0.8) {
    confidence += 0.1
  }

  // Boost for product matches
  const highConfidenceMatches = matchedItems.filter(item => item.matchScore > 0.8).length
  if (highConfidenceMatches > 0) {
    confidence += (highConfidenceMatches / matchedItems.length) * 0.1
  }

  // Reduce if critical data missing
  if (!extractedData.totalAmount) {
    confidence -= 0.2
  }

  if (matchedItems.length === 0) {
    confidence -= 0.3
  }

  return Math.min(Math.max(confidence, 0), 1)
}