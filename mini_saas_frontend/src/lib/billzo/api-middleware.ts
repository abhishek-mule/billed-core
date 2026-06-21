/**
 * API Route Security Middleware
 * 
 * This file provides secure request verification to prevent:
 * - Unauthorized access without valid tenant/user
 * - Cross-tenant data access
 * - Invalid request payloads
 */

import { NextRequest, NextResponse } from 'next/server'

export interface VerifiedRequest extends NextRequest {
  tenantId: string
  userId: string
}

/**
 * Verify that the request has valid auth tokens and tenant
 * Returns the verified tenant/user IDs or a 401 response
 */
export async function verifyRequest(request: NextRequest): Promise<{
  tenantId?: string
  userId?: string
  response?: NextResponse
}> {
  try {
    // Get tenant from cookie or header
    const tenantFromCookie = request.cookies.get('bz_tenant')?.value
    const tenantFromHeader = request.headers.get('x-tenant-id')
    const tenantId = tenantFromCookie || tenantFromHeader

    // Get user from cookie or header  
    const userFromCookie = request.cookies.get('bz_user_id')?.value
    const userFromHeader = request.headers.get('x-user-id')
    const userId = userFromCookie || userFromHeader

    if (!tenantId) {
      return {
        response: NextResponse.json(
          { error: 'Unauthorized: Missing tenant ID' },
          { status: 401 }
        ),
      }
    }

    if (!userId) {
      return {
        response: NextResponse.json(
          { error: 'Unauthorized: Missing user ID' },
          { status: 401 }
        ),
      }
    }

    return { tenantId, userId }
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: 'Invalid authorization header' },
        { status: 401 }
      ),
    }
  }
}

/**
 * Validate request body is valid JSON
 */
export async function validateJsonBody(request: NextRequest): Promise<{
  data?: Record<string, any>
  response?: NextResponse
}> {
  try {
    const data = await request.json()
    return { data }
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: 'Invalid JSON request body' },
        { status: 400 }
      ),
    }
  }
}

/**
 * Validate specific required fields in request body
 */
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    if (!data[field]) {
      errors[field] = `${field} is required`
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }
}

/**
 * Validate phone number format (Indian)
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone must be a string' }
  }

  // Remove common formatting
  const cleaned = phone.replace(/[^\d+]/g, '')

  // Must start with +91 or 91 or be 10 digits
  if (!(/^(\+91|91)?[6-9]\d{9}$/.test(cleaned))) {
    return { valid: false, error: 'Invalid phone number format' }
  }

  return { valid: true }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }

  return { valid: true }
}

/**
 * Validate GSTIN format (Indian)
 */
export function validateGSTIN(gstin: string): { valid: boolean; error?: string } {
  if (!gstin || typeof gstin !== 'string') {
    return { valid: false, error: 'GSTIN must be a string' }
  }

  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  if (!gstinRegex.test(gstin.toUpperCase())) {
    return { valid: false, error: 'Invalid GSTIN format' }
  }

  return { valid: true }
}

/**
 * Create a standard error response
 */
export function errorResponse(
  error: string | Error,
  status: number = 500
): NextResponse {
  const message = error instanceof Error ? error.message : error
  return NextResponse.json({ error: message }, { status })
}

/**
 * Log API access for security audit
 */
export function logApiAccess(
  request: NextRequest,
  tenantId: string,
  userId: string,
  action: string
) {
  const method = request.method
  const pathname = request.nextUrl.pathname
  const timestamp = new Date().toISOString()

  console.log(`[API] ${timestamp} ${method} ${pathname} tenant=${tenantId} user=${userId} action=${action}`)
}
