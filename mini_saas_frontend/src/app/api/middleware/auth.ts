// Authentication middleware for merchant API routes
import { NextRequest, NextResponse } from 'next/server'

export interface MerchantContext {
  tenantId: string
  siteName: string
  apiKey: string
  apiSecret: string
  companyName: string
  erpSite: string
}

/**
 * Extract merchant context from Authorization header
 * Format: Bearer <base64-encoded-merchant-context>
 */
export async function extractMerchantContext(request: NextRequest): Promise<MerchantContext | null> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  try {
    const token = authHeader.slice(7)
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString())
    
    if (!decoded.tenantId || !decoded.siteName || !decoded.companyName) {
      return null
    }

    return decoded as MerchantContext
  } catch (error) {
    console.error('[Auth] Token decode failed:', error)
    return null
  }
}

/**
 * Middleware wrapper to enforce authentication on routes
 */
export async function withMerchantAuth(
  handler: (request: NextRequest, context: MerchantContext) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const merchant = await extractMerchantContext(request)

    if (!merchant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Missing or invalid authentication token.' },
        { status: 401 }
      )
    }

    try {
      return await handler(request, merchant)
    } catch (error) {
      console.error('[Merchant API] Error:', error)
      return NextResponse.json(
        { success: false, error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Generate auth token for merchant session
 */
export function generateMerchantToken(context: MerchantContext): string {
  const encoded = Buffer.from(JSON.stringify(context)).toString('base64')
  return `Bearer ${encoded}`
}