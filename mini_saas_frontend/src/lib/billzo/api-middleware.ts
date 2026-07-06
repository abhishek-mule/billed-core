/**
 * API Route Security Middleware
 * 
 * This file provides secure request verification to prevent:
 * - Unauthorized access without valid tenant/user
 * - Cross-tenant data access
 * - Invalid request payloads
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAuthPayloadFromRequest } from './auth-jwt'

export interface VerifiedRequest extends NextRequest {
  tenantId: string
  userId: string
}

export interface FieldRule {
  required?: boolean
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
  pattern?: RegExp
  min?: number
  max?: number
  message?: string
}

export interface ValidationSchema {
  fields: Record<string, FieldRule>
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
    // Verify JWT from the httpOnly access token cookie
    const payload = getAuthPayloadFromRequest(request)
    if (!payload) {
      return {
        response: NextResponse.json(
          { error: 'Unauthorized: Invalid or expired session' },
          { status: 401 }
        ),
      }
    }

    // Cross-check: ensure JWT tenantId matches the non-httpOnly cookie if both are set
    const cookieTenantId = request.cookies.get('bz_tenant')?.value
    if (payload.tenantId && cookieTenantId && payload.tenantId !== cookieTenantId) {
      return {
        response: NextResponse.json(
          { error: 'Unauthorized: Tenant mismatch' },
          { status: 401 }
        ),
      }
    }

    return { tenantId: payload.tenantId || cookieTenantId || undefined, userId: payload.userId }
  } catch (error) {
    return {
      response: NextResponse.json(
        { error: 'Invalid authorization' },
        { status: 401 }
      ),
    }
  }
}

/**
 * Validate request body is valid JSON and optionally validate fields
 * against a schema. Returns typed data or an error response.
 * 
 * @example
 * const body = await validateJsonBody<{ customerId: string }>(request, {
 *   fields: { customerId: { required: true, type: 'string' } }
 * })
 * if (body.response) return body.response
 * body.data.customerId // typed as string
 */
export async function validateJsonBody<T = Record<string, any>>(
  request: NextRequest,
  schema?: ValidationSchema
): Promise<{
  data?: T
  response?: NextResponse
}> {
  try {
    const data = await request.json()

    if (schema) {
      const errors: Record<string, string> = {}
      for (const [field, rules] of Object.entries(schema.fields)) {
        const value = data[field]

        if (rules.required && (value === undefined || value === null || value === '')) {
          errors[field] = rules.message || `${field} is required`
          continue
        }

        if (value === undefined || value === null) continue

        if (rules.type && typeof value !== rules.type) {
          errors[field] = rules.message || `${field} must be a ${rules.type}`
          continue
        }

        if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
          errors[field] = rules.message || `${field} format is invalid`
          continue
        }

        if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
          errors[field] = rules.message || `${field} must be at least ${rules.min}`
          continue
        }

        if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
          errors[field] = rules.message || `${field} must be at most ${rules.max}`
          continue
        }
      }

      if (Object.keys(errors).length > 0) {
        return {
          response: NextResponse.json(
            { error: 'Validation failed', fields: errors },
            { status: 400 }
          ),
        }
      }
    }

    return { data: data as T }
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
    if (data[field] === undefined || data[field] === null) {
      errors[field] = `${field} is required`
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }
}

/**
 * Validate URL path parameters
 */
export function validateParams(
  params: Record<string, string | undefined>,
  required: string[]
): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {}

  for (const field of required) {
    if (!params[field]) {
      errors[field] = `${field} is required in URL path`
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }
}

/**
 * Validate query string parameters against a schema
 */
export function validateQuery(
  searchParams: URLSearchParams,
  schema: ValidationSchema
): { data?: Record<string, string>; response?: NextResponse } {
  const data: Record<string, string> = {}
  const errors: Record<string, string> = {}

  for (const [field, rules] of Object.entries(schema.fields)) {
    const value = searchParams.get(field)

    if (rules.required && (value === null || value === '')) {
      errors[field] = rules.message || `${field} is required in query`
      continue
    }

    if (value !== null) {
      data[field] = value
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      response: NextResponse.json(
        { error: 'Invalid query parameters', fields: errors },
        { status: 400 }
      ),
    }
  }

  return { data }
}

/**
 * Validate webhook signature using HMAC-SHA256
 */
export function validateWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

/**
 * Validate phone number format (Indian)
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone must be a string' }
  }

  const cleaned = phone.replace(/[^\d+]/g, '')

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
